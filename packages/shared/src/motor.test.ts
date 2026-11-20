/**
 * PaiBot – Tests für den Motor-Vertrag: ein Schritt pro Runde, Werkzeug-Wünsche als Ereignis.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { describe, expect, it } from "vitest";
import { ERROR_STATUS } from "./errors";
import { newId } from "./id";
import type { Motor, MotorEvent, ResolvedModel, TurnInput } from "./motor";
import { MOTOR_ERROR_CODES } from "./motor";
import { RUN_STATUSES, runSchema } from "./objects";

/** Kleiner Motor nur für diesen Test: wünscht ein Werkzeug, wenn noch kein Ergebnis da ist. */
const testMotor: Motor = {
  id: "test",
  capabilities: () => ({
    streaming: true,
    tools: true,
    reasoning: false,
    abort: true,
    toolsExecutedInternally: false,
  }),
  async *runTurn(input: TurnInput, signal: AbortSignal): AsyncIterable<MotorEvent> {
    const last = input.history.at(-1);
    if (last?.role === "tool") {
      yield { type: "text-delta", text: `Ergebnis: ${JSON.stringify(last.results[0]?.output)}` };
      yield { type: "finish", finishReason: "stop", usage: { input: 3, output: 2 } };
      return;
    }
    if (signal.aborted) return;
    yield { type: "tool-call", callId: "c1", name: "uhrzeit", input: { zone: "Europe/Berlin" } };
    yield { type: "finish", finishReason: "tool-calls", usage: { input: 3, output: 1 } };
  },
};

const model = {} as ResolvedModel;

async function collect(input: TurnInput): Promise<MotorEvent[]> {
  const events: MotorEvent[] = [];
  for await (const event of testMotor.runTurn(input, new AbortController().signal))
    events.push(event);
  return events;
}

describe("Motor-Vertrag", () => {
  it("gibt Werkzeug-Wünsche heraus und bekommt Ergebnisse in der nächsten Runde", async () => {
    const base: TurnInput = {
      system: "Du bist Pai.",
      history: [{ role: "user", text: "Wie spät ist es?" }],
      model,
      limits: { maxOutputTokens: 100, timeoutMs: 1000 },
      tools: [
        { name: "uhrzeit", description: "Liefert die Uhrzeit", inputSchema: { type: "object" } },
      ],
    };
    const first = await collect(base);
    expect(first[0]).toEqual({
      type: "tool-call",
      callId: "c1",
      name: "uhrzeit",
      input: { zone: "Europe/Berlin" },
    });
    const second = await collect({
      ...base,
      history: [
        ...base.history,
        {
          role: "assistant",
          text: "",
          toolCalls: [{ callId: "c1", name: "uhrzeit", input: { zone: "Europe/Berlin" } }],
        },
        {
          role: "tool",
          results: [{ callId: "c1", name: "uhrzeit", status: "ok", output: "10:00" }],
        },
      ],
    });
    expect(second.map((event) => event.type)).toEqual(["text-delta", "finish"]);
    expect(testMotor.capabilities().toolsExecutedInternally).toBe(false);
  });

  it("meldet nur bekannte Fehlercodes", () => {
    for (const code of MOTOR_ERROR_CODES) expect(ERROR_STATUS[code]).toBeGreaterThan(0);
  });
});

describe("Lauf-Zustände", () => {
  it("kennen Warten auf Freigabe und Fortsetzen", () => {
    expect(RUN_STATUSES).toContain("waiting_approval");
    const time = "2026-11-20T10:00:00.000Z";
    const run = {
      id: newId("run"),
      conversationId: newId("conversation"),
      triggerMessageId: newId("message"),
      botId: newId("bot"),
      status: "queued",
      resumesRunId: newId("run"),
      createdAt: time,
    };
    expect(runSchema.parse(run)).toEqual(run);
    expect(runSchema.safeParse({ ...run, status: "paused" }).success).toBe(false);
    expect(runSchema.safeParse({ ...run, resumesRunId: newId("message") }).success).toBe(false);
  });
});
