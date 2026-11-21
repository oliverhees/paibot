/**
 * PaiBot – Ereignis-Strom einer Unterhaltung: alle Ereignisse, ihr Schema und das Kodieren für
 * die Übertragung per Server-Sent Events.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { z } from "zod";
import { actionTypeSchema } from "./actions";
import { errorCodeSchema } from "./errors";
import { isoTimeSchema, positiveIntSchema, servedBySchema, tokenUsageSchema } from "./grundtypen";
import { idSchema } from "./id";
import {
  messageRoleSchema,
  routeSchema,
  toolCallStatusSchema,
  toolKindSchema,
  toolNameSchema,
  toolSourceSchema,
} from "./objects";

const runId = idSchema("run");
const messageId = idSchema("message");

/** Daten je Ereignis-Typ. */
export const EVENT_DATA = {
  "message.created": z.strictObject({ messageId, role: messageRoleSchema, text: z.string() }),
  "run.queued": z.strictObject({ runId }),
  "run.started": z.strictObject({ runId }),
  "text.delta": z.strictObject({ runId, messageId, text: z.string().min(1) }),
  "message.completed": z.strictObject({
    messageId,
    route: routeSchema,
    modelLabel: z.string().min(1).max(200),
    tokens: tokenUsageSchema,
    /** Wer laut Antwort der Schnittstelle geantwortet hat; fehlt, wenn sie es nicht meldet. */
    servedBy: servedBySchema.optional(),
  }),
  /** Der Lauf hält vor einer Aktion der Stufe „fragen“ an und wartet auf eine Freigabe. */
  "run.waiting": z.strictObject({
    runId,
    actionId: idSchema("action"),
    action: actionTypeSchema,
    text: z.string().min(1),
  }),
  /** Ein neuer Lauf setzt einen wartenden Lauf nach der Antwort des Besitzers fort. */
  "run.resumed": z.strictObject({ runId, resumedFromRunId: runId }),
  "run.cancelled": z.strictObject({ runId, code: errorCodeSchema, text: z.string().min(1) }),
  "run.failed": z.strictObject({ runId, code: errorCodeSchema, text: z.string().min(1) }),
  "run.denied": z.strictObject({ runId, code: errorCodeSchema, text: z.string().min(1) }),
  /** Das Modell wünscht einen Werkzeug-Aufruf; die Argumente stehen nur im Verlauf, nicht hier. */
  "tool.requested": z.strictObject({
    runId,
    actionId: idSchema("action"),
    messageId,
    name: toolNameSchema,
    source: toolSourceSchema,
    kind: toolKindSchema,
  }),
  /** Ein Werkzeug-Aufruf ist erledigt (ausgeführt, abgelehnt, gescheitert oder abgebrochen). */
  "tool.finished": z.strictObject({
    runId,
    actionId: idSchema("action"),
    status: toolCallStatusSchema.extract(["succeeded", "failed", "denied", "cancelled"]),
    code: errorCodeSchema.optional(),
  }),
  /** `reason` ist ein neutraler Satz ohne Inhalte der Nachricht. */
  "schleuse.blockiert": z.strictObject({ runId, reason: z.string().min(1).max(500) }),
  "beleg.created": z.strictObject({
    belegId: idSchema("receipt"),
    action: actionTypeSchema,
    messageId: messageId.optional(),
  }),
} as const;

type EventData = typeof EVENT_DATA;
export type ConversationEventType = keyof EventData;
export const CONVERSATION_EVENT_TYPES = Object.keys(EVENT_DATA) as [
  ConversationEventType,
  ...ConversationEventType[],
];
export const conversationEventTypeSchema = z.enum(CONVERSATION_EVENT_TYPES);

const envelope = {
  conversationId: idSchema("conversation"),
  /** Laufende Nummer pro Unterhaltung, ab 1, ohne Lücken beim Schreiben. */
  seq: positiveIntSchema,
  time: isoTimeSchema,
  /** Lauf, zu dem das Ereignis gehört; fehlt bei Ereignissen ohne Lauf. */
  runId: runId.optional(),
};

const eventVariants = CONVERSATION_EVENT_TYPES.map((type) =>
  z.strictObject({ ...envelope, type: z.literal(type), data: EVENT_DATA[type] }),
);
type EventVariant = (typeof eventVariants)[number];

/** Ein Ereignis einer Unterhaltung, z. B. `{ seq: 7, type: "text.delta", data: { … } }`. */
export type ConversationEvent<T extends ConversationEventType = ConversationEventType> =
  T extends ConversationEventType
    ? {
        conversationId: z.infer<typeof envelope.conversationId>;
        seq: number;
        time: string;
        runId?: z.infer<typeof runId>;
        type: T;
        data: z.infer<EventData[T]>;
      }
    : never;

/** Schema für jedes Ereignis; die Daten passen zum Typ. */
export const conversationEventSchema = z.discriminatedUnion(
  "type",
  eventVariants as [EventVariant, ...EventVariant[]],
) as unknown as z.ZodType<ConversationEvent>;

/** Wartezeit in Millisekunden, die der Browser nach einem Abbruch vor dem Neuverbinden einhält. */
export const SSE_RETRY_MS = 2750;
/** Abstand des Herzschlags in Millisekunden. */
export const SSE_HEARTBEAT_MS = 15000;
/** Herzschlag als Kommentarzeile mit folgender Leerzeile. */
export const SSE_HEARTBEAT = ": puls\n\n";
/** Erste Zeile jeder Verbindung. */
export const SSE_PREAMBLE = `retry: ${SSE_RETRY_MS}\n\n`;

/** Kodiert ein Ereignis als JSON für das `data:`-Feld. */
export function encodeEvent(event: ConversationEvent): string {
  return JSON.stringify(event);
}

/** Liest und prüft ein Ereignis aus JSON; wirft bei ungültigen Daten. */
export function decodeEvent(json: string): ConversationEvent {
  return conversationEventSchema.parse(JSON.parse(json));
}

/** Liest ein Ereignis aus JSON; liefert `undefined` statt eines Fehlers. */
export function safeDecodeEvent(json: string): ConversationEvent | undefined {
  try {
    const parsed = conversationEventSchema.safeParse(JSON.parse(json));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/** Ein Ereignis als SSE-Block: `id`, `event`, `data` und eine Leerzeile. */
export function toSseFrame(event: ConversationEvent): string {
  return `id: ${event.seq}\nevent: ${event.type}\ndata: ${encodeEvent(event)}\n\n`;
}
