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
import { warteschlangeBeimStart } from "./lib/warteschlange";
import { zugangBeimStart } from "./lib/zugang/start";

/**
 * Läuft beim Serverstart (`prepareStart`): Mit `PAIBOT_ROLE=migrate` Migrations-Schritt und Ende
 * des Prozesses; sonst prüft die Web-App in Produktion nur Stand und Rechte (sie migriert dort nie).
 * In der Entwicklung migriert sie selbst; ohne DATABASE_URL startet sie ohne Datenbank. Danach
 * startet sie die Warteschlange, deren Wartung in der Web-App läuft.
 */
export async function applyMigrations() {
  await prepareStart(process.env);
  await zugangBeimStart();
  // Nicht abwarten: Die Seite soll nicht auf die Warteschlange warten.
  void warteschlangeBeimStart();
}
