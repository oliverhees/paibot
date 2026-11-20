/**
 * PaiBot – kanonische JSON-Form nach RFC 8785 für die Werte in Belegen (ohne Gleitkommazahlen).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { notImplemented } from "@paibot/stub";

/** Werte, die sich kanonisieren lassen. Zahlen müssen sichere Ganzzahlen sein. */
export type CanonicalValue =
  | string
  | number
  | boolean
  | null
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue };

/** Gründe, aus denen ein Wert nicht kanonisiert werden kann. */
export type CanonicalizeProblem =
  | "gleitkommazahl"
  | "zahl_zu_gross"
  | "nicht_endlich"
  | "undefiniert"
  | "typ_unbekannt"
  | "zyklus";

export class CanonicalizeError extends Error {
  readonly problem: CanonicalizeProblem;
  /** Pfad zum fehlerhaften Wert, z. B. `facts.inputChars`. */
  readonly path: string;

  constructor(problem: CanonicalizeProblem, path: string) {
    super(`${problem} bei ${path === "" ? "(Wurzel)" : path}`);
    this.name = "CanonicalizeError";
    this.problem = problem;
    this.path = path;
  }
}

/**
 * Serialisiert einen Wert kanonisch nach RFC 8785: Objekt-Schlüssel sortiert nach UTF-16-Code-Units,
 * keine Leerzeichen, Texte mit der Maskierung aus RFC 8785, nur Ganzzahlen.
 *
 * Zusagen: gleiche Werte ergeben unabhängig von der Reihenfolge der Schlüssel denselben Text;
 * läuft ohne Node-APIs (auch im Browser).
 *
 * Fehler: `CanonicalizeError` bei Gleitkommazahlen, Zahlen außerhalb von
 * `Number.MAX_SAFE_INTEGER`, `NaN`/`Infinity`, `undefined` (auch als Objekt-Wert), Funktionen,
 * Symbolen, `bigint`, Datumsobjekten und zyklischen Strukturen.
 */
export function canonicalize(value: CanonicalValue): string {
  return notImplemented("receipts.canonicalize", value);
}
