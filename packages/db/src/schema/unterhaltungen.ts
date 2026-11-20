/**
 * PaiBot – Datenbankschema: Unterhaltungen, Nachrichten, Läufe und der Ereignis-Strom.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { BotId, ConversationId, MessageId, ModelId, ProviderId, RunId } from "@paibot/shared";
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { bots } from "./anbieter";
import { idCheck, inListCheck, matches, optionalIdCheck, PATTERNS, valueList } from "./helfer";
import {
  ACTIVE_RUN_STATUSES,
  CONVERSATION_EVENT_TYPES,
  MESSAGE_ROLES,
  MESSAGE_STATUSES,
  ROUTES,
  RUN_STATUSES,
  SCHLEUSE_MODES,
} from "./werte";

/** Gespräche mit dem Bot. `schleuse_mode` ist leer, wenn der Standard aus den Einstellungen gilt. */
export const conversations = pgTable(
  "conversations",
  {
    id: text("id").$type<ConversationId>().primaryKey(),
    botId: text("bot_id")
      .$type<BotId>()
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    schleuseMode: text("schleuse_mode").$type<(typeof SCHLEUSE_MODES)[number]>(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    idCheck("conversations_id_format", t.id, "conversation"),
    check("conversations_title_laenge", sql`char_length(${t.title}) between 1 and 200`),
    check(
      "conversations_schleuse_mode_werte",
      sql`${t.schleuseMode} is null or ${t.schleuseMode} in (${valueList(SCHLEUSE_MODES)})`,
    ),
    index("conversations_last_message_at_idx").on(sql`${t.lastMessageAt} desc nulls last`),
  ],
);

/** Nachrichten einer Unterhaltung. Der Text steht nur hier und in den Ereignissen. */
export const messages = pgTable(
  "messages",
  {
    id: text("id").$type<MessageId>().primaryKey(),
    conversationId: text("conversation_id")
      .$type<ConversationId>()
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").$type<(typeof MESSAGE_ROLES)[number]>().notNull(),
    content: text("content").notNull().default(""),
    status: text("status").$type<(typeof MESSAGE_STATUSES)[number]>().notNull().default("complete"),
    runId: text("run_id").$type<RunId>(),
    modelId: text("model_id").$type<ModelId>(),
    providerId: text("provider_id").$type<ProviderId>(),
    route: text("route").$type<(typeof ROUTES)[number]>(),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    idCheck("messages_id_format", t.id, "message"),
    optionalIdCheck("messages_run_id_format", t.runId, "run"),
    optionalIdCheck("messages_model_id_format", t.modelId, "model"),
    optionalIdCheck("messages_provider_id_format", t.providerId, "provider"),
    inListCheck("messages_role_werte", t.role, MESSAGE_ROLES),
    inListCheck("messages_status_werte", t.status, MESSAGE_STATUSES),
    check("messages_route_werte", sql`${t.route} is null or ${t.route} in (${valueList(ROUTES)})`),
    check("messages_tokens_in_nicht_negativ", sql`${t.tokensIn} is null or ${t.tokensIn} >= 0`),
    check("messages_tokens_out_nicht_negativ", sql`${t.tokensOut} is null or ${t.tokensOut} >= 0`),
    check(
      "messages_error_code_format",
      sql`${t.errorCode} is null or ${matches(t.errorCode, PATTERNS.errorCode)}`,
    ),
    index("messages_conversation_created_idx").on(t.conversationId, t.createdAt),
    index("messages_run_id_idx").on(t.runId),
  ],
);

/**
 * Läufe: die Arbeit an einer Antwort im Hintergrund. Ein Lauf, der auf eine Freigabe wartet,
 * zählt als offen. Fortgesetzt wird er durch einen neuen Lauf, der über `resumes_run_id` auf ihn zeigt.
 */
export const runs = pgTable(
  "runs",
  {
    id: text("id").$type<RunId>().primaryKey(),
    conversationId: text("conversation_id")
      .$type<ConversationId>()
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    triggerMessageId: text("trigger_message_id")
      .$type<MessageId>()
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    botId: text("bot_id")
      .$type<BotId>()
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    status: text("status").$type<(typeof RUN_STATUSES)[number]>().notNull().default("queued"),
    resumesRunId: text("resumes_run_id")
      .$type<RunId>()
      .references((): AnyPgColumn => runs.id, { onDelete: "set null" }),
    cancelRequestedAt: timestamp("cancel_requested_at", { withTimezone: true }),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    idCheck("runs_id_format", t.id, "run"),
    inListCheck("runs_status_werte", t.status, RUN_STATUSES),
    check(
      "runs_resumes_run_id_anders",
      sql`${t.resumesRunId} is null or ${t.resumesRunId} <> ${t.id}`,
    ),
    check(
      "runs_error_code_format",
      sql`${t.errorCode} is null or ${matches(t.errorCode, PATTERNS.errorCode)}`,
    ),
    index("runs_conversation_created_idx").on(t.conversationId, t.createdAt),
    index("runs_resumes_run_id_idx").on(t.resumesRunId),
    uniqueIndex("runs_ein_offener_lauf_je_unterhaltung")
      .on(t.conversationId)
      .where(sql`${t.status} in (${valueList(ACTIVE_RUN_STATUSES)})`),
    index("runs_aktiv_heartbeat_idx")
      .on(t.status, t.heartbeatAt)
      .where(sql`${t.status} in ('queued', 'running')`),
  ],
);

/**
 * Ereignis-Strom je Unterhaltung. Es wird nur angehängt; gelöscht werden nur `text.delta`-Ereignisse
 * (und alles zusammen mit der Unterhaltung).
 */
export const conversationEvents = pgTable(
  "conversation_events",
  {
    conversationId: text("conversation_id")
      .$type<ConversationId>()
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    seq: bigint("seq", { mode: "number" }).notNull(),
    runId: text("run_id").$type<RunId>(),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.conversationId, t.seq] }),
    optionalIdCheck("conversation_events_run_id_format", t.runId, "run"),
    check("conversation_events_seq_ab_eins", sql`${t.seq} >= 1`),
    inListCheck("conversation_events_type_werte", t.type, CONVERSATION_EVENT_TYPES),
    check("conversation_events_payload_objekt", sql`jsonb_typeof(${t.payload}) = 'object'`),
    index("conversation_events_run_id_idx").on(t.runId),
    index("conversation_events_aufraeumen_idx")
      .on(t.createdAt)
      .where(sql`${t.type} = 'text.delta'`),
  ],
);

export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Run = typeof runs.$inferSelect;
export type ConversationEventRow = typeof conversationEvents.$inferSelect;
