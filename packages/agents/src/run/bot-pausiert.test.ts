/**
 * PaiBot – Tests: Die Pause eines Bots gilt im Lauf. Im Direkt-Chat trägt jede Anfrage ans Tor den
 * Fakt `botPaused` mit dem Füllwert `false`; ein pausierter Bot bekommt keine Antwort vom Modell
 * (G-15); wird der Bot mitten im Lauf pausiert, lehnt das Tor schon den nächsten Werkzeug-Aufruf ab
 * und der nächste Schritt fragt das Modell nicht mehr.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { type Database, repo } from "@paibot/db";
import { createTestDb } from "@paibot/db/testing";
import { createReceiptWriter, verifyChain } from "@paibot/receipts";
import type { BotId } from "@paibot/shared/ids";
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

const finish = (finishReason = "stop"): MotorEvent => ({
  type: "finish",
  finishReason,
  usage: { input: 10, output: 5 },
});

const wunsch = (callId: string, name: string, input: unknown = {}): FakeMotorStep =>
  ({ type: "tool-call", callId, name, input }) as FakeMotorStep;

/**
 * Lauf mit Motor-Attrappe. `vorher` läuft vor dem Start; `pausiereBeiSchritt` pausiert den Bot,
 * wenn der Motor den Schritt mit dieser Nummer bekommt (nach der Entscheidung für die Anfrage dieses
 * Schritts und vor seinen Werkzeug-Aufrufen; die Datenbank im Test arbeitet Abfragen der Reihe nach ab).
 */
async function lauf(
  schritte: FakeMotorStep[][],
  optionen: {
    vorher?: (botId: BotId, db: Database) => Promise<void>;
    pausiereBeiSchritt?: number;
  } = {},
) {
  const { db } = await createTestDb();
  let botId: BotId | undefined;
  const motor = createFakeMotor((_input, turn) => {
    if (turn === optionen.pausiereBeiSchritt && botId !== undefined) {
      void repo.bots.setPaused(db, botId, true);
    }
    return turn < schritte.length
      ? (schritte[turn] ?? [])
      : [{ type: "text-delta", text: "Fertig." }, finish()];
  });
  const env = await setupRun(db, RECEIPT_TOOLS, {
    providerBaseUrl: "http://127.0.0.1:9/v1",
    providerKey: `sk-test-${"p".repeat(24)}`,
    motor,
  });
  botId = env.botId;
  const tools = createTestTools({ allowedByR010: "test_lesen" });
  env.deps.tools = await createToolRegistry(tools.tools);
  if (optionen.vorher) await optionen.vorher(env.botId, db);
  const { runId } = await env.queueMessage("Frage");
  const outcome = await executeRun(runId, env.deps, new AbortController().signal);
  return { env, runId, outcome, motor, tools };
}

/** Entscheidungen des Tors mit Aktion, Ergebnis und Fakt `botPaused`, in Reihenfolge. */
async function entscheidungen(env: Awaited<ReturnType<typeof lauf>>["env"]) {
  return (await env.receipts()).flatMap((e) =>
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
}

describe("Pause im Direkt-Chat", () => {
  // Gegenprobe: `botPaused` nicht ins Tor geben (Fakt weglassen) → die Anfrage ist ungültig, rot.
  it("ein Bot ohne Pause: jede Anfrage trägt botPaused = false, der Lauf gelingt", async () => {
    const { env, outcome } = await lauf([[{ type: "text-delta", text: "Hallo." }, finish()]]);
    expect(outcome).toMatchObject({ status: "succeeded" });
    const d = await entscheidungen(env);
    expect(d.length).toBeGreaterThan(0);
    for (const e of d) {
      expect(e.ergebnis).toBe("allow");
      expect(e.botPaused, e.aktion).toBe(false);
    }
    expect((await env.verify()).ok).toBe(true);
  });

  // Gegenprobe: `?? true` in `schleife.ts` durch `?? false` ersetzen ändert hier nichts (die Zeile
  // gibt es); entscheidend ist `readBotPaused` (siehe `bot-stand.test.ts`). Hier: die Pause wirkt.
  it("ein pausierter Bot: das Modell wird nicht gefragt, Beleg mit abgelehnt (G-15)", async () => {
    const { env, outcome, motor } = await lauf(
      [[{ type: "text-delta", text: "Hallo." }, finish()]],
      {
        vorher: async (botId, db) => {
          await repo.bots.setPaused(db, botId, true);
        },
      },
    );
    expect(motor.calls).toHaveLength(0);
    expect(outcome.status).not.toBe("succeeded");
    const d = await entscheidungen(env);
    expect(d).toEqual([
      { aktion: "modell.anfragen", ergebnis: "deny", botPaused: true, grenzen: ["bot_bereit"] },
    ]);
  });
});

describe("Pause mitten im Lauf", () => {
  // Gegenprobe: `botPaused` in `runToolCall` aus dem Lauf-Start statt frisch lesen (z. B. `false`) →
  // der zweite Aufruf läuft trotz Pause (rot).
  it("der nächste Werkzeug-Aufruf wird abgelehnt, das Werkzeug läuft nicht", async () => {
    const { env, tools, motor } = await lauf(
      [
        [wunsch("c1", "test_lesen"), finish("tool-calls")],
        [wunsch("c2", "test_lesen"), finish("tool-calls")],
      ],
      { pausiereBeiSchritt: 1 },
    );
    const aufrufe = (await entscheidungen(env)).filter((e) => e.aktion === "werkzeug.aufrufen");
    expect(aufrufe).toEqual([
      { aktion: "werkzeug.aufrufen", ergebnis: "allow", botPaused: false, grenzen: [] },
      { aktion: "werkzeug.aufrufen", ergebnis: "deny", botPaused: true, grenzen: ["bot_bereit"] },
    ]);
    // Der erste Aufruf lief, der zweite nicht.
    expect(tools.protocol.count("test_lesen")).toBe(1);
    expect(motor.calls).toHaveLength(2);
    expect((await env.verify()).ok).toBe(true);
  });

  // Gegenprobe: `botPaused` in `schleife.ts` nur im ersten Schritt lesen → der dritte Schritt fragt
  // das Modell trotz Pause (rot).
  it("der nächste Schritt fragt das Modell nicht mehr", async () => {
    const { env, motor } = await lauf(
      [
        [wunsch("c1", "test_lesen"), finish("tool-calls")],
        [wunsch("c2", "test_lesen"), finish("tool-calls")],
      ],
      { pausiereBeiSchritt: 1 },
    );
    // Der Motor bekam Schritt 0 und Schritt 1; für Schritt 2 kam er nicht mehr an die Reihe.
    expect(motor.calls).toHaveLength(2);
    const modell = (await entscheidungen(env)).filter((e) => e.aktion === "modell.anfragen");
    expect(modell.map((e) => [e.ergebnis, e.botPaused])).toEqual([
      ["allow", false],
      ["allow", false],
      ["deny", true],
    ]);
  });
});
