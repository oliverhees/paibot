/**
 * PaiBot – gemeinsame Hilfen für die Doku-Bilder: Lauf-Datei, Wegwerf-Werte, Sonderwerte, Namen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

// Die Lauf-Datei verbindet `pnpm doku:app` mit `pnpm doku:screenshots` und
// `pnpm doku:beispieldaten`: Adresse der App, Einrichtungs-Code aus dem Log, Wegwerf-Passwort,
// Schlüssel des Test-Anbieters und der Zustand der App. Sie liegt nur im temporären Ordner des
// Systems, nur für den eigenen Benutzer lesbar, und wird am Ende von `pnpm doku:app` gelöscht.
import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

/** Vorsatz jeder Datenbank und Rolle, die `pnpm doku:app` anlegt. Nur solche löscht es wieder. */
export const DB_VORSATZ = "paibot_doku_";
const DB_NAME_MUSTER = /^paibot_doku_[0-9a-f]{12}$/;
const ROLLEN_MUSTER = /^paibot_doku_[0-9a-f]{12}_app$/;

/** Neuer, eindeutiger Name für die Wegwerf-Datenbank. */
export function neuerDatenbankName(zufall = randomBytes(6).toString("hex")) {
  const name = `${DB_VORSATZ}${zufall}`;
  if (!DB_NAME_MUSTER.test(name)) throw new Error(`Ungültiger Name für die Datenbank: ${name}`);
  return name;
}

/** Hat die Datenbank die Form, die nur `pnpm doku:app` vergibt? */
export function istDokuDatenbank(name) {
  return typeof name === "string" && DB_NAME_MUSTER.test(name);
}

/** Name der App-Rolle zur Datenbank. */
export function rollenName(datenbank) {
  if (!istDokuDatenbank(datenbank)) throw new Error(`Keine Doku-Datenbank: ${datenbank}`);
  return `${datenbank}_app`;
}

/** Hat die Rolle die Form, die nur `pnpm doku:app` vergibt? */
export function istDokuRolle(name) {
  return typeof name === "string" && ROLLEN_MUSTER.test(name);
}

/** Vermerk an der Datenbank; vor dem Löschen muss er genau stimmen. */
export function datenbankVermerk(kennung) {
  return `paibot-doku-app ${kennung}`;
}

/** Zufälliger Wegwerf-Wert fester Länge aus Buchstaben und Ziffern (gleiche Länge, gleiches Bild). */
export function wegwerfWert(laenge = 24) {
  const zeichen = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(laenge * 2);
  let text = "";
  for (const byte of bytes) {
    if (byte >= 256 - (256 % zeichen.length)) continue;
    text += zeichen[byte % zeichen.length];
    if (text.length === laenge) return text;
  }
  return text + wegwerfWert(laenge - text.length);
}

/** Zustände der App, in der Reihenfolge, in der sie sich herstellen lassen. */
export const ZUSTAENDE = ["frisch", "eingerichtet", "mit-beispieldaten", "mit-apps"];

/** Zustände der Datenschleuse in der Beispiel-Umgebung („aus“ = nicht eingerichtet). */
export const SCHLEUSE_ZUSTAENDE = ["aus", "bereit", "schluessel_falsch", "nicht_erreichbar"];

/** Beispiel-Modelle des Test-Anbieters: erfundene Namen, die so in den Bildern stehen. */
export const BEISPIEL_MODELLE = [
  { id: "beispiel/allrounder", name: "Beispiel-Modell Allrounder", contextLength: 128000 },
  { id: "beispiel/kompakt", name: "Beispiel-Modell Kompakt", contextLength: 32000 },
];

