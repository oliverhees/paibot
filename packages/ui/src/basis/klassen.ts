/**
 * PaiBot – Verbindet CSS-Klassen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

/** Verbindet CSS-Klassen und lässt leere Werte weg. */
export function klassen(...teile: (string | false | null | undefined)[]): string {
  return teile.filter(Boolean).join(" ");
}
