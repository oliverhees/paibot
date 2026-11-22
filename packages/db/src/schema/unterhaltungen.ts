/**
 * PaiBot – Datenbankschema: Unterhaltungen, Nachrichten, Läufe und der Ereignis-Strom.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type {
  BotId,
  ConversationId,
  MessageId,
  ModelId,
  ProviderId,
  RunId,
  TeamId,
} from "@paibot/shared";
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { bots } from "./anbieter";
import {
  idCheck,
  inListCheck,
  matches,
  optionalIdCheck,
  PATTERNS,
  pgTable,
  valueList,
} from "./helfer";
import { teams } from "./teams";
import {
  ACTIVE_RUN_STATUSES,
  CONVERSATION_EVENT_TYPES,
  CONVERSATION_KINDS,
  MESSAGE_ORIGINS,
  MESSAGE_ROLES,
  MESSAGE_STATUSES,
  ROUTES,
  RUN_STATUSES,
  SCHLEUSE_MODES,
} from "./werte";

/**
 * Gespräche. Ein Direkt-Chat (`kind = 'direkt'`) und ein Entwurf (`'entwurf'`) gehören einem Bot;
 * ein Faden (`'faden'`) gehört einem Team und hat keinen Bot (`bot_id` ist leer). Die CHECK-Regel
 * `conversations_bot_oder_team` erzwingt das. `schleuse_mode` ist leer, wenn der Standard aus den
 * Einstellungen gilt. Löscht man einen Bot, gehen seine Direkt-Chats mit (aber nur, wenn er keine
 * Läufe hat: `runs.bot_id` verhindert das Löschen); ein Team mit Fäden lässt sich nicht löschen.
 */
export const conversations = pgTable(
  "conversations",
  {
    id: text("id").$type<ConversationId>().primaryKey(),
    botId: text("bot_id")
      .$type<BotId>()
      .references(() => bots.id, { onDelete: "cascade" }),
    kind: text("kind").$type<(typeof CONVERSATION_KINDS)[number]>().notNull().default("direkt"),
    teamId: text("team_id")
      .$type<TeamId>()
      .references(() => teams.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    schleuseMode: text("schleuse_mode").$type<(typeof SCHLEUSE_MODES)[number]>(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    idCheck("conversations_id_format", t.id, "conversation"),
    check("conversations_title_laenge", sql`char_length(${t.title}) between 1 and 200`),
    inListCheck("conversations_kind_werte", t.kind, CONVERSATION_KINDS),
    optionalIdCheck("conversations_team_id_format", t.teamId, "team"),
    check(
      "conversations_bot_oder_team",
      sql`(${t.kind} in ('direkt', 'entwurf') and ${t.botId} is not null and ${t.teamId} is null) or (${t.kind} = 'faden' and ${t.botId} is null and ${t.teamId} is not null)`,
    ),
    index("conversations_team_id_idx").on(t.teamId),
    check(
      "conversations_schleuse_mode_werte",
      sql`${t.schleuseMode} is null or ${t.schleuseMode} in (${valueList(SCHLEUSE_MODES)})`,
    ),
    index("conversations_last_message_at_idx").on(sql`${t.lastMessageAt} desc nulls last`),
  ],
);

/**
 * Nachrichten einer Unterhaltung. Der Text steht nur hier und in den Ereignissen. `step` ist leer
 * bei Nachrichten der Person und bei der End-Antwort eines Laufs; ein Zwischentext eines Laufs mit
 * Werkzeugen trägt seinen Schritt. Je Lauf gibt es höchstens eine End-Antwort und je Schritt
 * höchstens einen Zwischentext. Schritt, Herkunft, Rolle, Lauf und Unterhaltung sind nach dem
 * Anlegen unveränderlich (Trigger `messages_unveraenderlich`, Migration 0014).
 */
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
    /** Anbieter und Modell, die laut Antwort der Schnittstelle geantwortet haben (wenn gemeldet). */
    servedProvider: text("served_provider"),
    servedModel: text("served_model"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    /** Schritt eines Laufs mit Werkzeugen; leer = End-Antwort bzw. Nachricht der Person. */
    step: integer("step"),
    /** Woher der Text stammt: vom Modell oder als fester Text von PaiBot. */
    origin: text("origin").$type<(typeof MESSAGE_ORIGINS)[number]>().notNull().default("modell"),
    /**
     * Die Nachricht enthält oder stützt sich auf fremde Inhalte (z. B. aus einer App). Wird nur
     * gesetzt, nie zurückgenommen (Trigger `messages_unveraenderlich`, Migration 0016).
     */
    untrusted: boolean("untrusted").notNull().default(false),
  },
  (t) => [
    idCheck("messages_id_format", t.id, "message"),
    check(
      "messages_served_provider_format",
      sql`${t.servedProvider} is null or ${matches(t.servedProvider, "^[a-z0-9][a-z0-9._-]{0,63}$")}`,
    ),
    check(
      "messages_served_model_format",
      sql`${t.servedModel} is null or ${matches(t.servedModel, "^[!-~]{1,200}$")}`,
    ),
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
    check("messages_step_nicht_negativ", sql`${t.step} is null or ${t.step} >= 0`),
    inListCheck("messages_origin_werte", t.origin, MESSAGE_ORIGINS),
    check("messages_fest_nur_bot", sql`${t.origin} <> 'fest' or ${t.role} = 'assistant'`),
    check(
      "messages_schritt_nur_bot",
      sql`${t.step} is null or (${t.role} = 'assistant' and ${t.runId} is not null)`,
    ),
    index("messages_conversation_created_idx").on(t.conversationId, t.createdAt),
    index("messages_run_id_idx").on(t.runId),
    uniqueIndex("messages_eine_antwort_je_lauf")
      .on(t.runId)
      .where(sql`${t.role} = 'assistant' and ${t.step} is null and ${t.runId} is not null`),
    uniqueIndex("messages_ein_schritt").on(t.runId, t.step).where(sql`${t.step} is not null`),
  ],
);

/**
 * Läufe: die Arbeit an einer Antwort im Hintergrund. Ein Lauf, der auf eine Freigabe wartet,
 * zählt als offen. Fortgesetzt wird er durch einen neuen Lauf, der über `resumes_run_id` auf ihn zeigt.
 * In dieser Fassung führt kein Weg nach `waiting_approval` (Trigger `runs_regeln`, Migration 0014).
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
      .references(() => bots.id, { onDelete: "restrict" }),
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
 * Ereignis-Strom je Unterhaltung. Es wird nur angehängt; gelöscht werden nur `text.delta`- und
 * `draft.delta`-Ereignisse (und alles zusammen mit der Unterhaltung).
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
      .where(sql`${t.type} in ('text.delta', 'draft.delta')`),
  ],
);

export type Conversation = typeof conversations.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Run = typeof runs.$inferSelect;
export type ConversationEventRow = typeof conversationEvents.$inferSelect;
