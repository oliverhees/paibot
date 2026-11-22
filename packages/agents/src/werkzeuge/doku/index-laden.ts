/**
 * PaiBot – Doku-Index laden und streng prüfen: Größe, Form, eindeutige Kennungen, Prüfsumme und
 * keine unsichtbaren Zeichen. Jeder Fehler hält an; die Meldung nennt nie Text aus dem Index.
 * Die einzige Datei des Werkzeugs, die eine Datei liest; der Pfad kommt nie aus einer Eingabe
 * des Modells.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { hasUnwanted } from "../../run/bereinigen";
import { bereiteIndexVor, type GeladenerDokuIndex } from "./suche";

/** Größte Index-Datei in Bytes (wie beim Bau, `scripts/doku-index.mjs`). */
export const MAX_INDEX_BYTES = 4 * 1024 * 1024;

/** Ort des Index ohne `PAIBOT_DOKU_INDEX`, relativ zum Projektstamm (Ausgabe von `pnpm doku:index`). */
export const STANDARD_INDEX_PFAD = path.join("doku-index", "doku-index.json");

/** Fehler beim Laden; der Start bricht damit ab. */
export class DokuIndexFehler extends Error {
  constructor(grund: string) {
    super(
      `Doku-Index: ${grund}. Index mit „pnpm doku:index“ neu bauen bzw. Image neu bauen oder PAIBOT_DOKU_INDEX prüfen.`,
    );
    this.name = "DokuIndexFehler";
  }
}

const VERSION = /^\d{1,6}\.\d{1,6}\.\d{1,6}(?:-[0-9A-Za-z.-]{1,40})?$/;

const abschnittSchema = z.strictObject({
  id: z.string().min(1).max(300),
  seite: z.string().min(1).max(200),
  anker: z.string().min(1).max(200),
  titel: z.string().min(1).max(300),
  pfad: z.array(z.string().min(1).max(300)).min(1).max(6),
  text: z.string().max(200_000),
});

/** Fassung des Formats, die dieser Lader annimmt (`scripts/doku-index.mjs#FASSUNG`). */
export const INDEX_FASSUNG = 2;

const indexSchema = z.strictObject({
  format: z.literal("pb-doku-index"),
  v: z.literal(INDEX_FASSUNG),
  stand: z.strictObject({
    version: z.string().min(1).max(60).regex(VERSION),
    pruefsumme: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  }),
  abschnitte: z.array(abschnittSchema).min(1).max(10_000),
});

/** Prüfsumme wie beim Bau: SHA-256 über `JSON.stringify(abschnitte)` (feste Schlüsselfolge). */
export function dokuPruefsumme(abschnitte: readonly z.infer<typeof abschnittSchema>[]): string {
  const kanonisch = abschnitte.map((a) => ({
    id: a.id,
    seite: a.seite,
    anker: a.anker,
    titel: a.titel,
    pfad: a.pfad,
    text: a.text,
  }));
  return `sha256:${createHash("sha256").update(JSON.stringify(kanonisch)).digest("hex")}`;
}

/**
 * Zusätzlich in Kennung, Seite, Anker, Titel und Pfad (nicht im Text): Zeilenumbruch, Tabulator,
 * das leere Braille-Muster U+2800 und Zeichen für den privaten Gebrauch. Titel gehen an das
 * Modell; ein Zeilenumbruch darin ließe eine zweite Zeile wie eine eigene Anweisung aussehen.
 */
const TITEL_ZUSATZ = /[\n\t\u2800\p{Co}]/u;

/** Steht in einem Titel, Pfad oder einer Kennung ein Zeichen, das dort nicht stehen darf? */
export function unerlaubtImTitel(text: string): boolean {
  return hasUnwanted(text) || TITEL_ZUSATZ.test(text);
}

/** Prüft den Inhalt einer Index-Datei und bereitet ihn für die Suche vor. */
export function dokuIndexAusText(text: string): GeladenerDokuIndex {
  if (Buffer.byteLength(text) > MAX_INDEX_BYTES) throw new DokuIndexFehler("Datei zu groß");
  let roh: unknown;
  try {
    roh = JSON.parse(text);
  } catch {
    throw new DokuIndexFehler("kein gültiges JSON");
  }
  const fassung = (roh as { v?: unknown } | null)?.v;
  if (typeof fassung === "number" && fassung !== INDEX_FASSUNG) {
    throw new DokuIndexFehler(`Fassung ${fassung} statt ${INDEX_FASSUNG}`);
  }
  const geprueft = indexSchema.safeParse(roh);
  if (!geprueft.success) throw new DokuIndexFehler("Form stimmt nicht");
  const { stand, abschnitte } = geprueft.data;
  const ids = new Set<string>();
  for (const a of abschnitte) {
    if (ids.has(a.id)) throw new DokuIndexFehler("Kennung eines Abschnitts doppelt");
    ids.add(a.id);
    if (a.id !== `${a.seite}#${a.anker}`)
      throw new DokuIndexFehler("Kennung passt nicht zu Seite und Anker");
    if (a.pfad[a.pfad.length - 1] !== a.titel) {
      throw new DokuIndexFehler("Pfad der Überschriften endet nicht mit dem Titel");
    }
    if (
      [a.id, a.seite, a.anker, a.titel, ...a.pfad].some(unerlaubtImTitel) ||
      hasUnwanted(a.text)
    ) {
      throw new DokuIndexFehler("unsichtbare oder Steuerzeichen in einem Abschnitt");
    }
  }
  if (dokuPruefsumme(abschnitte) !== stand.pruefsumme) {
    throw new DokuIndexFehler("Prüfsumme stimmt nicht");
  }
  return bereiteIndexVor(stand, abschnitte);
}

/**
 * Lädt den Index von `pfad` (fest aus der Umgebung, nie aus einer Eingabe des Modells): erst die
 * Größe, dann Inhalt und Prüfungen (`dokuIndexAusText`). Wirft `DokuIndexFehler`.
 */
export async function ladeDokuIndex(pfad: string): Promise<GeladenerDokuIndex> {
  let groesse: number;
  try {
    groesse = (await stat(pfad)).size;
  } catch {
    throw new DokuIndexFehler("Datei fehlt oder ist nicht lesbar");
  }
  if (groesse > MAX_INDEX_BYTES) throw new DokuIndexFehler("Datei zu groß");
  let text: string;
  try {
    text = await readFile(pfad, "utf8");
  } catch {
    throw new DokuIndexFehler("Datei fehlt oder ist nicht lesbar");
  }
  return dokuIndexAusText(text);
}

/** Pfad des Index: `PAIBOT_DOKU_INDEX`, sonst `doku-index/doku-index.json` unter `projektstamm`. */
export function dokuIndexPfad(env: NodeJS.ProcessEnv, projektstamm: string): string {
  const gesetzt = env.PAIBOT_DOKU_INDEX;
  return gesetzt !== undefined && gesetzt !== ""
    ? gesetzt
    : path.join(projektstamm, STANDARD_INDEX_PFAD);
}
