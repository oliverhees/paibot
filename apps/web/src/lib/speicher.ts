/**
 * PaiBot – die einzige Stelle mit Zugriff auf den Browser-Speicher: Entwurf der Eingabe je\n * Unterhaltung (`sessionStorage`). Jeder Zugriff ist abgesichert; ohne Speicher geht nichts kaputt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { STORAGE_KEYS } from "@paibot/shared/konstanten";

type Unterhaltung = Parameters<typeof STORAGE_KEYS.entwurf>[0];

/** Gemerkter Entwurf der Eingabe einer Unterhaltung, sonst leer. */
export function entwurfLesen(id: string): string {
  try {
    return window.sessionStorage.getItem(STORAGE_KEYS.entwurf(id as Unterhaltung)) ?? "";
  } catch {
    return "";
  }
}

/** Merkt den Entwurf; leerer Text entfernt ihn. */
export function entwurfMerken(id: string, text: string): void {
  try {
    const schluessel = STORAGE_KEYS.entwurf(id as Unterhaltung);
    if (text === "") window.sessionStorage.removeItem(schluessel);
    else window.sessionStorage.setItem(schluessel, text);
  } catch {
    // Ohne Speicher bleibt der Entwurf nur bis zum Neuladen.
  }
}
