/**
 * PaiBot – Datenbankschema: Werkzeug-Aufrufe des Bots mit Ergebnis, Zustand und Belegen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type {
  ActionId,
  ConversationId,
  MessageId,
  ReceiptId,
  RunId,
  Sha256Digest,
  ToolKey,
} from "@paibot/shared";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
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
  TOOL_REACHES,
  TOOL_RESULT_STATUSES,
  TOOL_SOURCES,
} from "./werte";

/**
 * Werkzeug-Aufrufe: je Zeile ein Wunsch des Modells (Teil der Antwort `message_id` an Stelle
 * `position`) und sein Ergebnis. Die Kennung ist die `action_id` der Aktion `werkzeug.aufrufen`;
 * `decision_receipt_id` und `result_receipt_id` zeigen auf die Belege. Argumente und Ergebnis
 * liegen nur hier, nie im Beleg (dort steht nur ihr Abdruck).
 *
 * Kennung, Abdruck, Wirkung, Herkunft, Schritt und Kennzeichen (`tool_key` bis `untrusted_input`)
 * sind beim Anlegen Pflicht und danach unveränderlich; in der Tabelle dürfen sie leer sein, weil
 * Zeilen aus der Zeit davor sie nicht haben. Das prüft der Trigger `tool_calls_regeln`
 * (Migration 0014), der auch nur diese Wege erlaubt: `requested` → `running` | `denied` |
 * `cancelled`, `running` → `succeeded` | `failed` | `cancelled`. Die Zustände `waiting_approval`
 * und `approved` stehen weiter im CHECK; in dieser Fassung führt kein Weg dorthin.
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
    toolKey: text("tool_key").$type<ToolKey>(),
    toolDigest: text("tool_digest").$type<Sha256Digest>(),
    reach: text("reach").$type<(typeof TOOL_REACHES)[number]>(),
    foreignContent: boolean("foreign_content"),
    step: integer("step"),
    untrustedInput: boolean("untrusted_input"),
    rawName: text("raw_name"),
    outputTruncated: boolean("output_truncated"),
    outputChars: integer("output_chars"),
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
    check(
      "tool_calls_tool_key_format",
      sql`${t.toolKey} is null or (char_length(${t.toolKey}) <= 140 and ${matches(t.toolKey, "^[a-z][a-z0-9]*(/[a-z0-9][a-z0-9_.-]{0,63}){1,2}$")})`,
    ),
    check(
      "tool_calls_tool_digest_format",
      sql`${t.toolDigest} is null or ${matches(t.toolDigest, PATTERNS.sha256Digest)}`,
    ),
    check(
      "tool_calls_reach_werte",
      sql`${t.reach} is null or ${t.reach} in (${valueList(TOOL_REACHES)})`,
    ),
    check("tool_calls_step_nicht_negativ", sql`${t.step} is null or ${t.step} >= 0`),
    check(
      "tool_calls_raw_name_laenge",
      sql`${t.rawName} is null or char_length(${t.rawName}) between 1 and 64`,
    ),
    check(
      "tool_calls_output_chars_nicht_negativ",
      sql`${t.outputChars} is null or ${t.outputChars} >= 0`,
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
