/**
 * PaiBot – Tests der Schritt-Schleife mit einer Motor-Attrappe statt des echten Motors: Die
 * Steuerung ist die Schutzlinie, nicht die Bibliothek. Die Attrappe reicht Wünsche durch, die das
 * SDK selbst schon abweist oder ersetzt (leerer Name, leere oder doppelte Kennung), und liefert
 * Denk-Text als eigenes Ereignis. Dazu: Ein riesiges Ergebnis wird vor dem Schreiben gekürzt, die
 * Obergrenze der Datenbank löst im Betrieb nie aus.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { repo } from "@paibot/db";
import { createTestDb } from "@paibot/db/testing";
import { createReceiptWriter, verifyChain } from "@paibot/receipts";
import type { MotorEvent } from "@paibot/shared/motor";
import { describe, expect, it } from "vitest";
import { createFakeMotor, type FakeMotorStep } from "../testing/fake-motor";
import { setupRun } from "../testing/lauf-umgebung";
import { createTestTools } from "../testing/werkzeuge";
import { createToolRegistry } from "../werkzeuge/register";
import { executeRun } from "./ausfuehren";

const RECEIPT_TOOLS = {
  createWriter: createReceiptWriter,
  verify: (entries: Parameters<typeof verifyChain>[0], options: object) =>
    verifyChain(entries, options as Parameters<typeof verifyChain>[1]),
};
const MARKER = "Denkmerkmal-5521";

const finish = (finishReason = "stop"): MotorEvent => ({
  type: "finish",
  finishReason,
  usage: { input: 10, output: 5 },
});

/** Lauf mit Motor-Attrappe: Schritt `n` liefert `schritte[n]`, danach eine kurze Antwort. */
async function lauf(schritte: FakeMotorStep[][]) {
  const { db } = await createTestDb();
  const motor = createFakeMotor((_input, turn) =>
    turn < schritte.length
      ? (schritte[turn] ?? [])
      : [{ type: "text-delta", text: "Fertig." }, finish()],
  );
  const env = await setupRun(db, RECEIPT_TOOLS, {
    providerBaseUrl: "http://127.0.0.1:9/v1",
    providerKey: `sk-test-${"p".repeat(24)}`,
    motor,
  });
  const tools = createTestTools({ allowedByR010: "test_riesig" });
  env.deps.tools = await createToolRegistry(tools.tools);
  const { runId } = await env.queueMessage("Frage");
  const outcome = await executeRun(runId, env.deps, new AbortController().signal);
  return { env, runId, outcome, motor, tools };
}

const wunsch = (callId: string, name: string, input: unknown = {}): FakeMotorStep =>
  ({ type: "tool-call", callId, name, input }) as FakeMotorStep;

describe("Wünsche, die das SDK selbst abweist, prüft die Steuerung selbst", () => {
  // Gegenprobe: callId ungeprüft in die Tabelle bzw. ohne Endung → Datenbankfehler, rot.
  it("leerer Name, leere Kennung, doppelte Kennung: Platzhalter, Ersatz-Kennungen, V-12/V-13 mit Beleg-Paar, kein Datenbankfehler", async () => {
    const { env, runId, outcome, tools } = await lauf([
      [
        wunsch("c1", "", { q: "x" }),
        wunsch("", "test_lesen", { q: "x" }),
        wunsch("gleich", "test_lesen", { q: "y" }),
        wunsch("gleich", "test_lesen", { q: "z" }),
        finish("tool-calls"),
      ],
    ]);
    expect(outcome).toMatchObject({ status: "succeeded" });
    const rows = await repo.toolCalls.listForRun(env.db, runId);
    expect(rows.map((r) => [r.name, r.callId, r.status])).toEqual([
      ["unbekannt", "c1", "denied"],
      ["test_lesen", "pb-1", "denied"],
      ["test_lesen", "gleich", "denied"],
      ["test_lesen", "gleich-3", "denied"],
    ]);
    expect(rows[0]?.rawName).toBeUndefined();
    const fakten = (await env.receipts())
      .flatMap((e) =>
        e.body.type === "decision" && e.body.action.type === "werkzeug.aufrufen"
          ? [e.body.facts]
          : [],
      )
      .map((f) => [
        (f as { toolName: string }).toolName,
        (f as { inputValid: boolean }).inputValid,
      ]);
    expect(fakten).toEqual([
      ["unbekannt", true],
      ["test_lesen", false],
      ["test_lesen", true],
      ["test_lesen", true],
    ]);
    expect(tools.protocol.count()).toBe(0);
    expect((await env.verify()).ok).toBe(true);
  });
});

describe("Denk-Text", () => {
  // Die Steuerung kennt nur Text, Wünsche, Ende und Fehler. Gegenprobe: ein Ereignis mit
  // Denk-Text wie Text behandeln → Merkmal in Nachricht und Entwurf, rot.
  it("eine Attrappe, die Denk-Text als eigenes Ereignis liefert: er kommt weder in Nachricht, Entwurf noch in die nächste Anfrage", async () => {
    const denken = { type: "reasoning-delta", text: MARKER } as unknown as FakeMotorStep;
    const { env, runId, outcome, motor } = await lauf([
      [
        denken,
        { type: "text-delta", text: "Ich sehe nach." },
        wunsch("c1", "test_riesig", { zeichen: 5 }),
        finish("tool-calls"),
      ],
      [denken, { type: "text-delta", text: "Antwort." }, finish()],
    ]);
    expect(outcome).toMatchObject({ status: "succeeded" });
    const messages = (
      await repo.messages.listForConversation(env.db, env.conversationId, { limit: 50 })
    ).filter((m) => m.runId === runId);
    expect(messages.map((m) => m.content)).toEqual(["Ich sehe nach.", "Antwort."]);
    expect(JSON.stringify(await env.events())).not.toContain(MARKER);
    expect(JSON.stringify(motor.calls[1]?.history)).not.toContain(MARKER);
  });
});

describe("Obergrenze der Datenbank löst im Betrieb nie aus", () => {
  // Gegenprobe: Kürzen und Prüfen der Hülle abgeschaltet → Ergebnis über 256 KiB, Trigger weist ab
  // (Datenbankfehler), rot.
  it("ein Ergebnis von 300 000 Zeichen wird vor dem Schreiben gekürzt; der Aufruf endet succeeded, kein Datenbankfehler", async () => {
    const { env, runId, outcome } = await lauf([
      [wunsch("c1", "test_riesig", { zeichen: 300_000 }), finish("tool-calls")],
    ]);
    expect(outcome).toMatchObject({ status: "succeeded" });
    const [row] = await repo.toolCalls.listForRun(env.db, runId);
    expect(row).toMatchObject({ status: "succeeded", outputTruncated: true });
    expect(JSON.stringify(row?.output).length).toBeLessThan(65_536);
  });
});
