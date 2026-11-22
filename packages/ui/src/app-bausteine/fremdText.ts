/**
 * PaiBot – Fremder Text aus einer App (Name, Beschreibung, Werte): bereinigen und kürzen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

// Alles, was eine App über sich sagt, ist fremder Text. Die Oberfläche zeigt ihn nur an: als
// Textknoten, nie als HTML oder Markdown, und ohne Zeichen, die Anzeige oder Leserichtung stören.
// Die Bereinigung hier ist die zweite Schicht; der Server bereinigt, bevor er speichert.

/** Steuerzeichen, Format-Zeichen (Null-Breite, Leserichtung, Tags), private und kaputte Zeichen. */
const UNERWUENSCHT = /[\p{Cc}\p{Cf}\p{Co}\p{Cs}\u2028\u2029]/gu;

export const FREMD_MAX = {
  name: 80,
  titel: 120,
  beschreibung: 1000,
  wert: 600,
} as const;

export type FremdArt = keyof typeof FREMD_MAX;

export interface FremdErgebnis {
  text: string;
  /** Der Text war länger als erlaubt und wurde mit „…“ gekürzt. */
  gekuerzt: boolean;
}

/**
 * Macht aus beliebigem Text der App einen Anzeige-Text.
 * `mehrzeilig` erlaubt Zeilenumbrüche (höchstens eine Leerzeile in Folge), sonst eine Zeile.
 * `grenze` ersetzt die Höchstlänge der Art (in Zeichen), z. B. für längere Texte des Modells.
 */
export function bereinigeFremdText(
  roh: unknown,
  art: FremdArt,
  mehrzeilig = art === "beschreibung" || art === "wert",
  grenze?: number,
): FremdErgebnis {
  if (typeof roh !== "string") return { text: "", gekuerzt: false };
  const zeilen = roh
    .normalize("NFC")
    .split(/\r\n|\r|\n|\u2028|\u2029/)
    .map((zeile) =>
      zeile.replace(/\t/g, " ").replace(UNERWUENSCHT, "").replace(/ {2,}/g, " ").trim(),
    );
  let text = (mehrzeilig ? zeilen.join("\n") : zeilen.join(" "))
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ {2,}/g, " ")
    .trim();
  const zeichen = Array.from(text);
  const max = grenze ?? FREMD_MAX[art];
  let gekuerzt = false;
  if (zeichen.length > max) {
    text = `${zeichen
      .slice(0, max - 1)
      .join("")
      .trimEnd()}…`;
    gekuerzt = true;
  }
  return { text, gekuerzt };
}
