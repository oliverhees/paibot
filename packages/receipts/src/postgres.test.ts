/**
 * PaiBot – Test gegen echtes Postgres (nur mit PAIBOT_TEST_DATABASE_URL): gleichzeitiges Anhängen über zwei Verbindungen.
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
});
