/**
 * PaiBot – Tests des Test-Motors: Ablauf, Pausen, Abbruch, Runden und Fähigkeiten.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { MotorEvent, TurnInput } from "@paibot/shared/motor";
import { describe, expect, it } from "vitest";
import { createFakeMotor } from "./fake-motor";

const input = (text: string): TurnInput => ({
  system: "Test",
  history: [{ role: "user", text }],
  model: {} as TurnInput["model"],
  limits: { maxOutputTokens: 10, timeoutMs: 1000 },
});

async function collect(
  iterable: AsyncIterable<MotorEvent>,
  onEvent?: (event: MotorEvent) => void,
): Promise<MotorEvent[]> {
  const events: MotorEvent[] = [];
  for await (const event of iterable) {
    events.push(event);
    onEvent?.(event);
  }
  return events;
}

describe("Test-Motor", () => {
  it("liefert die Ereignisse in Reihenfolge, Pausen erscheinen nicht", async () => {
    const motor = createFakeMotor([
      { type: "text-delta", text: "a" },
      { type: "pause", ms: 30 },
      { type: "tool-call", callId: "c1", name: "suche", input: { q: 1 } },
      { type: "finish", finishReason: "tool-calls", usage: { input: 1, output: 2 } },
    ]);
    const started = Date.now();
    const events = await collect(motor.runTurn(input("x"), new AbortController().signal));
    expect(Date.now() - started).toBeGreaterThanOrEqual(25);
    expect(events.map((e) => e.type)).toEqual(["text-delta", "tool-call", "finish"]);
    expect(motor.id).toBe("fake");
  });

  it("zählt Runden und merkt sich die Eingaben", async () => {
    const motor = createFakeMotor((turnInput, turn) => [
      { type: "text-delta", text: `${turn}:${turnInput.history.length}` },
    ]);
    const signal = new AbortController().signal;
    const first = await collect(motor.runTurn(input("eins"), signal));
    const second = await collect(motor.runTurn(input("zwei"), signal));
    expect(first).toEqual([{ type: "text-delta", text: "0:1" }]);
    expect(second).toEqual([{ type: "text-delta", text: "1:1" }]);
    expect(motor.calls.map((c) => c.history[0])).toEqual([
      { role: "user", text: "eins" },
      { role: "user", text: "zwei" },
    ]);
  });

  it("Abbruch während einer Pause beendet die Runde sofort und ohne weiteres Ereignis", async () => {
    const motor = createFakeMotor([
      { type: "text-delta", text: "a" },
      { type: "pause", ms: 10_000 },
      { type: "text-delta", text: "b" },
    ]);
    const controller = new AbortController();
    const started = Date.now();
    const events = await collect(motor.runTurn(input("x"), controller.signal), () =>
      setTimeout(() => controller.abort(), 20),
    );
    expect(events).toEqual([{ type: "text-delta", text: "a" }]);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("gibt Kopien heraus: Änderungen am Ereignis ändern den Ablauf nicht", async () => {
    const script = [{ type: "text-delta", text: "a" } as const];
    const motor = createFakeMotor(script);
    const [event] = await collect(motor.runTurn(input("x"), new AbortController().signal));
    (event as { text: string }).text = "verändert";
    expect(script[0]?.text).toBe("a");
  });

  it("Fähigkeiten: Standard und überschrieben", () => {
    expect(createFakeMotor([]).capabilities()).toEqual({
      streaming: true,
      tools: false,
      reasoning: false,
      abort: true,
      toolsExecutedInternally: false,
    });
    expect(createFakeMotor([], { tools: true }).capabilities().tools).toBe(true);
  });
});
