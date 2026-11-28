/**
 * PaiBot – Lesen für die Seiten der Bots und Teams auf dem Server: Bots, Teams und der
 * Standard-Bot in einem Zug, geordnet für die Oberfläche (`ordne`).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

import { type Database, repo } from "@paibot/db";
import { type BotsUndTeams, ordne } from "./ansicht";

/**
 * Liest Bots und Teams und ordnet sie für die Oberfläche. Die Unterhaltungen kommen getrennt
 * (`ladeUnterhaltungen`): Der Rahmen hält sie im Browser aktuell und ordnet sie über `botId` zu.
 */
export async function ladeBotsUndTeams(db: Database): Promise<BotsUndTeams> {
  const einstellungen = await repo.settings.get(db);
  const [bots, teams] = await Promise.all([repo.bots.list(db), repo.teams.list(db)]);
  return ordne(bots, teams, einstellungen?.defaultBotId);
}
