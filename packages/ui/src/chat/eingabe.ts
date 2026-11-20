/**
 * PaiBot – Tastenregeln im Eingabefeld des Chats.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

/** Was eine Taste im Eingabefeld des Chats auslöst. */
export type EingabeAktion = "senden" | "neue-zeile" | "nichts";

/**
 * Enter sendet, Umschalt+Enter macht eine neue Zeile. Während einer Zeichen-Komposition
 * (z. B. bei Akzenten über die Tastatur) sendet Enter nicht.
 */
export function eingabeAktion(e: {
  key: string;
  shiftKey: boolean;
  isComposing?: boolean;
}): EingabeAktion {
  if (e.key !== "Enter" || e.isComposing) return "nichts";
  return e.shiftKey ? "neue-zeile" : "senden";
}

/** Ob sich ein Text senden lässt: nicht leer und nicht nur Leerraum. */
export function sendbar(text: string): boolean {
  return text.trim().length > 0;
}
