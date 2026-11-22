/**
 * PaiBot – bringt die App für die Doku-Bilder über ihre echten Wege in einen vorzeigbaren Zustand,
 * nur mit erfundenen Daten.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

// pnpm doku:beispieldaten                  App aus `pnpm doku:app` einrichten und mit Beispielen füllen
// pnpm doku:beispieldaten --nur-einrichten  nur einrichten
//
// Alles läuft über die Schnittstellen der App, so wie der Browser sie nutzt (Prüfzeichen aus der
// Seite, Herkunft, Cookie), nie direkt in die Datenbank:
//   Einrichtung   POST /api/einrichtung mit dem Code aus dem Log, dem Wegwerf-Passwort, dem
//                 Schlüssel des Test-Anbieters, einem Beispiel-Modell, Datenschleuse aus, Bot „Pai“.
//   Unterhaltungen POST /api/unterhaltungen und POST /api/unterhaltungen/:id/nachrichten; die
//                 Antworten kommen vom Test-Anbieter mit vorgegebenem Text. Gibt es diese Routen in
//                 der App noch nicht (404), bleibt es bei der Einrichtung, mit Hinweis.
//
// Nur gegen eine App auf dem eigenen Rechner (Adresse aus der Lauf-Datei von `pnpm doku:app`).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ANBIETER_STANDARD, aendereLauf, laufDatei, leseLauf } from "./doku/lauf.mjs";

/** Erfundene Unterhaltungen: Titel, Frage und die Antwort, die der Test-Anbieter gibt. */
export const BEISPIEL_UNTERHALTUNGEN = [
  {
    titel: "Antwort an Max Mustermann",
    frage:
      "Schreib eine kurze, freundliche Antwort an Max Mustermann: Der Termin am Donnerstag passt.",
    antwort:
      "Hallo Max,\n\ndanke für deine Nachricht. Donnerstag passt mir gut, ich freue mich auf das Gespräch.\n\nViele Grüße",
  },
  {
    titel: "Wochenplan sortieren",
    frage:
      "Sortier meine Aufgaben für diese Woche: Angebot schreiben, Steuerunterlagen, Website-Text.",
    antwort:
      "Vorschlag: Montag das Angebot, Mittwoch der Website-Text, Freitag die Steuerunterlagen. So liegt das Dringende vorn.",
  },
  {
    titel: "Ideen für den Newsletter",
    frage: "Gib mir drei Themen für den nächsten Newsletter.",
    antwort:
      "1. Rückblick auf den Monat\n2. Ein Werkzeug, das dir Zeit spart\n3. Eine Frage an die Leser",
  },
];

