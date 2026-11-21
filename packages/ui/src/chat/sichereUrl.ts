/**
 * PaiBot – Lässt nur http- und https-Adressen durch.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

/**
 * Lässt nur absolute http- und https-Adressen durch. Alles andere (javascript:, data:,
 * relative Pfade, Steuerzeichen) ergibt `null` und wird als Text gezeigt.
 */
export function sichereUrl(adresse: string | null | undefined): string | null {
  if (typeof adresse !== "string") return null;
  // Steuerzeichen und Leerraum am Rand würden Browser großzügig ignorieren.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: genau die sollen erkannt werden
  if (/[\u0000-\u001f\u007f]/.test(adresse)) return null;
  const sauber = adresse.trim();
  if (!/^https?:\/\//i.test(sauber)) return null;
  try {
    const url = new URL(sauber);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

/**
 * Steuerzeichen der Schreibrichtung (U+200E, U+200F, U+202A–U+202E, U+2066–U+2069). Sie können
 * die Anzeige eines Textes umdrehen, etwa einen Dateinamen in einem Link anders aussehen lassen,
 * als er ist.
 */
const SCHREIBRICHTUNG = /[‎‏‪-‮⁦-⁩]/g;

/** Entfernt Steuerzeichen der Schreibrichtung aus einem Text des Modells. */
export function ohneSchreibrichtung(text: string): string {
  return text.replace(SCHREIBRICHTUNG, "");
}
