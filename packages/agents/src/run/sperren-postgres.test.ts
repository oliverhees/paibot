/**
 * PaiBot – Sperr-Reihenfolge der Lauf-Steuerung gegen echtes Postgres mit mehreren Verbindungen:
 * zwei Läufe in zwei Unterhaltungen gleichzeitig, dazu gleichzeitiges Anhängen von Ereignissen und
 * Aktionen des Besitzers. Nichts verklemmt, Nummern und Beleg-Kette bleiben lückenlos.
 * Läuft nur mit `PAIBOT_TEST_DATABASE_URL`.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { createDb, repo } from "@paibot/db";
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
  TEST_DATABASE_URL_ENV,
} from "@paibot/db/testing";
import { createReceiptWriter, verifyChain } from "@paibot/receipts";
import { newId } from "@paibot/shared/ids";
import type { MotorEvent } from "@paibot/shared/motor";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFakeMotor, type FakeMotorStep } from "../testing/fake-motor";
import { setupRun } from "../testing/lauf-umgebung";
import { executeRun } from "./ausfuehren";

const baseUrl = process.env[TEST_DATABASE_URL_ENV];

const RECEIPT_TOOLS = {
  createWriter: createReceiptWriter,
  verify: (entries: Parameters<typeof verifyChain>[0], options: object) =>
    verifyChain(entries, options as Parameters<typeof verifyChain>[1]),
};

function script(prefix: string): FakeMotorStep[] {
  const steps: FakeMotorStep[] = [];
  for (let i = 0; i < 40; i++) {
    steps.push({ type: "text-delta", text: `${prefix}${i} ` });
    if (i % 5 === 0) steps.push({ type: "pause", ms: 3 });
  }
  steps.push({
    type: "finish",
    finishReason: "stop",
    usage: { input: 5, output: 40 },
  } as MotorEvent);
  return steps;
}

describe.skipIf(baseUrl === undefined)("Sperr-Reihenfolge gegen Postgres", () => {
  let database: PostgresTestDatabase;
  const pools: ReturnType<typeof createDb>[] = [];

  beforeAll(async () => {
    database = await createPostgresTestDatabase(baseUrl as string);
  });
  afterAll(async () => {
    for (const pool of pools) await pool.sql.end({ timeout: 2 });
    await database?.drop();
  });

  it("zwei Läufe, paralleles Anhängen und Aktionen des Besitzers: nichts verklemmt, alles lückenlos", async () => {
    const open = () => {
      const pool = createDb(database.url);
      pools.push(pool);
      return pool.db;
    };
    const main = open();
    const env = await setupRun(main, RECEIPT_TOOLS, {
      providerBaseUrl: "http://127.0.0.1:9/v1",
      providerKey: "sk-test-unbenutzt-000000000000",
      motor: createFakeMotor([]),
      tuning: { deltaFlushChars: 1, deltaFlushMs: 1, cancelPollMs: 5, heartbeatMs: 20 },
    });
    const second = await env.newConversation();
    const workerA = env.depsFor(open(), createFakeMotor(script("a")));
    const workerB = env.depsFor(open(), createFakeMotor(script("b")));
    const web = open();
    const webGate = env.gateFor(web);

    const runA = await env.queueMessage("Frage A");
    const runB = await env.queueMessage("Frage B", second);

    const appendLoop = async (conversationId: typeof second) => {
      for (let i = 0; i < 40; i++) {
        await repo.events.append(web, {
          conversationId,
          type: "message.created",
          data: { messageId: newId("message"), role: "system", text: "" },
        });
      }
    };
    const ownerLoop = async (conversationId: typeof second) => {
      for (let i = 0; i < 10; i++) {
        await webGate.run(
          {
            actionId: newId("action"),
            type: "unterhaltung.umbenennen",
            actor: "besitzer",
            target: { conversationId },
          },
          { credential: "sitzung" },
          async () => {
            await repo.conversations.rename(web, conversationId, `Titel ${i}`);
            return { value: undefined, result: { status: "ok" } };
          },
        );
      }
    };

    const all = Promise.all([
      executeRun(runA.runId, workerA, new AbortController().signal),
      executeRun(runB.runId, workerB, new AbortController().signal),
      appendLoop(env.conversationId),
      appendLoop(second),
      ownerLoop(env.conversationId),
      ownerLoop(second),
    ]);
    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("verklemmt: nicht in 60 s fertig")), 60_000),
    );
    const [outcomeA, outcomeB] = await Promise.race([all, timeout]);
    expect(outcomeA.status).toBe("succeeded");
    expect(outcomeB.status).toBe("succeeded");

    for (const conversationId of [env.conversationId, second]) {
      const events = await repo.events.listSince(main, conversationId, { limit: 5000 });
      expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1));
      expect(events.filter((e) => e.type === "text.delta")).toHaveLength(40);
      // 2 Belege der Modell-Anfrage + 20 der Umbenennungen erscheinen als beleg.created.
      expect(events.filter((e) => e.type === "beleg.created")).toHaveLength(22);
    }
    const receipts = await repo.belege.listFrom(main, { limit: 5000 });
    expect(receipts.map((r) => r.seq)).toEqual(receipts.map((_, i) => i + 1));
    expect(receipts).toHaveLength(1 + 2 * 2 + 2 * 20);
    expect((await env.verify()).ok).toBe(true);
    const answerA = await repo.messages.get(main, outcomeA.messageId as never);
    expect(answerA?.content.startsWith("a0 a1 ")).toBe(true);
  });
});
