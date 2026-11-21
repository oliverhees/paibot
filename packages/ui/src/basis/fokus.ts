/**
 * PaiBot – Hilfen für Fokus-Falle und Pfeiltasten.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

/** Elemente, die per Tab erreichbar sind. */
export const FOKUSSIERBAR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
  "[contenteditable='true']",
].join(",");

/**
 * Nächstes Ziel innerhalb einer Fokus-Falle. Am Ende springt Tab zum Anfang,
 * Umschalt+Tab am Anfang zum Ende. `null`, wenn der Browser selbst weitergehen darf.
 */
export function naechstesZiel(
  anzahl: number,
  aktuell: number,
  rueckwaerts: boolean,
): number | null {
  if (anzahl === 0) return null;
  if (aktuell < 0) return rueckwaerts ? anzahl - 1 : 0;
  if (rueckwaerts && aktuell === 0) return anzahl - 1;
  if (!rueckwaerts && aktuell === anzahl - 1) return 0;
  return null;
}

/** Index im Menü nach einer Pfeil-, Pos1- oder Ende-Taste; `null` bei anderen Tasten. */
export function menueIndex(taste: string, anzahl: number, aktuell: number): number | null {
  if (anzahl === 0) return null;
  switch (taste) {
    case "ArrowDown":
    case "ArrowRight":
      return aktuell < 0 ? 0 : (aktuell + 1) % anzahl;
    case "ArrowUp":
    case "ArrowLeft":
      return aktuell <= 0 ? anzahl - 1 : aktuell - 1;
    case "Home":
      return 0;
    case "End":
      return anzahl - 1;
    default:
      return null;
  }
}

function sichtbar(el: HTMLElement): boolean {
  return el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";
}

/** Alle sichtbaren, per Tab erreichbaren Elemente in einem Bereich. */
export function fokussierbareIn(bereich: HTMLElement): HTMLElement[] {
  return Array.from(bereich.querySelectorAll<HTMLElement>(FOKUSSIERBAR)).filter(sichtbar);
}

/**
 * Markierung für das Element, das beim Öffnen eines Dialogs oder Blatts den Fokus bekommt
 * (z. B. das Eingabefeld statt des Schließen-Knopfs). Als Attribut `data-erster-fokus` setzen.
 */
export const ERSTER_FOKUS = "data-erster-fokus";

/** Wohin der Fokus beim Öffnen eines Bereichs geht: gekennzeichnetes Element, sonst das erste. */
export function startZiel(bereich: HTMLElement): HTMLElement {
  const markiert = bereich.querySelector<HTMLElement>(`[${ERSTER_FOKUS}]`);
  if (markiert && !markiert.matches(":disabled")) return markiert;
  return fokussierbareIn(bereich)[0] ?? bereich;
}
