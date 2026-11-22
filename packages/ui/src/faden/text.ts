/**
 * PaiBot – Text von Bots für die Anzeige im Faden: nur reiner Text, ohne Steuer- und Richtungszeichen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

// Alles, was ein Bot schreibt, ist im Faden reiner Text: nie HTML, nie Markdown, nie eine
// Bild-Adresse, nie ein Link zum Anklicken. Die Bausteine setzen Text immer als Text ein
// (React maskiert ihn); diese Funktionen entfernen zusätzlich, was Anzeige oder Zeilen
// verfälschen kann, und begrenzen die Länge.

/** Zeichen, die eine Anzeige umdrehen oder verstecken: Richtung, unsichtbare Zeichen, Marken. */
const UNSICHTBAR = /[\u061c\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/gu;
/** Zeilentrenner außer `\n`. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: genau diese Zeichen sollen weg
const ANDERE_ZEILENTRENNER = /\r\n|[\r\u0085\u000b\u000c\u2028\u2029]/gu;
/** Steuerzeichen außer Tab und Zeilenumbruch. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: genau diese Zeichen sollen weg
const STEUER = /[\u0000-\u0008\u000e-\u001f\u007f-\u009f]/gu;

/** Höchstlänge eines Bot-Namens in der Anzeige. */
export const NAME_MAX = 40;
/** Höchstlänge eines Beitrags in der Anzeige. */
export const TEXT_MAX = 4000;

/** Kürzt auf `max` Zeichen (nach Codepunkten) und hängt „…“ an, wenn etwas fehlt. */
export function kuerze(text: string, max: number): string {
  const zeichen = Array.from(text);
  if (zeichen.length <= max) return text;
  return `${zeichen
    .slice(0, Math.max(0, max - 1))
    .join("")
    .trimEnd()}…`;
}

/**
 * Macht einen Text für die Anzeige sicher: Richtungs- und unsichtbare Zeichen, Steuerzeichen und
 * fremde Zeilentrenner fallen weg (Zeilentrenner werden `\n`), die Länge ist begrenzt. Der Text
 * bleibt Text; HTML wird hier nicht „gereinigt“, sondern später nie als HTML eingesetzt.
 */
export function reinerText(text: unknown, max: number = TEXT_MAX): string {
  if (typeof text !== "string") return "";
  const glatt = text
    .replace(ANDERE_ZEILENTRENNER, "\n")
    .replace(UNSICHTBAR, "")
    .replace(STEUER, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return kuerze(glatt, max);
}

/** Erste nicht leere Zeile eines Textes, bereinigt und auf `max` Zeichen gekürzt. */
export function ersteZeile(text: unknown, max = 80): string {
  const sauber = reinerText(text, TEXT_MAX);
  const zeile = sauber.split("\n").find((z) => z.trim() !== "") ?? "";
  return kuerze(zeile.replace(/\s+/g, " ").trim(), max);
}

/** Name eines Bots für die Anzeige: eine Zeile, bereinigt, höchstens `NAME_MAX` Zeichen. */
export function sauberName(name: unknown): string {
  if (typeof name !== "string") return "?";
  const einzeilig = reinerText(name, TEXT_MAX).replace(/\s+/g, " ").trim();
  return einzeilig === "" ? "?" : kuerze(einzeilig, NAME_MAX);
}

/** Enthält der Text eine Adresse (http, https, www, Datenadresse)? Solche Möglichkeiten gelten nicht. */
export function hatLink(text: string): boolean {
  return /(?:[a-z][a-z0-9+.-]*:\/\/|\bwww\.|\bdata:|\bjavascript:|\bmailto:)/iu.test(text);
}

/** Zerlegt Text in Zeilen (nach `reinerText`); leere Zeilen bleiben als Absatz-Abstand. */
export function zeilen(text: unknown, max: number = TEXT_MAX): string[] {
  const sauber = reinerText(text, max);
  return sauber === "" ? [] : sauber.split("\n");
}
