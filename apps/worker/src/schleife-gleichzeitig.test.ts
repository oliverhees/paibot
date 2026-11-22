/**
 * PaiBot – Zwei Läufe mit je zwei Werkzeug-Schritten gleichzeitig über den Handler des Workers
 * gegen echtes Postgres (nur mit PAIBOT_TEST_DATABASE_URL). Die Reihenfolge ist fest gesteuert wie
 * in `schluessel-gleichzeitig.test.ts`: Lauf B bereitet sich vor (und lädt den Schlüssel), während
 * Lauf A auf die Sperre der Beleg-Kette wartet.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { randomBytes } from "node:crypto";
import { createToolRegistry, executeRun } from "@paibot/agents";
import { createFakeMotor, createTestTools, setupRun } from "@paibot/agents/testing";
import { createDb, type Database, repo } from "@paibot/db";
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
  TEST_DATABASE_URL_ENV,
} from "@paibot/db/testing";
import type { RunJob } from "@paibot/jobs";
import { createReceiptWriter, RECEIPT_LOCK_ID, verifyChain } from "@paibot/receipts";
import { afterAll, describe, expect, it } from "vitest";
import { buildRunDeps } from "./abhaengigkeiten";
import { createRunHandler } from "./lauf";

const BASE_URL = process.env[TEST_DATABASE_URL_ENV];

async function waitFor(condition: () => Promise<boolean>, ms = 20_000): Promise<void> {
  const until = Date.now() + ms;
  while (!(await condition())) {
    if (Date.now() > until) throw new Error("Zeit abgelaufen");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** Je Lauf ein Motor: zwei Schritte mit je einem Aufruf von `test_lesen`, dann die Antwort. */
const motor = () =>
  createFakeMotor((_input, turn) =>
    turn < 2
      ? [
          { type: "tool-call", callId: `c${turn}`, name: "test_lesen", input: { q: `s${turn}` } },
          { type: "finish", finishReason: "tool-calls", usage: { input: 3, output: 1 } },
        ]
      : [
          { type: "text-delta", text: "Antwort." },
          { type: "finish", finishReason: "stop", usage: { input: 3, output: 1 } },
        ],
  );

describe.skipIf(BASE_URL === undefined)("gleichzeitige Läufe mit Werkzeugen", () => {
  const opened: PostgresTestDatabase[] = [];
  const clients: { end(options: { timeout: number }): Promise<unknown> }[] = [];
  afterAll(async () => {
    for (const client of clients.splice(0)) await client.end({ timeout: 2 }).catch(() => undefined);
    for (const db of opened) await db.drop();
  }, 60_000);

  // Gegenprobe: Halter wie vor der Behebung (Fach bei jedem load() leeren) → mindestens ein Lauf failed intern, rot.
  it("zwei Läufe in zwei Unterhaltungen: beide succeeded, kein schluessel_nicht_geladen, ein Schlüssel, Kette vertrauenswürdig", async () => {
    const testDb = await createPostgresTestDatabase(BASE_URL ?? "");
    opened.push(testDb);
    const { db, sql } = createDb(testDb.url);
    clients.push(sql);
    const secret = randomBytes(32).toString("base64");
    const setup = await setupRun(
      db,
      {
        createWriter: createReceiptWriter,
        verify: (entries, options) => verifyChain(entries, options as never),
      },
      {
        secret,
        providerBaseUrl: "http://127.0.0.1:9/v1",
        providerKey: "sk-test-unbenutzt-000000000000",
        motor: motor(),
      },
    );
    const tools = createTestTools({ allowedByR010: "test_lesen" });
    const registry = await createToolRegistry(tools.tools);
    const lines: string[] = [];
    const log = {
      info: (m: string) => lines.push(`info ${m}`),
      warn: (m: string) => lines.push(`warn ${m}`),
      error: (m: string) => lines.push(`error ${m}`),
    };
    const source = buildRunDeps(db, { PAIBOT_SECRET: secret });
    const runs = createRunHandler({
      db,
      executeRun,
      prepareRunDeps: async () => ({
        ...(await source.prepare()),
        motor: motor(),
        tools: registry,
      }),
      log,
      secrets: [secret],
    });
    const withChainLock = (body: (tx: Database) => Promise<void>) =>
      db.transaction(async (tx) => {
        await tx.execute(`select pg_catalog.pg_advisory_xact_lock(${RECEIPT_LOCK_ID})`);
        await body(tx);
      });
    const waitingOnLock = async () => {
      const [row] = await sql<{ n: number }[]>`
        select count(*)::int as n from pg_catalog.pg_locks l
        join pg_catalog.pg_database d on d.oid = l.database
        where l.locktype = 'advisory' and not l.granted and d.datname = current_database()`;
      return row?.n ?? 0;
    };
    const job = async (conversationId = setup.conversationId): Promise<RunJob> => {
      const { runId } = await setup.queueMessage("Frage", conversationId);
      return { runId, conversationId };
    };
    const a = await job();
    const b = await job(await setup.newConversation());
    const key = await repo.installationKeys.getActive(db);
    let runA: Promise<void> | undefined;
    let runB: Promise<void> | undefined;
    await withChainLock(async () => {
      runA = runs.handler(a, new AbortController().signal);
      await waitFor(async () => (await waitingOnLock()) === 1);
      runB = runs.handler(b, new AbortController().signal);
      await waitFor(async () => (await waitingOnLock()) === 2);
    });
    await Promise.all([runA, runB]);

    for (const j of [a, b]) {
      expect((await repo.runs.get(db, j.runId))?.status).toBe("succeeded");
      expect((await repo.toolCalls.listForRun(db, j.runId)).map((c) => c.status)).toEqual([
        "succeeded",
        "succeeded",
      ]);
    }
    expect(tools.protocol.count()).toBe(4);
    expect(lines.join("\n")).not.toContain("schluessel_nicht_geladen");
    const receipts = (await setup.receipts()).filter((r) => r.body.type !== "start");
    expect(receipts.every((r) => r.keyId === key?.id)).toBe(true);
    expect((await setup.verify()).ok).toBe(true);
  }, 60_000);
});
