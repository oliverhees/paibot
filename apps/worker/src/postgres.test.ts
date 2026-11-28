/**
 * PaiBot – Worker gegen echtes Postgres mit der echten Warteschlange und der echten
 * Lauf-Steuerung (nur mit PAIBOT_TEST_DATABASE_URL): eingereihte Läufe werden abgeholt und bis
 * zur gespeicherten Antwort mit Belegen ausgeführt, nacheinander je Unterhaltung.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { randomBytes } from "node:crypto";
import { createFakeMotor, setupRun, testDokuEnv } from "@paibot/agents/testing";
import { createDb, repo } from "@paibot/db";
import {
  createPostgresTestDatabase,
  MIGRATIONS_FOLDER,
  type PostgresTestDatabase,
  TEST_DATABASE_URL_ENV,
} from "@paibot/db/testing";
import { createQueue, prepareQueue, type RunJob } from "@paibot/jobs";
import { createReceiptWriter, verifyChain } from "@paibot/receipts";
import { afterAll, describe, expect, it } from "vitest";
import { buildRunDeps, realWorkerDeps } from "./abhaengigkeiten";
import { runWorker } from "./worker";

const BASE_URL = process.env[TEST_DATABASE_URL_ENV];
const GEHEIM = "Brombeerhecke-Vertraulich";

async function waitFor(condition: () => Promise<boolean>, ms = 30_000): Promise<void> {
  const until = Date.now() + ms;
  while (!(await condition())) {
    if (Date.now() > until) throw new Error("Zeit abgelaufen");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

describe.skipIf(BASE_URL === undefined)("Worker gegen echtes Postgres", () => {
  const opened: PostgresTestDatabase[] = [];
  afterAll(async () => {
    for (const db of opened) await db.drop();
  });

  it("holt Läufe ab, führt sie bis zur Antwort aus, nacheinander je Unterhaltung, ohne Inhalte im Log", async () => {
    const testDb = await createPostgresTestDatabase(BASE_URL ?? "");
    opened.push(testDb);
    const { db, sql } = createDb(testDb.url);
    const lines: string[] = [];
    const log = {
      info: (m: string) => lines.push(`info ${m}`),
      warn: (m: string) => lines.push(`warn ${m}`),
      error: (m: string) => lines.push(`error ${m}`),
    };
    const env = {
      PAIBOT_SECRET: randomBytes(32).toString("base64"),
      DATABASE_URL: testDb.url,
      MIGRATIONS_DIR: MIGRATIONS_FOLDER,
      NODE_ENV: "test",
      ...testDokuEnv(),
    };
    const motor = createFakeMotor((input) => [
      { type: "text-delta", text: `Antwort auf ${input.history.length} Nachrichten.` },
      { type: "finish", finishReason: "stop", usage: { input: 9, output: 4 } },
    ]);
    const setup = await setupRun(
      db,
      {
        createWriter: createReceiptWriter,
        verify: (entries, options) => verifyChain(entries, options as never),
      },
      {
        secret: env.PAIBOT_SECRET,
        providerBaseUrl: "http://127.0.0.1:9/v1",
        providerKey: "sk-test-unbenutzt-000000000000",
        motor,
      },
    );
    // Wie im Betrieb: Der Migrations-Schritt richtet die Warteschlange ein, der Worker nicht.
    await prepareQueue(testDb.url);
    const worker = await runWorker(
      { databaseUrl: testDb.url, concurrency: 2, shutdownTimeoutMs: 2000 },
      env,
      {
        log,
        ...realWorkerDeps(),
        buildRunDeps: (database, environment) => {
          const source = buildRunDeps(database, environment);
          const base = { ...source.base, motor };
          return {
            base,
            prepare: async () => ({ ...(await source.prepare()), motor }),
          };
        },
      },
    ).catch((error: unknown) => {
      throw new Error(`Start gescheitert:\n${lines.join("\n")}`, { cause: error });
    });
    const sender = createQueue(testDb.url);
    try {
      const other = await setup.newConversation();
      const jobs: RunJob[] = [];
      const first = await setup.queueMessage(`Frage mit ${GEHEIM}`);
      jobs.push({ runId: first.runId, conversationId: setup.conversationId });
      const second = await setup.queueMessage("andere Unterhaltung", other);
      jobs.push({ runId: second.runId, conversationId: other });
      for (const job of jobs) await sender.enqueueRun(job);

      await waitFor(async () => (await repo.runs.get(db, first.runId))?.status === "succeeded");
      const third = await setup.queueMessage("noch eine Frage");
      const job3 = { runId: third.runId, conversationId: setup.conversationId };
      jobs.push(job3);
      await sender.enqueueRun(job3);

      for (const job of jobs) {
        await waitFor(async () => (await repo.runs.get(db, job.runId))?.status === "succeeded");
        const types = (await repo.events.listSince(db, job.conversationId))
          .filter((e) => e.runId === job.runId)
          .map((e) => e.type);
        expect(types).toEqual([
          "run.queued",
          "run.started",
          "beleg.created",
          "draft.delta",
          "step.finished",
          "message.created",
          "text.delta",
          "message.completed",
          "beleg.created",
        ]);
      }
      const answers = (await repo.messages.listForConversation(db, setup.conversationId)).filter(
        (m) => m.role === "assistant",
      );
      expect(answers.map((m) => m.content)).toEqual([
        "Antwort auf 1 Nachrichten.",
        "Antwort auf 3 Nachrichten.",
      ]);
      expect((await setup.verify()).ok).toBe(true);
      expect(
        lines.filter((l) => l.startsWith("info Lauf ") && l.includes("beendet: succeeded")),
      ).toHaveLength(3);
      expect(lines.join("\n")).not.toContain(GEHEIM);
      expect(lines.join("\n")).not.toContain(env.PAIBOT_SECRET);
    } finally {
      await sender.stop({ timeoutMs: 1000 });
      await worker.stop();
      await sql.end({ timeout: 2 });
    }
    expect(lines.at(-1)).toBe("info Beendet.");
  }, 90_000);
});
