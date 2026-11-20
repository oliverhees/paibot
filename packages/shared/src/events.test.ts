/**
 * PaiBot – Tests für den Ereignis-Strom: Schema, Kodieren, Dekodieren und SSE-Blöcke.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { describe, expect, it } from "vitest";
import {
  CONVERSATION_EVENT_TYPES,
  type ConversationEvent,
  conversationEventSchema,
  decodeEvent,
  encodeEvent,
  SSE_HEARTBEAT,
  SSE_PREAMBLE,
  safeDecodeEvent,
  toSseFrame,
} from "./events";
import { idSchema } from "./id";

const conversationId = idSchema("conversation").parse("unt_06f8k2m9qz3w7x1c4b5n8p0r2t");
const runId = idSchema("run").parse("lau_06f8k2m9qz3w7x1c4b5n8p0r2v");
const messageId = idSchema("message").parse("nac_06f8k2m9qz3w7x1c4b5n8p0r2w");
const belegId = idSchema("receipt").parse("blg_06f8k2m9qz3w7x1c4b5n8p0r2x");
const actionId = idSchema("action").parse("akt_06f8k2m9qz3w7x1c4b5n8p0r2t");
const earlierRunId = idSchema("run").parse("lau_06f8k2m9qz3w7x1c4b5n8p0r2t");
const time = "2026-11-20T10:00:00.000Z";

const EXAMPLES: ConversationEvent[] = [
  {
    conversationId,
    seq: 1,
    time,
    type: "message.created",
    data: { messageId, role: "user", text: "Hallo\nWelt" },
  },
  { conversationId, seq: 2, time, runId, type: "run.queued", data: { runId } },
  { conversationId, seq: 3, time, runId, type: "run.started", data: { runId } },
  {
    conversationId,
    seq: 4,
    time,
    runId,
    type: "text.delta",
    data: { runId, messageId, text: "Hal" },
  },
  {
    conversationId,
    seq: 5,
    time,
    runId,
    type: "message.completed",
    data: {
      messageId,
      route: "schleuse",
      modelLabel: "Mistral Small",
      tokens: { input: 12, output: 34 },
    },
  },
  {
    conversationId,
    seq: 6,
    time,
    runId,
    type: "run.cancelled",
    data: { runId, code: "unterbrochen", text: "Abgebrochen" },
  },
  {
    conversationId,
    seq: 7,
    time,
    runId,
    type: "run.failed",
    data: { runId, code: "schluessel_ungueltig", text: "Schlüssel" },
  },
  {
    conversationId,
    seq: 8,
    time,
    runId,
    type: "run.denied",
    data: { runId, code: "abgelehnt", text: "Regel G-01" },
  },
  {
    conversationId,
    seq: 9,
    time,
    runId,
    type: "schleuse.blockiert",
    data: { runId, reason: "Datenschleuse nicht erreichbar" },
  },
  {
    conversationId,
    seq: 10,
    time,
    type: "beleg.created",
    data: { belegId, action: "nachricht.senden", messageId },
  },
  {
    conversationId,
    seq: 11,
    time,
    type: "beleg.created",
    data: { belegId, action: "unterhaltung.anlegen" },
  },
  {
    conversationId,
    seq: 12,
    time,
    runId,
    type: "run.waiting",
    data: { runId, actionId, action: "modell.anfragen", text: "Wartet auf Freigabe" },
  },
  {
    conversationId,
    seq: 13,
    time,
    runId,
    type: "run.resumed",
    data: { runId, resumedFromRunId: earlierRunId },
  },
];

describe("Ereignisse", () => {
  it("decken jeden Typ ab", () => {
    expect(new Set(EXAMPLES.map((event) => event.type))).toEqual(new Set(CONVERSATION_EVENT_TYPES));
    expect(CONVERSATION_EVENT_TYPES).toEqual([
      "message.created",
      "run.queued",
      "run.started",
      "text.delta",
      "message.completed",
      "run.waiting",
      "run.resumed",
      "run.cancelled",
      "run.failed",
      "run.denied",
      "schleuse.blockiert",
      "beleg.created",
    ]);
  });

  it("überstehen die Rundreise kodieren und dekodieren", () => {
    for (const event of EXAMPLES) {
      expect(conversationEventSchema.parse(event)).toEqual(event);
      expect(decodeEvent(encodeEvent(event))).toEqual(event);
    }
  });

  it("lehnen ungültige Ereignisse ab", () => {
    const base = EXAMPLES[3] as ConversationEvent<"text.delta">;
    const bad: unknown[] = [
      { ...base, seq: 0 },
      { ...base, seq: 1.5 },
      { ...base, time: "2026-11-20T10:00:00Z" },
      { ...base, type: "text.unbekannt" },
      { ...base, data: { runId, text: "x" } },
      { ...base, data: { ...base.data, text: "" } },
      { ...base, data: { ...base.data, extra: 1 } },
      { ...base, runId: null },
      { ...base, conversationId: runId },
      {
        ...EXAMPLES[4],
        data: { messageId, route: "direkt", modelLabel: "x", tokens: { input: 1, output: 1 } },
      },
      { ...EXAMPLES[7], data: { runId, code: "kaputt", text: "x" } },
    ];
    for (const value of bad) expect(conversationEventSchema.safeParse(value).success).toBe(false);
    expect(safeDecodeEvent("{kein json")).toBeUndefined();
    expect(safeDecodeEvent(JSON.stringify(bad[0]))).toBeUndefined();
    expect(() => decodeEvent(JSON.stringify(bad[0]))).toThrow();
  });
});

describe("SSE", () => {
  it("baut Blöcke mit id, event und einzeiligem data", () => {
    const event = EXAMPLES[0] as ConversationEvent;
    const frame = toSseFrame(event);
    expect(frame).toBe(`id: 1\nevent: message.created\ndata: ${JSON.stringify(event)}\n\n`);
    expect(frame.split("\n")).toHaveLength(5);
    const data = frame.split("\n")[2]?.slice("data: ".length) ?? "";
    expect(decodeEvent(data)).toEqual(event);
  });

  it("hat die festen Zeilen für Start und Herzschlag", () => {
    expect(SSE_PREAMBLE).toBe("retry: 2750\n\n");
    expect(SSE_HEARTBEAT).toBe(": puls\n\n");
  });
});