/** Kleiner Cookie-Speicher für eine Adresse. */
export class Keksdose {
  #kekse = new Map();
  nimm(antwort) {
    for (const zeile of antwort.headers.getSetCookie?.() ?? []) {
      const [paar, ...attribute] = zeile.split(";");
      const gleich = paar.indexOf("=");
      const name = paar.slice(0, gleich).trim();
      const wert = paar.slice(gleich + 1).trim();
      const abgelaufen = attribute.some((a) => /^\s*max-age=0\s*$/i.test(a)) || wert === "";
      if (abgelaufen) this.#kekse.delete(name);
      else this.#kekse.set(name, wert);
    }
  }
  kopf() {
    return [...this.#kekse].map(([n, w]) => `${n}=${w}`).join("; ");
  }
  hat(name) {
    return [...this.#kekse.keys()].some((k) => k === name || k.endsWith(`-${name}`));
  }
  /** Ein Cookie mit Namen und Wert (auch mit Präfix wie `__Host-`), sonst `undefined`. */
  finde(name) {
    for (const [k, wert] of this.#kekse) {
      if (k === name || k.endsWith(`-${name}`)) return { name: k, wert };
    }
    return undefined;
  }
  setze(name, wert) {
    this.#kekse.set(name, wert);
  }
}

/** Name des Geräte-Cookies der App (bei https mit Präfix `__Host-`). */
export const GERAETE_COOKIE = "pb_geraet";

/**
 * Geräte-Cookie aus den Cookies eines Browsers (Form von Playwright: `{ name, value }`), sonst
 * `undefined`. So merkt sich der Aufnahme-Lauf das Gerät seiner ersten Anmeldung.
 */
export function geraetAusKeksen(kekse) {
  const keks = (kekse ?? []).find(
    (k) => k.name === GERAETE_COOKIE || k.name.endsWith(`-${GERAETE_COOKIE}`),
  );
  return keks ? { name: keks.name, wert: keks.value } : undefined;
}

/**
 * Das gemerkte Beispiel-Gerät als Cookie für einen Browser (Playwright `addCookies`), sonst
 * `undefined`. Damit ist jede Anmeldung des Laufs dasselbe bekannte Gerät.
 */
export function geraetAlsKeks(lauf) {
  const g = lauf?.beispielGeraet;
  if (!g?.name || !g?.wert || !lauf?.url) return undefined;
  return { name: g.name, value: g.wert, url: lauf.url };
}

/** Kennung des Browsers für die Besuche dieses Skripts: ein zweites, erfundenes Gerät in der Liste der Sitzungen. */
export const BEISPIEL_GERAET =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0";

/** Ein Besuch der App wie im Browser: Seite laden (Cookie, Prüfzeichen), dann Schnittstellen. */
export class Besuch {
  /** `kennung`: Browser-Kennung der Besuche (Standard `BEISPIEL_GERAET`). */
  constructor(url, kennung = BEISPIEL_GERAET) {
    this.url = url.replace(/\/+$/, "");
    this.kennung = kennung;
    this.dose = new Keksdose();
    this.pruefzeichen = undefined;
  }

  /** Lädt eine Seite und merkt sich Cookie und Prüfzeichen aus `<meta name="pb-pruefzeichen">`. */
  async seite(pfad) {
    const antwort = await fetch(`${this.url}${pfad}`, {
      headers: { cookie: this.dose.kopf(), "user-agent": this.kennung },
      redirect: "manual",
    });
    this.dose.nimm(antwort);
    const html = await antwort.text();
    const treffer = /<meta name="pb-pruefzeichen" content="([^"]+)"/.exec(html);
    if (treffer) this.pruefzeichen = treffer[1];
    return { status: antwort.status, ort: antwort.headers.get("location"), html };
  }

  /** Ruft eine Schnittstelle auf; liefert Status und die ausgepackte Hülle. */
  async api(methode, pfad, koerper) {
    const kopf = {
      cookie: this.dose.kopf(),
      accept: "application/json",
      "user-agent": this.kennung,
    };
    if (methode !== "GET") {
      kopf.origin = this.url;
      kopf["content-type"] = "application/json";
      if (this.pruefzeichen) kopf["x-pb-pruefzeichen"] = this.pruefzeichen;
    }
    const antwort = await fetch(`${this.url}${pfad}`, {
      method: methode,
      headers: kopf,
      redirect: "manual",
      ...(koerper === undefined ? {} : { body: JSON.stringify(koerper) }),
    });
    this.dose.nimm(antwort);
    let daten;
    try {
      daten = await antwort.json();
    } catch {
      daten = undefined;
    }
    return { status: antwort.status, daten };
  }
}

function fehlerText(ergebnis) {
  const f = ergebnis.daten?.fehler;
  return f ? `${f.code ?? ""} ${f.text ?? ""}`.trim() : `Status ${ergebnis.status}`;
}

/** Ist die App schon eingerichtet? (GET /api/einrichtung, offen vor der Einrichtung) */
export async function istEingerichtet(url) {
  const antwort = await fetch(`${url}/einrichtung`, { redirect: "manual" });
  if (antwort.status === 200) return false;
  if (antwort.status >= 300 && antwort.status < 400) return true;
  throw new Error(`Die Seite „Einrichtung“ antwortet mit ${antwort.status}.`);
}

