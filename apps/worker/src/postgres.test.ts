/**
 * PaiBot – Worker gegen echtes Postgres mit der echten Warteschlange (nur mit
 * PAIBOT_TEST_DATABASE_URL): eingereihte Läufe werden abgeholt und sauber als fehlgeschlagen
 * markiert, solange die Lauf-Steuerung fehlt; die Warteschlange bleibt dabei in Betrieb.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { randomBytes } from "node:crypto";
import { createDb, repo } from "@paibot/db";
import {
  createPostgresTestDatabase,
  MIGRATIONS_FOLDER,
  type PostgresTestDatabase,
  TEST_DATABASE_URL_ENV,
} from "@paibot/db/testing";
import { createQueue, type RunJob } from "@paibot/jobs";
import { afterAll, describe, expect, it } from "vitest";
import { realWorkerDeps } from "./abhaengigkeiten";
import { runWorker } from "./worker";

const BASE_URL = process.env[TEST_DATABASE_URL_ENV];

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

  it("holt Läufe ab, markiert sie als fehlgeschlagen und arbeitet weiter", async () => {
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
    };
    const worker = await runWorker(
      { databaseUrl: testDb.url, concurrency: 2, shutdownTimeoutMs: 2000 },
      env,
      { log, ...realWorkerDeps() },
    );
    const sender = createQueue(testDb.url);
    try {
      const bot = await repo.bots.create(db, { name: "Pai", avatarShape: "blatt", color: "blau" });
      const jobs: RunJob[] = [];
      for (const title of ["A", "B", "A2"]) {
        const conversation =
          title === "A2" && jobs[0]
            ? { id: jobs[0].conversationId }
            : await repo.conversations.create(db, { botId: bot.id, title });
        const message = await repo.messages.insert(db, {
          conversationId: conversation.id,
          role: "user",
          content: "Hallo",
        });
        if (title === "A2" && jobs[0]) {
          const first = jobs[0];
          await waitFor(async () => (await repo.runs.get(db, first.runId))?.status === "failed");
        }
        const run = await repo.runs.create(db, {
          conversationId: conversation.id,
          triggerMessageId: message.id,
          botId: bot.id,
        });
        const job = { runId: run.id, conversationId: conversation.id };
        jobs.push(job);
        await sender.enqueueRun(job);
      }
      for (const job of jobs) {
        await waitFor(async () => (await repo.runs.get(db, job.runId))?.status === "failed");
        const events = await repo.events.listSince(db, job.conversationId);
        expect(events.filter((e) => e.runId === job.runId).map((e) => e.type)).toEqual([
          "run.failed",
        ]);
      }
      expect(lines).toContain("warn Lauf-Steuerung noch nicht verfügbar (agents.executeRun).");
    } finally {
      await sender.stop({ timeoutMs: 1000 });
      await worker.stop();
      await sql.end({ timeout: 2 });
    }
    expect(lines.at(-1)).toBe("info Beendet.");
  }, 90_000);
});
