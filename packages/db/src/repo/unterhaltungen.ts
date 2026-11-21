/**
 * PaiBot – Zugriff auf Unterhaltungen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import {
  type BotId,
  type Conversation,
  type ConversationId,
  newId,
  PaiBotError,
  type SchleuseMode,
} from "@paibot/shared";
import { desc, eq, sql } from "drizzle-orm";
import type { Database } from "../client";
import { conversations } from "../schema";
import { toConversation } from "./abbildung";
import { standardFehler, uebersetzen } from "./fehler";

export interface ConversationCreate {
  id?: ConversationId;
  botId: BotId;
  title: string;
  schleuseMode?: SchleuseMode;
}

/** Legt eine Unterhaltung an. Gibt es den Bot nicht, folgt `nicht_gefunden`. */
export async function create(db: Database, input: ConversationCreate): Promise<Conversation> {
  const [row] = await uebersetzen(
    () =>
      db
        .insert(conversations)
        .values({
          id: input.id ?? newId("conversation"),
          botId: input.botId,
          title: input.title,
          schleuseMode: input.schleuseMode ?? null,
        })
        .returning(),
    standardFehler,
  );
  if (row === undefined) throw new PaiBotError("intern");
  return toConversation(row);
}

export async function get(db: Database, id: ConversationId): Promise<Conversation | undefined> {
  const [row] = await db.select().from(conversations).where(eq(conversations.id, id));
  return row === undefined ? undefined : toConversation(row);
}

/** Zuletzt benutzte zuerst; Unterhaltungen ohne Nachricht stehen am Ende, neueste davon vorn. */
export async function list(
  db: Database,
  options: { limit?: number; offset?: number; botId?: BotId } = {},
): Promise<Conversation[]> {
  const rows = await db
    .select()
    .from(conversations)
    .where(options.botId === undefined ? undefined : eq(conversations.botId, options.botId))
    .orderBy(
      sql`${conversations.lastMessageAt} desc nulls last`,
      desc(conversations.createdAt),
      desc(conversations.id),
    )
    .limit(options.limit ?? 50)
    .offset(options.offset ?? 0);
  return rows.map(toConversation);
}

/** Benennt um. `undefined`, wenn es die Unterhaltung nicht gibt. */
export async function rename(
  db: Database,
  id: ConversationId,
  title: string,
): Promise<Conversation | undefined> {
  const [row] = await uebersetzen(
    () =>
      db
        .update(conversations)
        .set({ title, updatedAt: sql`pg_catalog.now()` })
        .where(eq(conversations.id, id))
        .returning(),
    standardFehler,
  );
  return row === undefined ? undefined : toConversation(row);
}

/** Setzt den Modus der Datenschleuse für diese Unterhaltung; `null` heißt „Standard“. */
export async function setSchleuseMode(
  db: Database,
  id: ConversationId,
  mode: SchleuseMode | null,
): Promise<Conversation | undefined> {
  const [row] = await uebersetzen(
    () =>
      db
        .update(conversations)
        .set({ schleuseMode: mode, updatedAt: sql`pg_catalog.now()` })
        .where(eq(conversations.id, id))
        .returning(),
    standardFehler,
  );
  return row === undefined ? undefined : toConversation(row);
}

/**
 * Löscht die Unterhaltung. Nachrichten, Läufe und Ereignisse verschwinden mit (Kaskade);
 * Belege bleiben, sie enthalten keine Inhalte. `true`, wenn es sie gab.
 */
export async function remove(db: Database, id: ConversationId): Promise<boolean> {
  const geloescht = await db
    .delete(conversations)
    .where(eq(conversations.id, id))
    .returning({ id: conversations.id });
  return geloescht.length > 0;
}
