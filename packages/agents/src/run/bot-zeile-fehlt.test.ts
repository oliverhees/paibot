/**
 * PaiBot – Test: Fehlt die Zeile des Bots, wenn der Lauf `botPaused` frisch liest, gilt der Bot als
 * pausiert: Das Tor lehnt ab (G-15 `bot_bereit`), nie „nicht pausiert“ aus Mangel an Daten. Im echten
 * Betrieb ist das nicht erreichbar (ein Bot mit Läufen lässt sich nicht löschen); der Test stellt den
 * Fall über die Leseschicht nach, um den Rückfall `?? true` an beiden Stellen festzuhalten.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-23
 */

import { createTestDb } from "@paibot/db/testing";
import { createReceiptWriter, verifyChain } from "@paibot/receipts";
import type { MotorEvent } from "@paibot/shared/motor";
import { describe, expect, it, vi } from "vitest";
import { createFakeMotor, type FakeMotorStep } from "../testing/fake-motor";
import { setupRun } from "../testing/lauf-umgebung";
import { createTestTools } from "../testing/werkzeuge";
import { createToolRegistry } from "../werkzeuge/register";
import { executeRun } from "./ausfuehren";

/** Die Leseschicht meldet bei diesen Aufrufen (Zählung ab 1) „Zeile fehlt“. */
const stand = vi.hoisted(() => ({ aufrufe: 0, fehltBei: new Set<number>() }));

vi.mock("./bot-stand", async (importOriginal) => {
  const original = await importOriginal<typeof import("./bot-stand")>();
  return {
    ...original,
    readBotPaused: async (...args: Parameters<typeof original.readBotPaused>) => {
      stand.aufrufe += 1;
      if (stand.fehltBei.has(stand.aufrufe)) return undefined;
      return original.readBotPaused(...args);
    },
  };
});

const RECEIPT_TOOLS = {
  createWriter: createReceiptWriter,
  verify: (entries: Parameters<typeof verifyChain>[0], options: object) =>
    verifyChain(entries, options as Parameters<typeof verifyChain>[1]),
};

const finish = (finishReason = "stop"): MotorEvent => ({
  type: "finish",
  finishReason,
  usage: { input: 10, output: 5 },
});

async function lauf(schritte: FakeMotorStep[][], fehltBei: number[]) {
  stand.aufrufe = 0;
  stand.fehltBei = new Set(fehltBei);
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
  const tools = createTestTools({ allowedByR010: "test_lesen" });
  env.deps.tools = await createToolRegistry(tools.tools);
  const { runId } = await env.queueMessage("Frage");
  await executeRun(runId, env.deps, new AbortController().signal);
  const entscheidungen = (await env.receipts()).flatMap((e) =>
    e.body.type === "decision"
      ? [
          {
            aktion: e.body.action.type,
            ergebnis: e.body.decision.outcome,
            botPaused: (e.body.facts as { botPaused?: boolean }).botPaused,
            grenzen: e.body.decision.limits
              .filter((l) => l.result === "verletzt")
              .map((l) => l.name),
          },
        ]
      : [],
  );
  return { env, motor, tools, entscheidungen };
}

describe("Bot-Zeile fehlt: abgelehnt (G-15), nie „nicht pausiert“", () => {
  // Gegenprobe: `?? true` in `schleife.ts` durch `?? false` ersetzen → das Modell wird gefragt (rot).
  it("Schleife: das Modell wird nicht gefragt, Beleg mit abgelehnt und botPaused = true", async () => {
    const { motor, entscheidungen } = await lauf(
      [[{ type: "text-delta", text: "Hi." }, finish()]],
      [1],
    );
    expect(motor.calls).toHaveLength(0);
    expect(entscheidungen).toEqual([
      { aktion: "modell.anfragen", ergebnis: "deny", botPaused: true, grenzen: ["bot_bereit"] },
    ]);
  });

  // Gegenprobe: `?? true` in `aufruf.ts` durch `?? false` ersetzen → das Werkzeug läuft (rot).
  it("Werkzeug-Aufruf: das Werkzeug läuft nicht, Beleg mit abgelehnt und botPaused = true", async () => {
    const wunsch = {
      type: "tool-call",
      callId: "c1",
      name: "test_lesen",
      input: {},
    } as FakeMotorStep;
    // Lesung 1: Schritt 0 (Bot da). Lesung 2: der Werkzeug-Aufruf (Zeile fehlt).
    const { tools, entscheidungen } = await lauf([[wunsch, finish("tool-calls")]], [2]);
    expect(tools.protocol.count("test_lesen")).toBe(0);
    expect(entscheidungen.filter((e) => e.aktion === "werkzeug.aufrufen")).toEqual([
      { aktion: "werkzeug.aufrufen", ergebnis: "deny", botPaused: true, grenzen: ["bot_bereit"] },
    ]);
  });
});