/** Richtet die frische App mit den Werten des Laufs ein (wie der letzte Schritt im Browser). */
export async function richteEin(lauf) {
  const besuch = new Besuch(lauf.url);
  const seite = await besuch.seite("/einrichtung");
  if (seite.status !== 200)
    throw new Error(`Die App ist schon eingerichtet (Status ${seite.status}).`);
  const ergebnis = await besuch.api("POST", "/api/einrichtung", {
    setupCode: lauf.einrichtungsCode,
    password: lauf.passwort,
    passwordRepeat: lauf.passwort,
    apiKey: lauf.anbieterSchluessel,
    modelSlug: lauf.modell,
    schleuseModeDefault: "off",
    botName: "Pai",
    timezone: "Europe/Berlin",
  });
  if (ergebnis.status !== 200 || ergebnis.daten?.ok !== true) {
    throw new Error(`Einrichtung fehlgeschlagen: ${fehlerText(ergebnis)}`);
  }
  return besuch;
}

/**
 * Meldet sich mit dem Wegwerf-Passwort an; der Besuch trägt danach die Sitzung. Mit dem
 * Geräte-Cookie aus der Einrichtung (`lauf.beispielGeraet`) ist es dasselbe bekannte Beispiel-Gerät,
 * kein neues; sonst sähen alle anderen Geräte (der Browser der Aufnahmen) den Hinweis auf eine neue
 * Anmeldung. Das Geräte-Cookie gilt nur in derselben Art Browser wie beim Anlegen; deshalb nutzt der
 * Besuch die Browser-Kennung, die mit dem Gerät gemerkt wurde (`lauf.beispielGeraet.kennung`).
 */
export async function meldeAn(lauf) {
  const besuch = new Besuch(lauf.url, lauf.beispielGeraet?.kennung ?? BEISPIEL_GERAET);
  if (lauf.beispielGeraet?.name && lauf.beispielGeraet?.wert) {
    besuch.dose.setze(lauf.beispielGeraet.name, lauf.beispielGeraet.wert);
  }
  await besuch.seite("/anmelden");
  const ergebnis = await besuch.api("POST", "/api/zugang/anmelden", {
    password: lauf.passwort,
    remember: false,
  });
  if (ergebnis.status !== 200 || ergebnis.daten?.ok !== true) {
    throw new Error(`Anmelden fehlgeschlagen: ${fehlerText(ergebnis)}`);
  }
  // Prüfzeichen der Sitzung (es hängt an der Sitzung, nicht am Vorab-Cookie)
  await besuch.seite("/");
  return besuch;
}

export async function steuereAnbieter(lauf, verhalten) {
  const antwort = await fetch(`${lauf.anbieterUrl}/_steuerung/verhalten`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(verhalten),
  });
  if (!antwort.ok) throw new Error(`Test-Anbieter: Steuerung antwortet ${antwort.status}.`);
}

