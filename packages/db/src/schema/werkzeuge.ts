/**
 * PaiBot – Datenbankschema: Werkzeug-Aufrufe des Bots mit Ergebnis, Zustand und Belegen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { ActionId, ConversationId, MessageId, ReceiptId, RunId } from "@paibot/shared";
import { sql } from "drizzle-orm";
import { check, index, integer, jsonb, text, timestamp, unique } from "drizzle-orm/pg-core";
import {
  idCheck,
  inListCheck,
  matches,
  optionalIdCheck,
  PATTERNS,
  pgTable,
  valueList,
} from "./helfer";
import { belege } from "./tor";
import { conversations, messages, runs } from "./unterhaltungen";
import {
  FINISHED_TOOL_CALL_STATUSES,
  TOOL_CALL_STATUSES,
  TOOL_KINDS,
  TOOL_RESULT_STATUSES,
  TOOL_SOURCES,
} from "./werte";

/**
 * Werkzeug-Aufrufe: je Zeile ein Wunsch des Modells (Teil der Antwort `message_id` an Stelle
 * `position`) und sein Ergebnis. Die Kennung ist die `action_id` der Aktion `werkzeug.aufrufen`;
 * `decision_receipt_id` und `result_receipt_id` zeigen auf die Belege. Ein Lauf, der auf eine
 * Freigabe wartet, hat Aufrufe im Zustand `waiting_approval`. Argumente und Ergebnis liegen nur
 * hier, nie im Beleg (dort steht nur ihr Abdruck).
 */
export const toolCalls = pgTable(
  "tool_calls",
  {
    actionId: text("action_id").$type<ActionId>().primaryKey(),
    conversationId: text("conversation_id")
      .$type<ConversationId>()
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    runId: text("run_id")
      .$type<RunId>()
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    messageId: text("message_id")
      .$type<MessageId>()
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    callId: text("call_id").notNull(),
    name: text("name").notNull(),
    source: text("source").$type<(typeof TOOL_SOURCES)[number]>().notNull(),
    server: text("server"),
    kind: text("kind").$type<(typeof TOOL_KINDS)[number]>().notNull(),
    input: jsonb("input").$type<unknown>().notNull(),
    argsDigest: text("args_digest").notNull(),
    status: text("status")
      .$type<(typeof TOOL_CALL_STATUSES)[number]>()
      .notNull()
      .default("requested"),
    decisionReceiptId: text("decision_receipt_id")
      .$type<ReceiptId>()
      .references(() => belege.id, { onDelete: "restrict" }),
    resultReceiptId: text("result_receipt_id")
      .$type<ReceiptId>()
      .references(() => belege.id, { onDelete: "restrict" }),
    resultStatus: text("result_status").$type<(typeof TOOL_RESULT_STATUSES)[number]>(),
    output: jsonb("output").$type<unknown>(),
    errorCode: text("error_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    idCheck("tool_calls_action_id_format", t.actionId, "action"),
    check("tool_calls_position_nicht_negativ", sql`${t.position} >= 0`),
    check("tool_calls_call_id_laenge", sql`char_length(${t.callId}) between 1 and 200`),
    check("tool_calls_name_format", matches(t.name, "^[A-Za-z0-9_-]{1,64}$")),
    inListCheck("tool_calls_source_werte", t.source, TOOL_SOURCES),
    check(
      "tool_calls_server_nur_bei_mcp",
      sql`(${t.server} is null) = (${t.source} <> 'mcp') and (${t.server} is null or ${matches(t.server, "^[a-z0-9][a-z0-9_-]{0,63}$")})`,
    ),
    inListCheck("tool_calls_kind_werte", t.kind, TOOL_KINDS),
    check("tool_calls_args_digest_format", matches(t.argsDigest, PATTERNS.hmacDigest)),
    inListCheck("tool_calls_status_werte", t.status, TOOL_CALL_STATUSES),
    optionalIdCheck("tool_calls_decision_receipt_id_format", t.decisionReceiptId, "receipt"),
    optionalIdCheck("tool_calls_result_receipt_id_format", t.resultReceiptId, "receipt"),
    check(
      "tool_calls_entscheidung_nach_dem_tor",
      sql`${t.status} = 'requested' or ${t.status} = 'cancelled' or ${t.decisionReceiptId} is not null`,
    ),
    check(
      "tool_calls_result_status_werte",
      sql`${t.resultStatus} is null or ${t.resultStatus} in (${valueList(TOOL_RESULT_STATUSES)})`,
    ),
    check(
      "tool_calls_ergebnis_nur_wenn_erledigt",
      sql`(${t.resultStatus} is not null) = (${t.status} in (${valueList(FINISHED_TOOL_CALL_STATUSES)})) and (${t.finishedAt} is not null) = (${t.status} in (${valueList(FINISHED_TOOL_CALL_STATUSES)}))`,
    ),
    check(
      "tool_calls_error_code_format",
      sql`${t.errorCode} is null or ${matches(t.errorCode, PATTERNS.errorCode)}`,
    ),
    unique("tool_calls_stelle_eindeutig").on(t.messageId, t.position),
    unique("tool_calls_call_id_eindeutig").on(t.messageId, t.callId),
    unique("tool_calls_decision_receipt_id_eindeutig").on(t.decisionReceiptId),
    unique("tool_calls_result_receipt_id_eindeutig").on(t.resultReceiptId),
    index("tool_calls_run_id_idx").on(t.runId),
    index("tool_calls_wartend_idx")
      .on(t.conversationId)
      .where(sql`${t.status} = 'waiting_approval'`),
  ],
);

export type ToolCallRow = typeof toolCalls.$inferSelect;