/** Grund-Verhalten des Test-Anbieters; vor jeder Aufnahme wird es wieder hergestellt. */
export const ANBIETER_STANDARD = Object.freeze({
  models: BEISPIEL_MODELLE,
  reply: "Gern. Hier ist mein Vorschlag – mit Beispiel-Daten.",
  chunkChars: 400,
  firstChunkDelayMs: 0,
  chunkDelayMs: 0,
  holdAfterChunks: 0,
  // Kein Ablauf aus einer früheren Aufnahme (null löscht ihn).
  script: null,
  // Routing-Regel und Anbieter-Liste wie bei einem Vermittler (nur Beispiel-Daten).
  routingRules: [
    { name: "Beispiel-Regel", provider: "beispiel-nord", model: "beispiel/allrounder" },
    { name: "Zweite Beispiel-Regel", provider: "beispiel-nord", model: "beispiel/kompakt" },
    { name: "Dritte Beispiel-Regel", provider: "beispiel-nord", model: "beispiel/kompakt" },
    { name: "Regel nur per Name", provider: "beispiel-nord", model: "beispiel/kompakt" },
  ],
  providers: [{ slug: "beispiel-nord", name: "Beispiel-Anbieter Nord", headquarters: "NL" }],
});

/** Felder, die ein Schritt „anbieter“ am Test-Anbieter setzen darf. */
export const ANBIETER_FELDER = Object.freeze({
  reply: "text",
  chunkChars: "zahl",
  firstChunkDelayMs: "zahl",
  chunkDelayMs: "zahl",
  holdAfterChunks: "zahl",
  models: "modelle",
  script: "ablauf",
});

/** Sonderwerte für `tippe`: Platzhalter statt Geheimnis in docs/screenshots.json. */
export const SONDERWERTE = Object.freeze({
  "$einrichtungs-code": "einrichtungsCode",
  $passwort: "passwort",
  "$anbieter-schluessel": "anbieterSchluessel",
  $verwaltungsschluessel: "verwaltungsschluessel",
});

/**
 * Setzt einen Sonderwert ein. Text, der mit `$` beginnt, muss ein bekannter Sonderwert sein; `$$`
 * am Anfang steht für ein wörtliches `$`.
 */
export function setzeSonderwert(text, lauf) {
  if (typeof text !== "string" || !text.startsWith("$")) return text;
  if (text.startsWith("$$")) return text.slice(1);
  const feld = SONDERWERTE[text];
  if (feld === undefined) {
    throw new Error(
      `Unbekannter Sonderwert „${text}“. Erlaubt: ${Object.keys(SONDERWERTE).join(", ")}.`,
    );
  }
  const wert = lauf?.[feld];
  if (typeof wert !== "string" || wert === "") {
    throw new Error(`Für „${text}“ fehlt der Wert. Läuft \`pnpm doku:app\`?`);
  }
  return wert;
}

/** Ort der Lauf-Datei (`PAIBOT_DOKU_LAUF` oder ein fester Ort im temporären Ordner). */
export function laufDatei(env = process.env) {
  return env.PAIBOT_DOKU_LAUF || path.join(os.tmpdir(), "paibot-doku-app", "lauf.json");
}

/** Liest die Lauf-Datei; `undefined`, wenn es keine gibt. */
export function leseLauf(datei = laufDatei()) {
  if (!existsSync(datei)) return undefined;
  return JSON.parse(readFileSync(datei, "utf8"));
}

/** Schreibt die Lauf-Datei in einem Schritt, nur für den eigenen Benutzer lesbar. */
export function schreibeLauf(daten, datei = laufDatei()) {
  mkdirSync(path.dirname(datei), { recursive: true, mode: 0o700 });
  const neu = `${datei}.${process.pid}.neu`;
  writeFileSync(neu, `${JSON.stringify(daten, null, 2)}\n`, { mode: 0o600 });
  renameSync(neu, datei);
}

/** Ändert Felder der Lauf-Datei. */
export function aendereLauf(aenderung, datei = laufDatei()) {
  const lauf = leseLauf(datei);
  if (lauf === undefined) throw new Error(`Die Lauf-Datei ${datei} fehlt.`);
  const neu = { ...lauf, ...aenderung };
  schreibeLauf(neu, datei);
  return neu;
}

/** Löscht die Lauf-Datei (und ihren Ordner, wenn er leer ist). */
export function loescheLauf(datei = laufDatei()) {
  rmSync(datei, { force: true });
  try {
    rmdirSync(path.dirname(datei));
  } catch {
    // Ordner nicht leer oder schon weg
  }
}

/** Läuft der Prozess noch? */
export function prozessLebt(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}
