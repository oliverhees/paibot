/**
 * PaiBot – Zustand der Suche in der Seitenleiste, ohne DOM: was ein eingegebener Text bedeutet.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import type { ApiErrorDetail } from "@paibot/shared/api";
import type { SuchErgebnis } from "./such-typen";

/** Wartezeit nach dem letzten Tastendruck, bevor gesucht wird. */
export const WARTEN_MS = 250;
/** Kürzestes Suchwort (gleich der Grenze der Route). */
export const MIN_ZEICHEN = 2;
/** Längstes Suchwort. */
export const MAX_ZEICHEN = 100;

export type SuchStand =
  | { art: "leer" }
  | { art: "zu_kurz" }
  | { art: "laedt" }
  | { art: "treffer"; ergebnis: SuchErgebnis; laedt: boolean }
  | { art: "fehler"; fehler: ApiErrorDetail };

/** Was ein Text im Feld auslöst: nichts (leer), ein Hinweis (zu kurz) oder eine Suche. */
export function suchStand(
  roh: string,
): { art: "leer" } | { art: "zu_kurz" } | { art: "suchen"; suchwort: string } {
  const suchwort = roh.normalize("NFC").trim();
  if (suchwort === "") return { art: "leer" };
  if (Array.from(suchwort).length < MIN_ZEICHEN) return { art: "zu_kurz" };
  return { art: "suchen", suchwort: suchwort.slice(0, MAX_ZEICHEN) };
}
