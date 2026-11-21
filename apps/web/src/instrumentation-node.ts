/**
 * PaiBot – prüft beim Serverstart Einstellungen und Datenbank (Migrationen, Rollen, Stand).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-07
 */

import { prepareStart } from "./lib/betrieb";
import { zugangBeimStart } from "./lib/zugang/start";

/**
 * Bereitet beim Serverstart die Datenbank vor: Migrationen mit der Migrations-Rolle, Rechte der
 * App-Rolle, Prüfung von Stand und Rechten. In Produktion bricht ein Fehler den Start ab.
 * Ohne DATABASE_URL startet die Entwicklung ohne Datenbank (z. B. für die UI-Entwicklung).
 */
export async function applyMigrations() {
  await prepareStart(process.env);
  await zugangBeimStart();
}
