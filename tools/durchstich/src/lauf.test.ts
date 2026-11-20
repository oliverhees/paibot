/**
 * PaiBot – Durchstich über die echte Lauf-Steuerung: Nachricht anlegen, Lauf einreihen, Antwort
 * vom Test-Anbieter über Tor, Modell-Zugang und Motor, Kette und Export prüfen. Mit
 * `PAIBOT_TEST_DATABASE_URL` zusätzlich über die echte Warteschlange.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { createDb, type Database, repo } from "@paibot/db";
import {
  createPostgresTestDatabase,
  createTestDb,
  type PostgresTestDatabase,
  TEST_DATABASE_URL_ENV,
} from "@paibot/db/testing";
import { createFakeProvider, type FakeProvider } from "@paibot/fake-provider";
import {
  createReceiptWriter,
  exportHeader,
  exportJsonl,
  parseJsonl,
  verifyChain,
} from "@paibot/receipts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// Die Lauf-Steuerung und die Warteschlange über ihre Quellen (dieses Werkzeug führt sie nicht als
// Abhängigkeit).
import { createAiSdkMotor, executeRun } from "../../../packages/agents/src/index";
import { setupRun } from "../../../packages/agents/src/testing";
import { createQueue } from "../../../packages/jobs/src/index";

const PROVIDER_KEY = "sk-test-durchstich-000000000000000";
const REPLY = "Hallo, ich bin Pai und antworte über die Lauf-Steuerung.";
const MARKER = "Pflaumenbaum-Notiz";
const BASE_URL = process.env[TEST_DATABASE_URL_ENV];

const RECEIPT_TOOLS = {
  createWriter: createReceiptWriter,
  verify: (entries: Parameters<typeof verifyChain>[0], options: object) =>
    verifyChain(entries, options as Parameters<typeof verifyChain>[1]),
};

let fake: FakeProvider;
let baseUrl: string;

beforeAll(async () => {
  fake = createFakeProvider({ apiKey: PROVIDER_KEY, reply: REPLY });
  ({ baseUrl } = await fake.start({ port: 0 }));
});
afterAll(() => fake.stop());

async function install(db: Database) {
  const env = await setupRun(db, RECEIPT_TOOLS, {
    providerBaseUrl: baseUrl,
    providerKey: PROVIDER_KEY,
    motor: createAiSdkMotor(),
  });
  fake.reset();
  fake.configure({ reply: REPLY });
  return env;
}

async function expectAnswered(env: Awaited<ReturnType<typeof install>>, runId: string) {
  const run = await repo.runs.get(env.db, runId as never);
  expect(run?.status).toBe("succeeded");
  const answer = (await repo.messages.listForConversation(env.db, env.conversationId)).at(-1);
  expect(answer).toMatchObject({ role: "assistant", status: "complete", content: REPLY });
  const report = await env.verify();
  expect(report.ok).toBe(true);
  let exported = "";
  for await (const line of exportJsonl(await exportHeader(env.db), await env.receipts())) {
    exported += line;
  }
  expect(exported).not.toContain(MARKER);
  expect(exported).not.toContain(PROVIDER_KEY);
  const parsed = parseJsonl(exported);
  expect(parsed.entries).toEqual(await env.receipts());
  expect((await verifyChain(parsed.entries, { publicKeys: parsed.header.publicKeys })).ok).toBe(
    true,
  );
}

describe("Durchstich über die Lauf-Steuerung", () => {
  it("Nachricht → Lauf → Antwort → Kette (Datenbank im Speicher, Lauf direkt)", async () => {
    const env = await install((await createTestDb()).db);
    const { runId } = await env.queueMessage(`Merk dir die ${MARKER}.`);
    const outcome = await executeRun(runId, env.deps, new AbortController().signal);
    expect(outcome.status).toBe("succeeded");
    expect(fake.requests.filter((r) => r.path.endsWith("/chat/completions"))).toHaveLength(1);
    await expectAnswered(env, runId);
  });

  describe.skipIf(BASE_URL === undefined)("mit echter Warteschlange", () => {
    let database: PostgresTestDatabase;
    let pool: ReturnType<typeof createDb>;
    beforeAll(async () => {
      database = await createPostgresTestDatabase(BASE_URL as string);
      pool = createDb(database.url);
    });
    afterAll(async () => {
      await pool?.sql.end({ timeout: 2 });
      await database?.drop();
    });

    it("Nachricht → Auftrag in der Warteschlange → Worker-Handler → Antwort → Kette", async () => {
      const env = await install(pool.db);
      const queue = createQueue(database.url);
      await queue.start();
      try {
        await queue.startRunWorker(
          async (job, signal) => {
            await executeRun(job.runId, env.deps, signal);
          },
          { concurrency: 1 },
        );
        const { runId } = await env.queueMessage(`Merk dir die ${MARKER}.`);
        await queue.enqueueRun({ runId, conversationId: env.conversationId });
        const until = Date.now() + 30_000;
        while ((await repo.runs.get(pool.db, runId))?.status !== "succeeded") {
          if (Date.now() > until) throw new Error("Lauf nicht fertig");
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
        await expectAnswered(env, runId);
      } finally {
        await queue.stop({ timeoutMs: 1000 });
      }
    });
  });
});
