/**
 * PaiBot – Signaturschlüssel bei gleichzeitigen Läufen gegen echtes Postgres (nur mit
 * PAIBOT_TEST_DATABASE_URL). Die Reihenfolge ist fest gesteuert: Ein Test hält die Sperre der
 * Beleg-Kette, bis der erste Lauf seinen Schlüssel geholt hat und auf die Sperre wartet; erst dann
 * bereitet sich der zweite Lauf vor und lädt den Schlüssel erneut.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { randomBytes } from "node:crypto";
import { executeRun } from "@paibot/agents";
import { createFakeMotor, setupRun, testDokuEnv } from "@paibot/agents/testing";
import {
  decryptSecret,
  deriveKey,
  encryptSecret,
  fingerprint,
  generateSigningKey,
  loadMasterSecret,
} from "@paibot/crypto";
import { createDb, type Database, repo } from "@paibot/db";
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
  TEST_DATABASE_URL_ENV,
} from "@paibot/db/testing";
import type { RunJob } from "@paibot/jobs";
import { createReceiptWriter, RECEIPT_LOCK_ID, verifyChain } from "@paibot/receipts";
import { secretAad, signingKeySecretBinding } from "@paibot/shared/bindung";
import { type KeyId, newId } from "@paibot/shared/ids";
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

const motor = () =>
  createFakeMotor([
    { type: "text-delta", text: "Antwort." },
    { type: "finish", finishReason: "stop", usage: { input: 3, output: 1 } },
  ]);

describe.skipIf(BASE_URL === undefined)("Signaturschlüssel bei gleichzeitigen Läufen", () => {
  const opened: PostgresTestDatabase[] = [];
  const clients: { end(options: { timeout: number }): Promise<unknown> }[] = [];
  afterAll(async () => {
    for (const client of clients.splice(0)) await client.end({ timeout: 2 }).catch(() => undefined);
    for (const db of opened) await db.drop();
  }, 60_000);

  async function install() {
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
    const lines: string[] = [];
    const log = {
      info: (m: string) => lines.push(`info ${m}`),
      warn: (m: string) => lines.push(`warn ${m}`),
      error: (m: string) => lines.push(`error ${m}`),
    };
    // Wie im Worker: eine Quelle für alle Läufe, Vorbereitung je Lauf.
    const source = buildRunDeps(db, { PAIBOT_SECRET: secret, ...testDokuEnv() });
    const runs = createRunHandler({
      db,
      executeRun,
      prepareRunDeps: async () => ({ ...(await source.prepare()), motor: motor() }),
      log,
      secrets: [secret],
    });

    /**
     * Hält die Sperre der Beleg-Kette in einer eigenen Transaktion, solange `body` läuft. Was
     * `body` in `tx` schreibt, sehen andere erst nach dem Ende (dann ist auch die Sperre frei).
     */
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
    const start = (j: RunJob) => runs.handler(j, new AbortController().signal);
    const status = async (j: RunJob) => {
      const run = await repo.runs.get(db, j.runId);
      return { status: run?.status, code: run?.errorCode };
    };
    return {
      db,
      sql,
      secret,
      setup,
      lines,
      withChainLock,
      waitingOnLock,
      job,
      start,
      status,
    };
  }

  /** Legt einen neuen Signaturschlüssel an und hängt den Wechsel-Beleg an (signiert vom bisherigen). */
  async function rotate(t: Awaited<ReturnType<typeof install>>, target: Database = t.db) {
    const keysKey = deriveKey(loadMasterSecret({ PAIBOT_SECRET: t.secret }), "keys-v1");
    const previous = await repo.installationKeys.getActive(target);
    if (previous === undefined) throw new Error("kein Schlüssel");
    const previousPrivate = decryptSecret(previous.privateKeyEnc, keysKey, {
      aad: secretAad(signingKeySecretBinding(previous.id, previous.publicKey)),
    });
    const pair = generateSigningKey();
    const keyId = newId("key") as KeyId;
    await repo.installationKeys.rotate(target, {
      id: keyId,
      publicKey: pair.publicKey,
      privateKeyEnc: encryptSecret(pair.privateKey, keysKey, {
        aad: secretAad(signingKeySecretBinding(keyId, pair.publicKey)),
      }),
      fingerprint: fingerprint(pair.publicKey),
    });
    const writer = createReceiptWriter(target, {
      current: async () => ({ keyId: previous.id, privateKey: previousPrivate }),
    });
    await writer.appendKeyChange({
      next: { keyId, publicKey: pair.publicKey, privateKey: pair.privateKey },
      previous: { keyId: previous.id, privateKey: previousPrivate },
      time: new Date(),
    });
    return { keyId, previousId: previous.id };
  }

  it("zweiter Lauf lädt den Schlüssel, während der erste auf die Beleg-Kette wartet: beide gelingen", async () => {
    const t = await install();
    const a = await t.job();
    const b = await t.job(await t.setup.newConversation());
    let runA: Promise<void> | undefined;
    let runB: Promise<void> | undefined;
    await t.withChainLock(async () => {
      runA = t.start(a);
      // Lauf A hat seinen Schlüssel geholt und wartet auf die Sperre.
      await waitFor(async () => (await t.waitingOnLock()) === 1);
      // Erst jetzt bereitet sich Lauf B vor und lädt den Schlüssel erneut.
      runB = t.start(b);
      await waitFor(async () => (await t.waitingOnLock()) === 2);
    });
    await Promise.all([runA, runB]);

    expect(await t.status(a)).toEqual({ status: "succeeded", code: undefined });
    expect(await t.status(b)).toEqual({ status: "succeeded", code: undefined });
    expect(t.lines.join("\n")).not.toContain("schluessel_nicht_geladen");
    expect((await t.setup.verify()).ok).toBe(true);
  }, 60_000);

  it("mehrere Läufe nacheinander begonnen, alle warten zugleich: alle gelingen, alle Belege mit dem einen Schlüssel", async () => {
    const t = await install();
    const key = await repo.installationKeys.getActive(t.db);
    const before = (await t.setup.receipts()).length;
    const jobs: RunJob[] = [];
    // Drei Läufe: so viele Verbindungen hat der Pool neben der Sperre und der Abfrage frei.
    for (let i = 0; i < 3; i += 1) jobs.push(await t.job(await t.setup.newConversation()));
    const all: Promise<void>[] = [];
    await t.withChainLock(async () => {
      // Jeder weitere Lauf beginnt erst, wenn die vorigen ihren Schlüssel schon geholt haben.
      for (const j of jobs) {
        all.push(t.start(j));
        await waitFor(async () => (await t.waitingOnLock()) === all.length);
      }
    });
    await Promise.all(all);
    for (const j of jobs) expect((await t.status(j)).status).toBe("succeeded");
    const added = (await t.setup.receipts()).slice(before);
    expect(added).toHaveLength(jobs.length * 2);
    expect(added.every((r) => r.keyId === key?.id)).toBe(true);
    expect((await t.setup.verify()).ok).toBe(true);
  }, 60_000);

  it("Schlüsselwechsel ohne Neustart: der nächste Lauf signiert mit dem neuen Schlüssel", async () => {
    const t = await install();
    const first = await t.job();
    await t.start(first);
    const { keyId, previousId } = await rotate(t);
    const before = (await t.setup.receipts()).length;
    const second = await t.job();
    await t.start(second);

    expect(await t.status(first)).toEqual({ status: "succeeded", code: undefined });
    expect(await t.status(second)).toEqual({ status: "succeeded", code: undefined });
    const receipts = await t.setup.receipts();
    expect(receipts.slice(0, before - 1).every((r) => r.keyId === previousId)).toBe(true);
    expect(receipts[before - 1]?.body.type).toBe("key_change");
    expect(receipts.slice(before).map((r) => r.keyId)).toEqual([keyId, keyId]);
    expect((await t.setup.verify()).ok).toBe(true);
  }, 60_000);

  it("Schlüsselwechsel, während ein Lauf mit dem alten Schlüssel wartet: er lädt neu und signiert mit dem neuen", async () => {
    const t = await install();
    const a = await t.job();
    const b = await t.job(await t.setup.newConversation());
    const before = (await t.setup.receipts()).length;
    let runA: Promise<void> | undefined;
    let runB: Promise<void> | undefined;
    let newKey: KeyId | undefined;
    await t.withChainLock(async (tx) => {
      runA = t.start(a);
      await waitFor(async () => (await t.waitingOnLock()) === 1);
      // Wechsel samt Beleg in derselben Transaktion: andere sehen ihn erst mit dem Ende der Sperre.
      newKey = (await rotate(t, tx)).keyId;
      runB = t.start(b);
      await waitFor(async () => (await t.waitingOnLock()) === 2);
    });
    await Promise.all([runA, runB]);

    expect(await t.status(a)).toEqual({ status: "succeeded", code: undefined });
    expect(await t.status(b)).toEqual({ status: "succeeded", code: undefined });
    const added = (await t.setup.receipts()).slice(before);
    expect(added.map((r) => r.body.type)).toEqual([
      "key_change",
      "decision",
      "decision",
      "result",
      "result",
    ]);
    // Jeder Beleg nach dem Wechsel trägt die Kennung des neuen Schlüssels, und die Kette prüft
    // jede Signatur mit dem Schlüssel dieser Kennung.
    expect(added.slice(1).every((r) => r.keyId === newKey)).toBe(true);
    expect((await t.setup.verify()).ok).toBe(true);
  }, 60_000);

  it("scheitert das Laden für einen Lauf, scheitert nur dieser; der wartende gelingt, ohne Geheimnis im Protokoll", async () => {
    const t = await install();
    const key = await repo.installationKeys.getActive(t.db);
    if (key === undefined) throw new Error("kein Schlüssel");
    const keysKey = deriveKey(loadMasterSecret({ PAIBOT_SECRET: t.secret }), "keys-v1");
    const pair = generateSigningKey();
    const brokenId = newId("key") as KeyId;
    // Neuer aktiver Schlüssel, gültig verschlüsselt, aber an eine andere Kennung gebunden: das
    // Entschlüsseln scheitert. Die Kette nennt weiter den bisherigen Schlüssel als aktiven.
    const broken = encryptSecret(pair.privateKey, keysKey, {
      aad: secretAad(signingKeySecretBinding(newId("key") as KeyId, pair.publicKey)),
    });
    const a = await t.job();
    const b = await t.job(await t.setup.newConversation());
    let runA: Promise<void> | undefined;
    await t.withChainLock(async () => {
      runA = t.start(a);
      await waitFor(async () => (await t.waitingOnLock()) === 1);
      await repo.installationKeys.rotate(t.db, {
        id: brokenId,
        publicKey: pair.publicKey,
        privateKeyEnc: broken,
        fingerprint: fingerprint(pair.publicKey),
      });
      await t.start(b);
    });
    await runA;

    expect(await t.status(a)).toEqual({ status: "succeeded", code: undefined });
    expect(await t.status(b)).toEqual({ status: "failed", code: "intern" });
    const text = t.lines.join("\n");
    expect(text).toContain(`Lauf ${b.runId} gescheitert`);
    expect(text).not.toContain(`Lauf ${a.runId} gescheitert`);
    for (const secret of [pair.privateKey, t.secret, key.privateKeyEnc, broken]) {
      expect(text).not.toContain(secret);
    }
    expect((await t.setup.verify()).ok).toBe(true);
  }, 60_000);
});
