/**
 * PaiBot – Probe für Sicherung und Wiederherstellung im Docker-Stack (CI): vorher einrichten und
 * etwas schreiben, nach dem Zurückspielen anmelden und nachsehen, ob alles da ist.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

// Nur über HTTP gegen die Web-App, ohne Abhängigkeiten (läuft in einem Node-Container).
//
//   node scripts/sicherung-probe.mjs einrichten   Einrichtung mit Code und Test-Anbieter, eine
//                                                 Unterhaltung mit Nachricht und Antwort
//   node scripts/sicherung-probe.mjs anmelden     falsches Passwort abgelehnt, richtiges
//                                                 angenommen; Unterhaltung, Nachricht und Antwort da
//
// Umgebung: PAIBOT_PROBE_URL (z. B. http://web:3000), PAIBOT_PROBE_HERKUNFT (APP_URL),
// PAIBOT_PROBE_PASSWORT (Wegwerf-Passwort der Probe); für einrichten zusätzlich
// PAIBOT_PROBE_CODE (Einrichtungs-Code) und PAIBOT_PROBE_ANBIETER_SCHLUESSEL.
// Exit-Code 0: bestanden, 1: nicht bestanden, 2: Aufruf falsch.

const TITEL = "Probe der Sicherung";
const FRAGE = "Steht diese Nachricht nach dem Zurückspielen noch da?";

const log = (text) => console.log(`[sicherung-probe] ${text}`);
function umgebung(name) {
  const wert = process.env[name];
  if (!wert) {
    console.error(`[sicherung-probe] ${name} fehlt.`);
    process.exit(2);
  }
  return wert;
}

const befehl = process.argv[2];
if (befehl !== "einrichten" && befehl !== "anmelden") {
  console.error("Aufruf: node scripts/sicherung-probe.mjs einrichten|anmelden");
  process.exit(2);
}
const BASIS = umgebung("PAIBOT_PROBE_URL").replace(/\/+$/, "");
const HERKUNFT = new URL(umgebung("PAIBOT_PROBE_HERKUNFT")).origin;
const PASSWORT = umgebung("PAIBOT_PROBE_PASSWORT");
const cookies = new Map();
const warte = (ms) => new Promise((fertig) => setTimeout(fertig, ms));

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
  if (cookies.size > 0) kopf.cookie = [...cookies].map(([n, w]) => `${n}=${w}`).join("; ");
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

async function pruefzeichenVon(pfad) {
  const antwort = await anfrage("GET", pfad, { accept: "text/html" });
  const html = await antwort.text();
  if (antwort.status !== 200) throw new Error(`${pfad}: HTTP ${antwort.status}.`);
  const treffer = /<meta[^>]*name="pb-pruefzeichen"[^>]*content="([^"]+)"/.exec(html);
  if (!treffer) throw new Error(`${pfad}: kein Prüfzeichen in der Seite.`);
  return treffer[1];
}

async function schritt(name, fn) {
  try {
    const wert = await fn();
    log(`ok     ${name}`);
    return wert;
  } catch (error) {
    log(`FEHLER ${name}: ${error.message}`);
    throw error;
  }
}

async function gesund() {
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
}

/** Wartet, bis die Unterhaltung keinen Lauf mehr hat, und liefert ihre Nachrichten. */
async function nachrichtenVon(id) {
  let verlauf;
  for (let i = 0; i < 60; i += 1) {
    verlauf = (await jsonVon(await anfrage("GET", `/api/unterhaltungen/${id}/nachrichten`), [200]))
      .daten;
    if (verlauf.aktiverLauf === undefined) return verlauf.nachrichten;
    await warte(1000);
  }
  throw new Error(`Lauf endet nicht: ${JSON.stringify(verlauf).slice(0, 400)}`);
}

