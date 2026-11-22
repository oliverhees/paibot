/**
 * PaiBot – Pausen-Stand eines Bots für das Tor, frisch aus der Datenbank.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { type Database, repo } from "@paibot/db";
import type { BotId } from "@paibot/shared/ids";

/**
 * Ob der Bot gerade pausiert ist, gelesen aus seiner Zeile in der Datenbank. Jede Anfrage ans Tor,
 * die den Fakt `botPaused` trägt (`modell.anfragen` je Schritt, `werkzeug.aufrufen` je Aufruf), liest
 * ihn mit dieser Funktion neu: Eine Pause mitten im Lauf gilt damit ab dem nächsten Schritt und dem
 * nächsten Aufruf. Gibt es die Zeile nicht, kommt `undefined`, nie ein Standardwert: Der Aufrufer
 * lehnt dann ab, statt „nicht pausiert“ anzunehmen.
 */
export async function readBotPaused(db: Database, botId: BotId): Promise<boolean | undefined> {
  const bot = await repo.bots.get(db, botId);
  return bot === undefined ? undefined : bot.paused;
}
