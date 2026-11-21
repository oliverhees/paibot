/**
 * PaiBot – Zugriff auf Werkzeug-Aufrufe: anlegen, Entscheidung des Tors festhalten, Zustand
 * wechseln, Ergebnis speichern und für den Verlauf lesen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import {
  type ActionId,
  type ConversationId,
  type ErrorCode,
  type HmacDigest,
  type MessageId,
  PaiBotError,
  type ReceiptId,
  type RunId,
  type ToolCallRecord,
  type ToolCallStatus,
  type ToolKind,
  type ToolSource,
  toIsoTime,
} from "@paibot/shared";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../client";
import { type ToolCallRow, toolCalls } from "../schema";
import { StatuswechselError, standardFehler, uebersetzen } from "./fehler";

/** Erlaubte Wege: Zielzustand → Zustände, aus denen man dorthin wechseln darf. */
export const TOOL_CALL_TRANSITIONS: Readonly<Record<ToolCallStatus, readonly ToolCallStatus[]>> = {
  requested: [],
  waiting_approval: ["requested"],
  approved: ["waiting_approval"],
  running: ["requested", "approved"],
  succeeded: ["running"],
  failed: ["running"],
  denied: ["requested", "waiting_approval"],
  cancelled: ["requested", "waiting_approval", "approved", "running"],
};

export interface ToolCallCreate {
  actionId: ActionId;
  conversationId: ConversationId;
  runId: RunId;
  messageId: MessageId;
  position: number;
  callId: string;
  name: string;
  source: ToolSource;
  server?: string;
  kind: ToolKind;
  input: unknown;
  argsDigest: HmacDigest;
}

function toToolCall(row: ToolCallRow): ToolCallRecord {
  return {
    actionId: row.actionId,
    conversationId: row.conversationId,
    runId: row.runId,
    messageId: row.messageId,
    position: row.position,
    callId: row.callId,
    name: row.name,
    source: row.source,
    ...(row.server === null ? {} : { server: row.server }),
    kind: row.kind,
    input: row.input,
    argsDigest: row.argsDigest,
    status: row.status,
    ...(row.decisionReceiptId === null ? {} : { decisionReceiptId: row.decisionReceiptId }),
    ...(row.resultReceiptId === null ? {} : { resultReceiptId: row.resultReceiptId }),
    ...(row.resultStatus === null ? {} : { resultStatus: row.resultStatus }),
    ...(row.output === null || row.output === undefined ? {} : { output: row.output }),
    ...(row.errorCode === null ? {} : { errorCode: row.errorCode as ErrorCode }),
    createdAt: toIsoTime(row.createdAt),
    updatedAt: toIsoTime(row.updatedAt),
    ...(row.finishedAt === null ? {} : { finishedAt: toIsoTime(row.finishedAt) }),
  };
}

/** Legt einen Aufruf im Zustand `requested` an (vor dem Tor). */
export async function create(db: Database, input: ToolCallCreate): Promise<ToolCallRecord> {
  const [row] = await uebersetzen(
    () =>
      db
        .insert(toolCalls)
        .values({
          actionId: input.actionId,
          conversationId: input.conversationId,
          runId: input.runId,
          messageId: input.messageId,
          position: input.position,
          callId: input.callId,
          name: input.name,
          source: input.source,
          server: input.server ?? null,
          kind: input.kind,
          input: input.input,
          argsDigest: input.argsDigest,
        })
        .returning(),
    standardFehler,
  );
  if (row === undefined) throw new PaiBotError("intern");
  return toToolCall(row);
}

export async function get(db: Database, actionId: ActionId): Promise<ToolCallRecord | undefined> {
  const [row] = await db.select().from(toolCalls).where(eq(toolCalls.actionId, actionId));
  return row === undefined ? undefined : toToolCall(row);
}

/** Alle Aufrufe eines Laufs, in der Reihenfolge der Antworten und ihrer Stellen. */
export async function listForRun(db: Database, runId: RunId): Promise<ToolCallRecord[]> {
  const rows = await db
    .select()
    .from(toolCalls)
    .where(eq(toolCalls.runId, runId))
    .orderBy(asc(toolCalls.createdAt), asc(toolCalls.messageId), asc(toolCalls.position));
  return rows.map(toToolCall);
}

/** Aufrufe zu diesen Antworten, je Antwort nach Stelle geordnet; für den Verlauf an das Modell. */
export async function listForMessages(
  db: Database,
  messageIds: readonly MessageId[],
): Promise<ToolCallRecord[]> {
  if (messageIds.length === 0) return [];
  const rows = await db
    .select()
    .from(toolCalls)
    .where(inArray(toolCalls.messageId, [...messageIds]))
    .orderBy(asc(toolCalls.messageId), asc(toolCalls.position));
  return rows.map(toToolCall);
}

