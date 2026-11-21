/**
 * PaiBot – Prüfung im Docker-Stack ohne Weg nach draußen, nur über HTTP gegen die Web-App:
 * Einrichtung mit Code und Test-Anbieter, eine Nachricht mit Antwort, Kette der Belege laden,
 * Export speichern und mit dem eigenständigen Prüfer prüfen. Ohne Browser, ohne Abhängigkeiten.
 *
 * Umgebung: PAIBOT_PRUEF_URL (Adresse der Web-App, z. B. http://web:3000), PAIBOT_PRUEF_HERKUNFT
 * (APP_URL der Web-App, gilt als Origin), PAIBOT_PRUEF_CODE (Einrichtungs-Code),
 * PAIBOT_PRUEF_ANBIETER_SCHLUESSEL, PAIBOT_PRUEF_AUSGABE (Ordner für Export und Ergebnis),
 * optional PAIBOT_PRUEF_BELEGE_PRUEFER (Pfad zu `belege-pruefen.mjs`). Exit 0 = bestanden.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const umgebung = (name, standard) => {
  const wert = process.env[name] ?? standard;
  if (wert === undefined || wert === "") {
    console.error(`[ohne-internet] ${name} fehlt.`);
    process.exit(2);
  }
  return wert;
};
const BASIS = umgebung("PAIBOT_PRUEF_URL").replace(/\/+$/, "");
const HERKUNFT = new URL(umgebung("PAIBOT_PRUEF_HERKUNFT")).origin;
const CODE = umgebung("PAIBOT_PRUEF_CODE");
const ANBIETER_SCHLUESSEL = umgebung("PAIBOT_PRUEF_ANBIETER_SCHLUESSEL");
const AUSGABE = path.resolve(umgebung("PAIBOT_PRUEF_AUSGABE"));
const PRUEFER = process.env.PAIBOT_PRUEF_BELEGE_PRUEFER;
const PASSWORT = `Beispiel-${randomBytes(9).toString("base64url")}-Satz`;
const log = (text) => console.log(`[ohne-internet] ${text}`);

mkdirSync(AUSGABE, { recursive: true });
const ergebnis = { schritte: [] };
const cookies = new Map();

/** Merkt sich Cookies aus `Set-Cookie` (gelöschte mit `Max-Age=0` werden entfernt). */
function merkeCookies(antwort) {
  for (const zeile of antwort.headers.getSetCookie?.() ?? []) {
    const [paar, ...attribute] = zeile.split(";");
    const i = paar.indexOf("=");
    const name = paar.slice(0, i).trim();
    const wert = paar.slice(i + 1).trim();
    if (wert === "" || attribute.some((a) => /^\s*max-age=0\s*$/i.test(a))) cookies.delete(name);
    else cookies.set(name, wert);
  }
}

async function anfrage(methode, pfad, { json, pruefzeichen, accept = "application/json" } = {}) {
  const kopf = { accept };
  if (cookies.size > 0) {
    kopf.cookie = [...cookies].map(([n, w]) => `${n}=${w}`).join("; ");
  }
  if (methode !== "GET") {
    kopf.origin = HERKUNFT;
    if (pruefzeichen) kopf["x-pb-pruefzeichen"] = pruefzeichen;
  }
  if (json !== undefined) kopf["content-type"] = "application/json";
  const antwort = await fetch(`${BASIS}${pfad}`, {
    method: methode,
    headers: kopf,
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
    ...(json === undefined ? {} : { body: JSON.stringify(json) }),
  });
  merkeCookies(antwort);
  return antwort;
}

async function jsonVon(antwort, erwartet) {
  const text = await antwort.text();
  if (!erwartet.includes(antwort.status)) {
    throw new Error(`HTTP ${antwort.status} statt ${erwartet.join("/")}: ${text.slice(0, 400)}`);
  }
  return text === "" ? undefined : JSON.parse(text);
}

/** Prüfzeichen aus `<meta name="pb-pruefzeichen">` einer Seite. */
async function pruefzeichenVon(pfad) {
  const antwort = await anfrage("GET", pfad, { accept: "text/html" });
  const html = await antwort.text();
  if (antwort.status !== 200) throw new Error(`${pfad}: HTTP ${antwort.status}.`);
  const treffer = /<meta[^>]*name="pb-pruefzeichen"[^>]*content="([^"]+)"/.exec(html);
  if (!treffer) throw new Error(`${pfad}: kein Prüfzeichen in der Seite.`);
  return treffer[1];
}

const warte = (ms) => new Promise((fertig) => setTimeout(fertig, ms));

async function schritt(name, fn) {
  const start = Date.now();
  try {
    const wert = await fn();
    ergebnis.schritte.push({ name, ok: true, ms: Date.now() - start });
    log(`ok    ${name}`);
    return wert;
  } catch (error) {
    ergebnis.schritte.push({ name, ok: false, ms: Date.now() - start, fehler: error.message });
    log(`FEHLER ${name}: ${error.message}`);
    throw error;
  }
}

