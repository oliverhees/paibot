/**
 * PaiBot – Bereinigung von Namen, Eingaben und Ergebnissen der Werkzeuge: Steuerzeichen,
 * Format-Zeichen, Variationswähler und Füllzeichen entfernen bzw. erkennen, Text auf NFC bringen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import type { JsonValue } from "@paibot/shared/motor";

/**
 * Zeichen, die nie in einem Namen, einer Eingabe oder einem Ergebnis eines Werkzeugs stehen
 * bleiben:
 *
 * - Steuerzeichen außer Zeilenumbruch und Tabulator (U+0000–U+0008, U+000B–U+001F, U+007F–U+009F);
 * - alle Format-Zeichen (`\p{Cf}`): Bidi-Zeichen (U+061C, U+200E, U+200F, U+202A–U+202E,
 *   U+2066–U+2069), unsichtbare Zeichen (U+200B–U+200D, U+2060–U+2064, U+206A–U+206F, U+FEFF),
 *   das weiche Trennzeichen U+00AD, U+180E, U+FFF9–U+FFFB und die Tag-Zeichen U+E0001,
 *   U+E0020–U+E007F, mit denen sich unsichtbarer Text verstecken lässt;
 * - Variationswähler (U+FE00–U+FE0F, U+E0100–U+E01EF), auch U+FE0F: Er ändert nur die
 *   Darstellung eines sichtbaren Zeichens (etwa ein Herz als Bild statt als Schrift), das Zeichen
 *   selbst bleibt; eine Folge solcher Wähler kann aber unsichtbar Daten tragen;
 * - der unsichtbare Verbinder U+034F und die Füllzeichen U+115F, U+1160, U+3164, U+FFA0;
 * - Zeilen- und Absatztrenner U+2028, U+2029 (Zeilenumbruch bleibt U+000A).
 *
 * Sichtbare Zeichen (Umlaute, Emoji, chinesische oder japanische Schrift) bleiben.
 */
const UNWANTED_SOURCE =
  "[\\u0000-\\u0008\\u000b-\\u001f\\u007f-\\u009f\\p{Cf}\\u034f\\u115f\\u1160\\u180e\\u2028\\u2029\\u3164\\ufe00-\\ufe0f\\uffa0\\u{e0100}-\\u{e01ef}]";
const UNWANTED = new RegExp(UNWANTED_SOURCE, "gu");
const HAS_UNWANTED = new RegExp(UNWANTED_SOURCE, "u");

/** Höchstlänge eines gespeicherten rohen Namens (`tool_calls.raw_name`). */
export const RAW_NAME_MAX_CHARS = 64;

/** Text ohne unerwünschte Zeichen, auf NFC gebracht. */
export function cleanText(text: string): string {
  return text.normalize("NFC").replace(UNWANTED, "");
}

/** Enthält der Text unerwünschte Zeichen? */
export function hasUnwanted(text: string): boolean {
  return HAS_UNWANTED.test(text);
}

/** Jede Zeichenkette eines JSON-Werts (auch Schlüssel) bereinigt; die Form bleibt gleich. */
export function cleanJson(value: JsonValue): JsonValue {
  if (typeof value === "string") return cleanText(value);
  if (Array.isArray(value)) return value.map(cleanJson);
  if (value !== null && typeof value === "object") {
    const out: { [key: string]: JsonValue } = {};
    for (const [key, entry] of Object.entries(value)) out[cleanText(key)] = cleanJson(entry);
    return out;
  }
  return value;
}

/** Enthält irgendeine Zeichenkette (auch ein Schlüssel) des Werts unerwünschte Zeichen? */
export function jsonHasUnwanted(value: JsonValue): boolean {
  if (typeof value === "string") return hasUnwanted(value);
  if (Array.isArray(value)) return value.some(jsonHasUnwanted);
  if (value !== null && typeof value === "object") {
    return Object.entries(value).some(([key, entry]) => hasUnwanted(key) || jsonHasUnwanted(entry));
  }
  return false;
}

/** Enthält der Wert irgendwo eine Zahl, die keine sichere Ganzzahl ist (z. B. `1.5`)? */
export function jsonHasNonInteger(value: JsonValue): boolean {
  if (typeof value === "number") return !Number.isSafeInteger(value);
  if (Array.isArray(value)) return value.some(jsonHasNonInteger);
  if (value !== null && typeof value === "object")
    return Object.values(value).some(jsonHasNonInteger);
  return false;
}

/**
 * Roher Name des Modells für `tool_calls.raw_name`: bereinigt, höchstens 64 Zeichen (nach
 * Codepunkten, nie mitten in einem Zeichen); leer → `undefined`. Er ist und bleibt reiner Text.
 */
export function rawToolName(name: string): string | undefined {
  const cleaned = Array.from(cleanText(name)).slice(0, RAW_NAME_MAX_CHARS).join("");
  return cleaned === "" ? undefined : cleaned;
}