async function warteAufAntwort(besuch, id, sekunden = 60) {
  const ende = Date.now() + sekunden * 1000;
  while (Date.now() < ende) {
    const liste = await besuch.api("GET", `/api/unterhaltungen/${id}/nachrichten`);
    const nachrichten = liste.daten?.daten?.nachrichten ?? liste.daten?.daten ?? [];
    const antwort = Array.isArray(nachrichten)
      ? nachrichten.find((n) => n.role === "assistant" && n.status !== "streaming")
      : undefined;
    if (antwort) return antwort;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Keine Antwort in der Unterhaltung ${id} nach ${sekunden} s.`);
}

/**
 * Legt die Beispiel-Unterhaltungen an, wenn die App die Chat-Routen hat. Liefert die Zahl der
 * angelegten Unterhaltungen und einen Hinweis, falls die Routen fehlen.
 */
export async function legeUnterhaltungenAn(lauf, besuch) {
  const probe = await besuch.api("GET", "/api/unterhaltungen");
  if (probe.status === 404 || probe.status === 405) {
    return {
      anzahl: 0,
      hinweis:
        "Unterhaltungen übersprungen: Die App hat die Chat-Route (/api/unterhaltungen) noch nicht.",
    };
  }
  if (probe.status !== 200) throw new Error(`/api/unterhaltungen: ${fehlerText(probe)}`);
  let anzahl = 0;
  try {
    for (const beispiel of BEISPIEL_UNTERHALTUNGEN) {
      await steuereAnbieter(lauf, { reply: beispiel.antwort });
      const neu = await besuch.api("POST", "/api/unterhaltungen", { title: beispiel.titel });
      const id = neu.daten?.daten?.unterhaltung?.id ?? neu.daten?.daten?.id;
      if ((neu.status !== 200 && neu.status !== 201) || typeof id !== "string") {
        throw new Error(`Unterhaltung anlegen: ${fehlerText(neu)}`);
      }
      const gesendet = await besuch.api("POST", `/api/unterhaltungen/${id}/nachrichten`, {
        text: beispiel.frage,
        schleuse: "off",
      });
      if (gesendet.status !== 200 && gesendet.status !== 202) {
        throw new Error(`Nachricht senden: ${fehlerText(gesendet)}`);
      }
      await warteAufAntwort(besuch, id);
      anzahl += 1;
    }
  } finally {
    await steuereAnbieter(lauf, ANBIETER_STANDARD);
  }
  return { anzahl };
}

/** Stellt den Zustand `ziel` her ("eingerichtet" oder "mit-beispieldaten"); schreibt ihn in die Lauf-Datei. */
export async function stelleHer(ziel, datei = laufDatei()) {
  let lauf = leseLauf(datei);
  if (lauf === undefined)
    throw new Error("Keine Lauf-Datei gefunden. Erst `pnpm doku:app` starten.");
  const meldungen = [];
  if (!(await istEingerichtet(lauf.url))) {
    const besuch = await richteEin(lauf);
    // Geräte-Cookie merken: spätere Anmeldungen dieses Skripts sind dann dasselbe Gerät.
    const geraet = besuch.dose.finde(GERAETE_COOKIE);
    if (geraet !== undefined) lauf = aendereLauf({ beispielGeraet: geraet }, datei);
    meldungen.push("Eingerichtet: Bot „Pai“, Beispiel-Modell, Test-Anbieter, Datenschleuse aus.");
  }
  if (lauf.zustand === "frisch") lauf = aendereLauf({ zustand: "eingerichtet" }, datei);
  const mitDaten = ziel === "mit-beispieldaten" || ziel === "mit-apps";
  if (mitDaten && !["mit-beispieldaten", "mit-apps"].includes(lauf.zustand)) {
    const besuch = await meldeAn(lauf);
    const ergebnis = await legeUnterhaltungenAn(lauf, besuch);
    meldungen.push(ergebnis.hinweis ?? `${ergebnis.anzahl} Beispiel-Unterhaltungen angelegt.`);
    lauf = aendereLauf({ zustand: "mit-beispieldaten", unterhaltungen: ergebnis.anzahl }, datei);
  }
  if (ziel === "mit-apps" && lauf.zustand !== "mit-apps") {
    if (!lauf.steuerung)
      throw new Error("Die Lauf-Datei kennt keine Steuerung (pnpm doku:app neu starten).");
    const antwort = await fetch(`${lauf.steuerung.url}/beispiel-apps`, {
      method: "POST",
      headers: { authorization: `Bearer ${lauf.steuerung.token}` },
    });
    if (!antwort.ok) {
      const grund = await antwort.json().then(
        (d) => d.fehler,
        () => undefined,
      );
      throw new Error(
        `Beispiel-Apps: Steuerung antwortet ${antwort.status}${grund ? `: ${grund}` : ""}.`,
      );
    }
    const daten = await antwort.json();
    meldungen.push(`${daten.angelegt} Beispiel-Apps angelegt.`);
    lauf = aendereLauf({ zustand: "mit-apps" }, datei);
  }
  return { lauf, meldungen };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const nurEinrichten = process.argv.includes("--nur-einrichten");
  try {
    const { lauf, meldungen } = await stelleHer(
      nurEinrichten ? "eingerichtet" : "mit-beispieldaten",
    );
    for (const m of meldungen) console.log(m);
    console.log(`Zustand der App unter ${lauf.url}: ${lauf.zustand}.`);
  } catch (error) {
    console.error(`Fehler: ${error.message}`);
    process.exit(1);
  }
}