async function main() {
  await schritt("Web-App gesund (Datenbank erreichbar)", async () => {
    let letzter = "";
    for (let i = 0; i < 90; i += 1) {
      try {
        const antwort = await anfrage("GET", "/api/health");
        letzter = `${antwort.status} ${await antwort.text()}`;
        if (antwort.status === 200 && letzter.includes('"db":"ok"')) return;
      } catch (error) {
        letzter = error.message;
      }
      await warte(2000);
    }
    throw new Error(`nach 180 s nicht gesund: ${letzter}`);
  });

  const modell = await schritt("Einrichtung: Verbindung zum Test-Anbieter", async () => {
    const zeichen = await pruefzeichenVon("/einrichtung");
    const daten = await jsonVon(
      await anfrage("POST", "/api/einrichtung/verbindungstest", {
        json: { setupCode: CODE, apiKey: ANBIETER_SCHLUESSEL },
        pruefzeichen: zeichen,
      }),
      [200],
    );
    const erstes = daten?.daten?.modelle?.[0]?.slug;
    if (!erstes) throw new Error(`keine Modelle: ${JSON.stringify(daten).slice(0, 300)}`);
    return { slug: erstes, zeichen };
  });

  await schritt("Einrichtung abschließen", async () => {
    await jsonVon(
      await anfrage("POST", "/api/einrichtung", {
        json: {
          setupCode: CODE,
          password: PASSWORT,
          passwordRepeat: PASSWORT,
          apiKey: ANBIETER_SCHLUESSEL,
          modelSlug: modell.slug,
          schleuseModeDefault: "off",
          botName: "Pai",
          timezone: "UTC",
        },
        pruefzeichen: modell.zeichen,
      }),
      [200],
    );
    if (![...cookies.keys()].some((n) => n.endsWith("pb_sitzung"))) {
      throw new Error("keine Sitzung nach der Einrichtung.");
    }
  });

  const antwortText = await schritt("Chat: Nachricht mit Antwort", async () => {
    const zeichen = await pruefzeichenVon("/");
    const neu = await jsonVon(
      await anfrage("POST", "/api/unterhaltungen", {
        json: { title: "Prüfung ohne Internet" },
        pruefzeichen: zeichen,
      }),
      [201],
    );
    const id = neu.daten.unterhaltung.id;
    await jsonVon(
      await anfrage("POST", `/api/unterhaltungen/${id}/nachrichten`, {
        json: { text: "Hallo Pai, hörst du mich?", schleuse: "off" },
        pruefzeichen: zeichen,
      }),
      [202],
    );
    let verlauf;
    for (let i = 0; i < 60; i += 1) {
      verlauf = (
        await jsonVon(await anfrage("GET", `/api/unterhaltungen/${id}/nachrichten`), [200])
      ).daten;
      const antwort = verlauf.nachrichten.find((m) => m.role !== "user" && m.role !== "system");
      if (verlauf.aktiverLauf === undefined && antwort !== undefined) {
        if (antwort.status !== "complete" || antwort.content === "") {
          throw new Error(`Antwort ${antwort.status}: ${antwort.errorCode ?? "ohne Text"}.`);
        }
        return antwort.content;
      }
      await warte(1000);
    }
    throw new Error(`keine Antwort nach 60 s: ${JSON.stringify(verlauf).slice(0, 400)}`);
  });
  ergebnis.antwort = antwortText;

  const kette = await schritt("Belege: Kette laden", async () => {
    const daten = await jsonVon(await anfrage("GET", "/api/belege/kette?ab=1&anzahl=500"), [200]);
    const belege = daten.daten.belege;
    if (belege.length < 4) throw new Error(`nur ${belege.length} Belege.`);
    return { anzahl: belege.length };
  });
  ergebnis.kette = kette;

  const exportDatei = await schritt("Belege: Export", async () => {
    const zeichen = await pruefzeichenVon("/belege");
    const antwort = await anfrage("POST", "/api/belege/export", { pruefzeichen: zeichen });
    const text = await antwort.text();
    if (antwort.status !== 200) throw new Error(`HTTP ${antwort.status}: ${text.slice(0, 300)}`);
    if (!text.includes('"format"')) throw new Error("Export ohne Kopfzeile.");
    const datei = path.join(AUSGABE, "belege-export.json");
    writeFileSync(datei, text);
    return datei;
  });

  if (PRUEFER) {
    await schritt("Belege: eigenständiger Prüfer auf dem Export", async () => {
      if (!existsSync(PRUEFER)) throw new Error(`${PRUEFER} fehlt (erst bauen).`);
      const lauf = spawnSync(process.execPath, [PRUEFER, exportDatei], { encoding: "utf8" });
      writeFileSync(path.join(AUSGABE, "belege-pruefen.log"), `${lauf.stdout}\n${lauf.stderr}`);
      ergebnis.belegePruefen = { exit: lauf.status, ausgabe: lauf.stdout.trim().split("\n") };
      if (lauf.status !== 0) throw new Error(`Prüfer endete mit ${lauf.status}: ${lauf.stdout}`);
    });
  }
}

let fehler;
try {
  await main();
} catch (error) {
  fehler = error;
}
ergebnis.ok = fehler === undefined;
writeFileSync(path.join(AUSGABE, "ergebnis.json"), `${JSON.stringify(ergebnis, null, 2)}\n`);
log(fehler ? "Prüfung ohne Internet NICHT bestanden." : "Prüfung ohne Internet bestanden.");
process.exit(fehler ? 1 : 0);
