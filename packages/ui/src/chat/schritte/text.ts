/**
 * PaiBot – Texte im Chat-Verlauf bereinigen: vorläufiger Text, Namen, Quellen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

// Alles, was in den Schritten steht und nicht von PaiBot selbst kommt (Text des Modells, Name eines
// Werkzeugs, Frage, Titel einer Quelle), ist fremder Text. Die Oberfläche setzt ihn nur als
// Textknoten ein; hier wird er zusätzlich bereinigt und gekürzt (zweite Schicht, wie bei Apps).

import { bereinigeFremdText } from "../../app-bausteine/fremdText";

/** Höchstlängen in Zeichen je Art. */
export const SCHRITT_MAX = {
  /** Text, den das Modell gerade schreibt. */
  vorlaeufig: 8000,
  /** Text eines früheren Schritts. */
  zwischen: 4000,
  /** Name eines Werkzeugs laut Modell, Name eines Bots. */
  name: 64,
  /** Kurzform der Frage ans Werkzeug. */
  eingabe: 120,
  /** Seite oder Abschnitt einer Quelle. */
  quelle: 120,
  /** Grund eines abgelehnten oder gescheiterten Aufrufs. */
  grund: 200,
  /** Modell- und Anbieter-Namen in der Antwortzeile. */
  modell: 80,
} as const;

export type SchrittTextArt = keyof typeof SCHRITT_MAX;

const MEHRZEILIG: ReadonlySet<SchrittTextArt> = new Set(["vorlaeufig", "zwischen"]);

/** Bereinigt und kürzt einen Text für die Anzeige; Zeilenumbrüche nur bei langen Texten. */
export function schrittText(roh: unknown, art: SchrittTextArt): string {
  return bereinigeFremdText(
    roh,
    MEHRZEILIG.has(art) ? "beschreibung" : "name",
    MEHRZEILIG.has(art),
    SCHRITT_MAX[art],
  ).text;
}
