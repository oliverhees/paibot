/**
 * PaiBot – Tests gegen echtes Postgres (nur mit PAIBOT_TEST_DATABASE_URL): gleichzeitiges Anhängen
 * über zwei Verbindungen, auch zusammen mit Ereignissen derselben Unterhaltung.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { createDb, installationKeys, repo } from "@paibot/db";
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
  TEST_DATABASE_URL_ENV,
} from "@paibot/db/testing";
import { evaluate } from "@paibot/gate";
import { newId } from "@paibot/shared/ids";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  keyInfo,
  sendAction,
  sendFacts,
  TEST_INSTALLATION,
  TEST_RULE,
  type TestKey,
  testKey,
} from "./testhilfen";
import { verifyChain } from "./verify";
import { createReceiptWriter } from "./writer";

const BASE_URL = process.env[TEST_DATABASE_URL_ENV];
const PER_CONNECTION = 30;

describe.skipIf(BASE_URL === undefined)("Beleg-Schreiber gegen echtes Postgres", () => {
  let database: PostgresTestDatabase;
  let first: ReturnType<typeof createDb>;
  let second: ReturnType<typeof createDb>;
  let key: TestKey;

  beforeAll(async () => {
    database = await createPostgresTestDatabase(BASE_URL ?? "");
    first = createDb(database.url);
    second = createDb(database.url);
    key = testKey();
    await first.db.insert(installationKeys).values({
      id: key.keyId,
      purpose: "receipts",
      publicKey: key.publicKey,
      privateKeyEnc: "v1:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA:AA",
      fingerprint: key.fingerprint,
    });
  });

  afterAll(async () => {
    await first?.sql.end({ timeout: 2 });
    await second?.sql.end({ timeout: 2 });
    await database?.drop();
  });

  it("gleichzeitiges Anhängen über zwei Verbindungen ergibt eine lückenlose, gültige Kette", async () => {
    const keys = { current: async () => ({ keyId: key.keyId, privateKey: key.privateKey }) };
    const writers = [createReceiptWriter(first.db, keys), createReceiptWriter(second.db, keys)];
    await writers[0]?.appendStart({
      installationId: TEST_INSTALLATION,
      key,
      software: "0.3.0+dev",
      time: new Date(),
    });

    const appends = writers.flatMap((writer) =>
      Array.from({ length: PER_CONNECTION }, async () => {
        const action = sendAction();
        const facts = sendFacts();
        const time = new Date();
        await writer.appendDecision({
          action,
          facts,
          decision: evaluate(action, facts, [TEST_RULE]),
          time,
        });
        await writer.appendResult({ action, result: { status: "ok" }, time });
      }),
    );
    const results = await Promise.allSettled(appends);
    expect(results.filter((r) => r.status === "rejected")).toEqual([]);

    const entries = await repo.belege.listFrom(first.db, { limit: 10_000 });
    expect(entries).toHaveLength(1 + 2 * 2 * PER_CONNECTION);
    expect(entries.map((e) => e.seq)).toEqual(entries.map((_, i) => i + 1));
    for (let i = 1; i < entries.length; i++) {
      expect(entries[i]?.body.prev).toBe(entries[i - 1]?.hash);
    }
    const report = await verifyChain(entries, [keyInfo(key)], { rules: [TEST_RULE] });
    expect(report).toMatchObject({ ok: true, checked: entries.length });
  });

  it("Ereignisse und Belege derselben Unterhaltung gleichzeitig über zwei Verbindungen: keine Verklemmung", async () => {
    const keys = { current: async () => ({ keyId: key.keyId, privateKey: key.privateKey }) };
    if ((await repo.belege.head(first.db)) === undefined) {
      await createReceiptWriter(first.db, keys).appendStart({
        installationId: TEST_INSTALLATION,
        key,
        software: "0.3.0+dev",
        time: new Date(),
      });
    }
    const bot = await repo.bots.create(first.db, {
      name: "Sperren",
      avatarShape: "blatt",
      color: "blau",
    });
    const conversation = await repo.conversations.create(first.db, {
      botId: bot.id,
      title: "Sperren",
    });
    const connections = [first.db, second.db];
    const rounds = 20;

    const work = connections.flatMap((db) => {
      const writer = createReceiptWriter(db, keys);
      return [
        // Belege mit Ereignis beleg.created: erst die Beleg-Sperre, dann die Unterhaltung.
        (async () => {
          for (let i = 0; i < rounds; i++) {
            const action = {
              ...sendAction(),
              target: { conversationId: conversation.id, messageId: newId("message") },
            };
            const facts = sendFacts();
            await writer.appendDecision({
              action,
              facts,
              decision: evaluate(action, facts, [TEST_RULE]),
              time: new Date(),
            });
          }
        })(),
        // Ereignisse ohne Beleg: nur die Zeile der Unterhaltung.
        (async () => {
          for (let i = 0; i < rounds; i++) {
            await repo.events.append(db, {
              conversationId: conversation.id,
              type: "run.queued",
              data: { runId: newId("run") },
            });
          }
        })(),
      ];
    });
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("verklemmt")), 30_000).unref(),
    );
    const results = await Promise.race([Promise.allSettled(work), timeout]);
    expect(
      (results as PromiseSettledResult<void>[]).filter((r) => r.status === "rejected"),
    ).toEqual([]);

    const events = await repo.events.listSince(first.db, conversation.id);
    expect(events).toHaveLength(2 * 2 * rounds);
    expect(events.map((e) => e.seq)).toEqual(events.map((_, i) => i + 1));
    expect(events.filter((e) => e.type === "beleg.created")).toHaveLength(2 * rounds);
    const entries = await repo.belege.listFrom(first.db, { limit: 10_000 });
    expect((await verifyChain(entries, { rules: [TEST_RULE] })).ok).toBe(true);
  });
});
