/**
 * PaiBot – Hilfen für die Tests der Zugriffsfunktionen: Beispiel-Bot, -Unterhaltung und -Nachricht anlegen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { expect } from "vitest";
import type { Database } from "../client";
import { bots, conversations, messages } from "../schema";
import { botRow, conversationRow, messageRow } from "../testdaten";

/** Legt Bot, Unterhaltung und eine Nutzer-Nachricht an und gibt die Zeilen zurück. */
export async function beispiel(db: Database) {
  const [bot] = await db.insert(bots).values(botRow()).returning();
  if (bot === undefined) throw new Error("Bot fehlt");
  const [unterhaltung] = await db.insert(conversations).values(conversationRow(bot.id)).returning();
  if (unterhaltung === undefined) throw new Error("Unterhaltung fehlt");
  const [nachricht] = await db.insert(messages).values(messageRow(unterhaltung.id)).returning();
  if (nachricht === undefined) throw new Error("Nachricht fehlt");
  return { bot, unterhaltung, nachricht };
}

/** Ein Fehler mit diesem Code der Verträge. */
export function mitCode(code: string) {
  return expect.objectContaining({ code });
}
