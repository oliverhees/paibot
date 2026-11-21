/**
 * PaiBot – Beispiel-Datenschleuse für die Doku-Bilder: eine kleine lokale Attrappe, die sich nach
 * außen wie die Datenschleuse verhält, aber nichts maskiert.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

// Nur für die Beispiel-Umgebung von `pnpm doku:app`, nie für den Betrieb. Sie läuft nur an
// 127.0.0.1 und kennt drei Zustände, die der Worker bei seiner Prüfung sieht:
//   bereit             Lebenszeichen 200, Modell-Liste mit dem richtigen Schlüssel 200
//   schluessel_falsch  Lebenszeichen 200, Modell-Liste 401 (wie bei falschem SCHLEUSE_KEY)
//   nicht_erreichbar   Lebenszeichen 503
// Chat-Anfragen (`POST /v1/chat/completions`) reicht sie im Zustand „bereit“ unverändert an den
// Test-Anbieter weiter: Modellname ohne den Vorsatz `<anbieter>/`, der Schlüssel des Anbieters aus
// dem Feld `api_key` als Authorization. Es gibt keine Masken; die Bilder zeigen nur den Weg.
import http from "node:http";

export const ATTRAPPE_ZUSTAENDE = ["bereit", "schluessel_falsch", "nicht_erreichbar"];

function json(antwort, status, daten) {
  antwort.writeHead(status, { "content-type": "application/json" });
  antwort.end(JSON.stringify(daten));
}

function leseKoerper(anfrage, grenze = 1_000_000) {
  return new Promise((resolve, reject) => {
    let groesse = 0;
    const teile = [];
    anfrage.on("data", (teil) => {
      groesse += teil.length;
      if (groesse > grenze) {
        reject(new Error("zu groß"));
        anfrage.destroy();
      } else teile.push(teil);
    });
    anfrage.on("end", () => resolve(Buffer.concat(teile).toString("utf8")));
    anfrage.on("error", reject);
  });
}

/**
 * Antwort der Attrappe auf eine Anfrage, ohne Netz: Status und Körper für Lebenszeichen und
 * Modell-Liste; `{ weiter: { model, apiKey, koerper } }` für eine Chat-Anfrage, die an den
 * Test-Anbieter geht. Rein, damit Tests es direkt prüfen können.
 */
export function antwortDerAttrappe({ zustand, schluessel, methode, pfad, kopf, koerper }) {
  const angemeldet = kopf.authorization === `Bearer ${schluessel}`;
  if (methode === "GET" && pfad === "/health/liveliness") {
    return zustand === "nicht_erreichbar"
      ? { status: 503, daten: { status: "nicht bereit" } }
      : { status: 200, daten: "I'm alive!" };
  }
  if (zustand === "nicht_erreichbar") return { status: 503, daten: { error: "nicht bereit" } };
  if (!angemeldet || zustand === "schluessel_falsch") {
    return { status: 401, daten: { error: { message: "Authentication Error", code: "401" } } };
  }
  if (methode === "GET" && pfad === "/v1/models") {
    return { status: 200, daten: { object: "list", data: [] } };
  }
  if (methode === "POST" && pfad === "/v1/chat/completions") {
    let eingabe;
    try {
      eingabe = JSON.parse(koerper);
    } catch {
      return { status: 400, daten: { error: { message: "kein JSON" } } };
    }
    if (!eingabe || typeof eingabe !== "object" || typeof eingabe.model !== "string") {
      return { status: 400, daten: { error: { message: "model fehlt" } } };
    }
    const { api_key: apiKey, ...rest } = eingabe;
    const model = eingabe.model.includes("/")
      ? eingabe.model.slice(eingabe.model.indexOf("/") + 1)
      : eingabe.model;
    return {
      weiter: { apiKey: typeof apiKey === "string" ? apiKey : "", koerper: { ...rest, model } },
    };
  }
  return { status: 404, daten: { error: "unbekannt" } };
}

/** Startet die Attrappe an 127.0.0.1; `anbieterUrl` ist die Adresse des Test-Anbieters (ohne /v1). */
export function starteAttrappe({ port = 0, schluessel, anbieterUrl, zustand = "bereit" }) {
  let jetzt = zustand;
  const server = http.createServer(async (anfrage, antwort) => {
    try {
      const pfad = new URL(anfrage.url ?? "/", "http://127.0.0.1").pathname;
      const koerper = anfrage.method === "POST" ? await leseKoerper(anfrage) : "";
      const ergebnis = antwortDerAttrappe({
        zustand: jetzt,
        schluessel,
        methode: anfrage.method,
        pfad,
        kopf: anfrage.headers,
        koerper,
      });
      if (!ergebnis.weiter) return json(antwort, ergebnis.status, ergebnis.daten);
      const weiter = await fetch(`${anbieterUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${ergebnis.weiter.apiKey}`,
        },
        body: JSON.stringify(ergebnis.weiter.koerper),
      });
      antwort.writeHead(weiter.status, {
        "content-type": weiter.headers.get("content-type") ?? "application/json",
      });
      if (weiter.body) for await (const teil of weiter.body) antwort.write(teil);
      antwort.end();
    } catch {
      if (!antwort.headersSent) json(antwort, 502, { error: "Attrappe" });
      else antwort.end();
    }
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const { port: echt } = server.address();
      resolve({
        url: `http://127.0.0.1:${echt}`,
        setzeZustand(neu) {
          if (!ATTRAPPE_ZUSTAENDE.includes(neu)) throw new Error(`Unbekannter Zustand: ${neu}`);
          jetzt = neu;
        },
        stop: () => new Promise((fertig) => server.close(() => fertig())),
      });
    });
  });
}
