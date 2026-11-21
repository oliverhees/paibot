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

/** Wo der Fokus gerade steht, aus Sicht der Chat-Eingabe. */
export type FokusOrt = "feld" | "eingabe" | "nirgends" | "anderswo";

/**
 * Ob die Eingabe den Fokus zurück ins Nachrichtenfeld holt: nur nach dem Senden oder „Stopp“
 * (`gemerkt`), nur wenn das Feld bedienbar ist, und nur, wenn der Fokus nicht woanders steht
 * (z. B. in einem Dialog). „eingabe“ heißt: auf einem Knopf der Eingabe (Senden, Stopp);
 * „nirgends“: auf der Seite selbst, etwa weil der Knopf verschwunden oder das Feld kurz gesperrt war.
 */
export function fokusZurueck(ort: FokusOrt, gemerkt: boolean, deaktiviert: boolean): boolean {
  if (!gemerkt || deaktiviert) return false;
  return ort === "eingabe" || ort === "nirgends";
}