/** Aufrufe einer Unterhaltung, die auf die Freigabe des Besitzers warten. */
export async function listWaiting(
  db: Database,
  conversationId: ConversationId,
): Promise<ToolCallRecord[]> {
  const rows = await db
    .select()
    .from(toolCalls)
    .where(
      and(eq(toolCalls.conversationId, conversationId), eq(toolCalls.status, "waiting_approval")),
    )
    .orderBy(asc(toolCalls.createdAt), asc(toolCalls.position));
  return rows.map(toToolCall);
}

async function wechseln(
  db: Database,
  actionId: ActionId,
  nach: ToolCallStatus,
  felder: Partial<typeof toolCalls.$inferInsert>,
): Promise<ToolCallRecord> {
  const [row] = await uebersetzen(
    () =>
      db
        .update(toolCalls)
        .set({ status: nach, updatedAt: sql`pg_catalog.now()`, ...felder })
        .where(
          and(
            eq(toolCalls.actionId, actionId),
            inArray(toolCalls.status, [...TOOL_CALL_TRANSITIONS[nach]]),
          ),
        )
        .returning(),
    standardFehler,
  );
  if (row !== undefined) return toToolCall(row);
  const [vorhanden] = await db
    .select({ status: toolCalls.status })
    .from(toolCalls)
    .where(eq(toolCalls.actionId, actionId));
  if (vorhanden === undefined) throw new PaiBotError("nicht_gefunden");
  throw new StatuswechselError("werkzeug", actionId, vorhanden.status, nach);
}

/**
 * Hält die Entscheidung des Tors fest: `allow` → `running`, `ask` → `waiting_approval`,
 * `deny` → `denied` (mit Ergebnis `denied` für das Modell).
 */
export function recordDecision(
  db: Database,
  actionId: ActionId,
  input:
    | { outcome: "allow"; decisionReceiptId: ReceiptId }
    | { outcome: "ask"; decisionReceiptId: ReceiptId }
    | {
        outcome: "deny";
        decisionReceiptId: ReceiptId;
        resultReceiptId?: ReceiptId;
        output: unknown;
        errorCode?: ErrorCode;
        now?: Date;
      },
): Promise<ToolCallRecord> {
  if (input.outcome === "allow") {
    return wechseln(db, actionId, "running", { decisionReceiptId: input.decisionReceiptId });
  }
  if (input.outcome === "ask") {
    return wechseln(db, actionId, "waiting_approval", {
      decisionReceiptId: input.decisionReceiptId,
    });
  }
  return wechseln(db, actionId, "denied", {
    decisionReceiptId: input.decisionReceiptId,
    resultReceiptId: input.resultReceiptId ?? null,
    resultStatus: "denied",
    output: input.output,
    errorCode: input.errorCode ?? "abgelehnt",
    finishedAt: input.now ?? new Date(),
  });
}

/** `waiting_approval` → `approved`: der Besitzer hat zugestimmt. */
export function approve(db: Database, actionId: ActionId): Promise<ToolCallRecord> {
  return wechseln(db, actionId, "approved", {});
}

/** `approved` → `running`: der fortgesetzte Lauf führt den Aufruf jetzt aus. */
export function markRunning(db: Database, actionId: ActionId): Promise<ToolCallRecord> {
  return wechseln(db, actionId, "running", {});
}

/**
 * `waiting_approval` → `denied`: der Besitzer hat abgelehnt. Das Modell bekommt `output` als
 * Ergebnis `denied`.
 */
export function rejectByOwner(
  db: Database,
  actionId: ActionId,
  input: { output: unknown; now?: Date },
): Promise<ToolCallRecord> {
  return wechseln(db, actionId, "denied", {
    resultStatus: "denied",
    output: input.output,
    errorCode: "abgelehnt",
    finishedAt: input.now ?? new Date(),
  });
}

/** `running` → `succeeded` oder `failed` mit Ergebnis und Ergebnis-Beleg. */
export function finish(
  db: Database,
  actionId: ActionId,
  input: {
    status: "succeeded" | "failed";
    output: unknown;
    resultReceiptId: ReceiptId;
    errorCode?: ErrorCode;
    now?: Date;
  },
): Promise<ToolCallRecord> {
  return wechseln(db, actionId, input.status, {
    resultStatus: input.status === "succeeded" ? "ok" : "error",
    output: input.output,
    resultReceiptId: input.resultReceiptId,
    errorCode: input.errorCode ?? null,
    finishedAt: input.now ?? new Date(),
  });
}

/** Bricht einen offenen Aufruf ab (Lauf abgebrochen); das Modell bekommt `output` als Fehler. */
export function cancel(
  db: Database,
  actionId: ActionId,
  input: { output: unknown; now?: Date },
): Promise<ToolCallRecord> {
  return wechseln(db, actionId, "cancelled", {
    resultStatus: "error",
    output: input.output,
    errorCode: "unterbrochen",
    finishedAt: input.now ?? new Date(),
  });
}
