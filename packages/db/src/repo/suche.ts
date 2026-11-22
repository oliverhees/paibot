/**
 * PaiBot – Suche in Unterhaltungen: Titel und Text der Nachrichten, ohne Groß- und Kleinschreibung.
 * Das Suchwort geht nur als Parameter an die Datenbank und wird als Text verglichen (`strpos`),
 * nie als Muster: `%`, `_` und `\` haben keine besondere Wirkung.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import {
  type ConversationId,
  type IsoTime,
  type MessageId,
  type MessageRole,
  toIsoTime,
} from "@paibot/shared";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "../client";
import { conversations, messages } from "../schema";

/** So viele Zeichen vor dem Treffer kommen in den Ausschnitt (ungefähr, an Wortgrenzen gekürzt). */
export const SNIPPET_BEFORE = 80;
/** So viele Zeichen nach dem Anfang des Treffers kommen höchstens in den Ausschnitt. */
export const SNIPPET_AFTER = 160;

/** Unterhaltung, deren Titel passt. */
export interface TitleHit {
  conversationId: ConversationId;
  title: string;
  /** Letzte Nachricht, sonst Anlegen. */
  time: IsoTime;
}

/** Nachricht, deren Text passt, mit einem Ausschnitt um die Fundstelle (roh, ungekürzt). */
export interface MessageHit {
  conversationId: ConversationId;
  title: string;
  messageId: MessageId;
  role: Extract<MessageRole, "user" | "assistant">;
  time: IsoTime;
  /** Text um die erste Fundstelle (aus der Datenbank, höchstens etwa 250 Zeichen). */
  excerpt: string;
  /** Der Ausschnitt beginnt nicht am Anfang der Nachricht. */
  cutStart: boolean;
  /** Der Ausschnitt endet vor dem Ende der Nachricht. */
  cutEnd: boolean;
}

/**
 * Unterhaltungen, deren Titel das Suchwort enthält, zuletzt benutzte zuerst. `query` ist schon
 * geprüft und gekürzt; leer liefert nichts.
 */
export async function titles(
  db: Database,
  query: string,
  options: { limit: number },
): Promise<TitleHit[]> {
  if (query === "") return [];
  const rows = await db
    .select({
      id: conversations.id,
      title: conversations.title,
      lastMessageAt: conversations.lastMessageAt,
      createdAt: conversations.createdAt,
    })
    .from(conversations)
    .where(
      sql`pg_catalog.strpos(pg_catalog.lower(${conversations.title}), pg_catalog.lower(${query})) > 0`,
    )
    .orderBy(
      desc(sql`coalesce(${conversations.lastMessageAt}, ${conversations.createdAt})`),
      desc(conversations.id),
    )
    .limit(options.limit);
  return rows.map((r) => ({
    conversationId: r.id,
    title: r.title,
    time: toIsoTime(r.lastMessageAt ?? r.createdAt),
  }));
}

/**
 * Nachrichten (deine und die End-Antworten des Bots, keine Zwischentexte eines Laufs mit
 * Werkzeugen), deren Text das Suchwort enthält, neueste zuerst,
 * seitenweise: `offset` Treffer überspringen, höchstens `limit` liefern; `more` sagt, ob es weitere
 * gibt. Der Ausschnitt kommt schon in der Datenbank zugeschnitten, so geht nie der ganze Text
 * einer langen Nachricht über die Leitung.
 */
export async function messageHits(
  db: Database,
  query: string,
  options: { limit: number; offset: number },
): Promise<{ hits: MessageHit[]; more: boolean }> {
  if (query === "") return { hits: [], more: false };
  const position = sql<number>`pg_catalog.strpos(pg_catalog.lower(${messages.content}), pg_catalog.lower(${query}))`;
  const start = sql<number>`greatest(${position} - ${SNIPPET_BEFORE}, 1)`;
  const rows = await db
    .select({
      id: messages.id,
      conversationId: messages.conversationId,
      role: messages.role,
      createdAt: messages.createdAt,
      title: conversations.title,
      start: sql<number>`(${start})::int`,
      length: sql<number>`pg_catalog.char_length(${messages.content})::int`,
      excerpt: sql<string>`pg_catalog.substr(${messages.content}, ${start}, ${SNIPPET_BEFORE + SNIPPET_AFTER})`,
    })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(
      and(
        inArray(messages.role, ["user", "assistant"]),
        isNull(messages.step),
        sql`${position} > 0`,
      ),
    )
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(options.limit + 1)
    .offset(options.offset);
  const hits = rows.slice(0, options.limit).map((r) => {
    const start = Number(r.start);
    return {
      conversationId: r.conversationId,
      title: r.title,
      messageId: r.id,
      role: r.role as MessageHit["role"],
      time: toIsoTime(r.createdAt),
      excerpt: r.excerpt,
      cutStart: start > 1,
      cutEnd: start - 1 + r.excerpt.length < Number(r.length),
    };
  });
  return { hits, more: rows.length > options.limit };
}
