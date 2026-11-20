/**
 * PaiBot – Sitzungsprüfung des Ereignis-Stroms: eine einzige Stelle, an der die Anmeldung einhakt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

/** Ergebnis der Prüfung. `sitzung` ist ein fester, nicht geheimer Schlüssel der Sitzung (z. B. ihre ID). */
export type SitzungsErgebnis = { ok: true; sitzung: string } | { ok: false; status: 401 };

/**
 * Prüft, ob die Anfrage zu einer gültigen Sitzung des Besitzers gehört. Wird beim Öffnen des Stroms
 * und danach bei jedem Herzschlag aufgerufen; ein Fehler (Ausnahme) zählt als „abgelehnt“.
 */
export type SitzungPruefen = (request: Request) => Promise<SitzungsErgebnis>;

/** Lehnt jede Anfrage ab. Standard, solange keine echte Prüfung eingetragen ist. */
export const sitzungAblehnen: SitzungPruefen = async () => ({ ok: false, status: 401 });

/**
 * Die Prüfung, die die Route `GET /api/unterhaltungen/:id/ereignisse` benutzt.
 *
 * Hier wird die Prüfung der Anmeldung eingetragen (eine Zeile). Bis dahin liefert die Route
 * immer 401 und öffnet keinen Strom.
 */
export const sitzungPruefen: SitzungPruefen = sitzungAblehnen;
