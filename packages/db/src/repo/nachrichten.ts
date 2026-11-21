/**
 * PaiBot – Zugriff auf Nachrichten.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import {
  type ConversationId,
  type ErrorCode,
  type Message,
  type MessageId,
  type MessageRole,
  type MessageStatus,
  type ModelId,
  newId,
  PaiBotError,
  type ProviderId,
  type Route,
  type RunId,
} from "@paibot/shared";
import { and, asc, desc, eq, gte, sql } from "drizzle-orm";
import type { Database } from "../client";
import { conversations, messages } from "../schema";
import { toMessage } from "./abbildung";
import { StatuswechselError, standardFehler, uebersetzen } from "./fehler";
import { withTransaction } from "./transaktion";

export interface MessageCreate {
  id?: MessageId;
  conversationId: ConversationId;
  role: MessageRole;
  content?: string;
  /** Eine Antwort, die noch streamt, beginnt mit `streaming` und leerem Text. */
  status?: MessageStatus;
  runId?: RunId;
  modelId?: ModelId;
  providerId?: ProviderId;
  route?: Route;
  tokensIn?: number;
  tokensOut?: number;
  errorCode?: ErrorCode;
}

/** Abschluss einer streamenden Antwort. */
export interface MessageFinalize {
  status: Exclude<MessageStatus, "streaming">;
  content: string;
  modelId?: ModelId;
  providerId?: ProviderId;
  route?: Route;
  tokensIn?: number;
  tokensOut?: number;
  errorCode?: ErrorCode;
}

/**
 * Fügt eine Nachricht an und setzt `lastMessageAt` der Unterhaltung. Die Zeit kommt aus
 * `clock_timestamp()`, damit Nachrichten derselben Transaktion in Einfüge-Reihenfolge stehen.
 */
export async function insert(db: Database, input: MessageCreate): Promise<Message> {
  return uebersetzen(
    () =>
      withTransaction(db, async (tx) => {
        const [row] = await tx
          .insert(messages)
          .values({
            id: input.id ?? newId("message"),
            conversationId: input.conversationId,
            role: input.role,
            createdAt: sql`pg_catalog.clock_timestamp()`,
            ...(input.content === undefined ? {} : { content: input.content }),
            ...(input.status === undefined ? {} : { status: input.status }),
            runId: input.runId ?? null,
            modelId: input.modelId ?? null,
            providerId: input.providerId ?? null,
            route: input.route ?? null,
            tokensIn: input.tokensIn ?? null,
            tokensOut: input.tokensOut ?? null,
            errorCode: input.errorCode ?? null,
          })
          .returning();
        if (row === undefined) throw new PaiBotError("intern");
        await tx
          .update(conversations)
          .set({ lastMessageAt: row.createdAt, updatedAt: row.createdAt })
          .where(eq(conversations.id, input.conversationId));
        return toMessage(row);
      }),
    standardFehler,
  );
}

export async function get(db: Database, id: MessageId): Promise<Message | undefined> {
  const [row] = await db.select().from(messages).where(eq(messages.id, id));
  return row === undefined ? undefined : toMessage(row);
}

/** Nachrichten einer Unterhaltung, älteste zuerst. Mit `limit` die letzten `limit`, ebenfalls aufsteigend. */
export async function listForConversation(
  db: Database,
  conversationId: ConversationId,
  options: { limit?: number } = {},
): Promise<Message[]> {
  if (options.limit === undefined) {
    const rows = await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(asc(messages.createdAt), asc(messages.id));
    return rows.map(toMessage);
  }
  const rows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(options.limit);
  return rows.reverse().map(toMessage);
}

/**
 * Schließt eine streamende Nachricht ab (Text, Status, Verbrauch). Nur aus `streaming` erlaubt;
 * sonst `StatuswechselError`, gibt es die Nachricht nicht, `nicht_gefunden`.
 */
export async function finalize(
  db: Database,
  id: MessageId,
  input: MessageFinalize,
): Promise<Message> {
  const [row] = await db
    .update(messages)
    .set({
      status: input.status,
      content: input.content,
      ...(input.modelId === undefined ? {} : { modelId: input.modelId }),
      ...(input.providerId === undefined ? {} : { providerId: input.providerId }),
      ...(input.route === undefined ? {} : { route: input.route }),
      ...(input.tokensIn === undefined ? {} : { tokensIn: input.tokensIn }),
      ...(input.tokensOut === undefined ? {} : { tokensOut: input.tokensOut }),
      ...(input.errorCode === undefined ? {} : { errorCode: input.errorCode }),
    })
    .where(and(eq(messages.id, id), eq(messages.status, "streaming")))
    .returning();
  if (row !== undefined) return toMessage(row);
  const [vorhanden] = await db
    .select({ status: messages.status })
    .from(messages)
    .where(eq(messages.id, id));
  if (vorhanden === undefined) throw new PaiBotError("nicht_gefunden");
  throw new StatuswechselError("nachricht", id, vorhanden.status, input.status);
}

/**
 * Verbrauchte Token seit `since`: Eingabe plus Ausgabe aller Antworten des Bots (`assistant`), die
 * ab diesem Zeitpunkt entstanden sind. Grundlage der Tagesgrenze (Lauf-Steuerung) und der Anzeige
 * „heute verbraucht“ (Einstellungen).
 */
export async function tokensSince(db: Database, since: Date): Promise<number> {
  const [row] = await db
    .select({
      total: sql<string>`coalesce(sum(coalesce(${messages.tokensIn}, 0) + coalesce(${messages.tokensOut}, 0)), 0)::text`,
    })
    .from(messages)
    .where(and(eq(messages.role, "assistant"), gte(messages.createdAt, since)));
  return Number(row?.total ?? 0);
}