function antwortIn(nachrichten) {
  const frage = nachrichten.find((m) => m.role === "user" && m.content === FRAGE);
  const antwort = nachrichten.find((m) => m.role !== "user" && m.role !== "system");
  if (!frage) throw new Error("Die Nachricht fehlt.");
  if (antwort?.status !== "complete" || antwort.content === "") {
    throw new Error(`Antwort fehlt oder ist unvollständig (${antwort?.status ?? "keine"}).`);
  }
  return antwort.content;
}

async function einrichten() {
  const code = umgebung("PAIBOT_PROBE_CODE");
  const schluessel = umgebung("PAIBOT_PROBE_ANBIETER_SCHLUESSEL");
  await schritt("Web-App gesund", gesund);
  const zeichen = await pruefzeichenVon("/einrichtung");
  const modell = await schritt("Einrichtung: Verbindung zum Test-Anbieter", async () => {
    const daten = await jsonVon(
      await anfrage("POST", "/api/einrichtung/verbindungstest", {
        json: { setupCode: code, apiKey: schluessel },
        pruefzeichen: zeichen,
      }),
      [200],
    );
    const slug = daten?.daten?.modelle?.[0]?.slug;
    if (!slug) throw new Error("keine Modelle.");
    return slug;
  });
  await schritt("Einrichtung abschließen", async () => {
    await jsonVon(
      await anfrage("POST", "/api/einrichtung", {
        json: {
          setupCode: code,
          password: PASSWORT,
          passwordRepeat: PASSWORT,
          apiKey: schluessel,
          modelSlug: modell,
          schleuseModeDefault: "off",
          botName: "Pai",
          timezone: "UTC",
        },
        pruefzeichen: zeichen,
      }),
      [200],
    );
  });
  await schritt("Unterhaltung mit Nachricht und Antwort", async () => {
    const seite = await pruefzeichenVon("/");
    const neu = await jsonVon(
      await anfrage("POST", "/api/unterhaltungen", { json: { title: TITEL }, pruefzeichen: seite }),
      [201],
    );
    const id = neu.daten.unterhaltung.id;
    await jsonVon(
      await anfrage("POST", `/api/unterhaltungen/${id}/nachrichten`, {
        json: { text: FRAGE, schleuse: "off" },
        pruefzeichen: seite,
      }),
      [202],
    );
    antwortIn(await nachrichtenVon(id));
  });
}

async function anmelden() {
  await schritt("Web-App gesund", gesund);
  await schritt("falsches Passwort wird abgelehnt", async () => {
    const zeichen = await pruefzeichenVon("/anmelden");
    const antwort = await anfrage("POST", "/api/zugang/anmelden", {
      json: { password: `${PASSWORT}-falsch` },
      pruefzeichen: zeichen,
    });
    await antwort.text();
    if (antwort.status !== 401) throw new Error(`HTTP ${antwort.status} statt 401.`);
  });
  await schritt("Anmeldung mit dem Passwort von vorher", async () => {
    const zeichen = await pruefzeichenVon("/anmelden");
    await jsonVon(
      await anfrage("POST", "/api/zugang/anmelden", {
        json: { password: PASSWORT },
        pruefzeichen: zeichen,
      }),
      [200],
    );
    if (![...cookies.keys()].some((n) => n.endsWith("pb_sitzung"))) {
      throw new Error("keine Sitzung nach der Anmeldung.");
    }
  });
  await schritt("Unterhaltung, Nachricht und Antwort sind da", async () => {
    const liste = (await jsonVon(await anfrage("GET", "/api/unterhaltungen"), [200])).daten
      .unterhaltungen;
    const treffer = liste.find((u) => u.titel === TITEL);
    if (!treffer) throw new Error(`Unterhaltung „${TITEL}“ fehlt.`);
    antwortIn(await nachrichtenVon(treffer.id));
  });
}

try {
  await (befehl === "einrichten" ? einrichten() : anmelden());
  log(`${befehl}: bestanden.`);
} catch {
  log(`${befehl}: NICHT bestanden.`);
  process.exit(1);
}
