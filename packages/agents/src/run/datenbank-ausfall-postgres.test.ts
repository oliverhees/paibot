/**
 * PaiBot – Lauf bei einem Ausfall der Datenbank, gegen echtes Postgres: Kann der Wächter Lauf und
 * Not-Aus nicht mehr lesen, hält der Lauf an. Nach dem Ausfall beendet das Aufräumen den Lauf als
 * unterbrochen (mit Stopp-Wunsch früher), und die Unterhaltung nimmt wieder Nachrichten an.
 * Läuft nur mit `PAIBOT_TEST_DATABASE_URL`.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { createDb, repo } from "@paibot/db";
import {
  createPostgresTestDatabase,
  type PostgresTestDatabase,
  TEST_DATABASE_URL_ENV,
} from "@paibot/db/testing";
import { createReceiptWriter, verifyChain } from "@paibot/receipts";
import { afterEach, describe, expect, it } from "vitest";
import { createFakeMotor } from "../testing/fake-motor";
import { setupRun } from "../testing/lauf-umgebung";
import { failStaleRuns } from "./aufraeumen";
import { executeRun } from "./ausfuehren";

const baseUrl = process.env[TEST_DATABASE_URL_ENV];

const RECEIPT_TOOLS = {
  createWriter: createReceiptWriter,
  verify: (entries: Parameters<typeof verifyChain>[0], options: object) =>
    verifyChain(entries, options as Parameters<typeof verifyChain>[1]),
};

async function waitFor(check: () => Promise<boolean>, ms = 10_000): Promise<void> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await check().catch(() => false)) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Zeitgrenze beim Warten");
}

describe.skipIf(baseUrl === undefined)("Lauf bei Ausfall der Datenbank (echtes Postgres)", () => {
  const cleanup: (() => Promise<void>)[] = [];
  afterEach(async () => {
    for (const step of cleanup.splice(0).reverse()) await step().catch(() => undefined);
  });

  async function umgebung() {
    const database: PostgresTestDatabase = await createPostgresTestDatabase(baseUrl as string);
    cleanup.push(() => database.drop());
    const name = new URL(database.url).pathname.slice(1);
    const main = createDb(database.url);
    const worker = createDb(database.url);
    cleanup.push(() => main.sql.end({ timeout: 1 }));
    cleanup.push(() => worker.sql.end({ timeout: 1 }));
    // Verwalter-Verbindung auf einer anderen Datenbank des Servers: Sie sperrt und kappt.
    const verwalter = createDb(baseUrl as string);
    cleanup.push(() => verwalter.sql.end({ timeout: 1 }));
    const admin = await verwalter.sql.reserve();
    cleanup.push(async () => admin.release());
    await admin`select 1`;
    const motor = createFakeMotor([
      { type: "text-delta", text: "Ein Teil" },
      { type: "bis-abbruch" },
    ]);
    const env = await setupRun(main.db, RECEIPT_TOOLS, {
      providerBaseUrl: "http://127.0.0.1:9/v1",
      providerKey: "sk-test-unbenutzt-000000000000",
      motor,
      tuning: { cancelPollMs: 50, heartbeatMs: 100, deltaFlushChars: 1, deltaFlushMs: 1 },
    });
    const deps = env.depsFor(worker.db, motor);
    const kappen = async () => {
      await admin.unsafe(`alter database ${name} with allow_connections false`);
      await admin`
        select pg_catalog.pg_terminate_backend(pid) from pg_catalog.pg_stat_activity
        where datname = ${name} `;
    };
    const zurueck = () => admin.unsafe(`alter database ${name} with allow_connections true`);
    cleanup.push(async () => {
      await zurueck();
    });
    return { env, deps, motor, kappen, zurueck };
  }

  it("ohne Lesen von Lauf und Not-Aus hält der Lauf an; danach endet er als unterbrochen, die Unterhaltung ist frei", async () => {
    const { env, deps, motor, kappen, zurueck } = await umgebung();
    const { runId } = await env.queueMessage("Frage vor dem Ausfall");
    const lauf = executeRun(runId, deps, new AbortController().signal).then(
      (ergebnis) => ({ ergebnis }),
      (fehler: unknown) => ({ fehler }),
    );
    await waitFor(async () => (await env.events()).some((e) => e.type === "text.delta"));
    expect(motor.calls).toHaveLength(1);

    const gekappt = Date.now();
    await kappen();
    // Der Motor wartet bis zum Abbruch; ohne Anhalten liefe der Lauf bis zur Gesamtzeitgrenze.
    const ende = await Promise.race([
      lauf,
      new Promise<"haengt">((resolve) => setTimeout(() => resolve("haengt"), 8_000)),
    ]);
    expect(ende).not.toBe("haengt");
    expect(Date.now() - gekappt).toBeLessThan(8_000);

    await zurueck();
    // Der Lauf ist nicht sauber zu Ende geschrieben (die Datenbank fehlte) oder schon unterbrochen.
    await waitFor(async () => (await repo.runs.get(env.db, runId)) !== undefined);
    const vorher = await repo.runs.get(env.db, runId);
    expect(["running", "failed"]).toContain(vorher?.status);

    // Aufräumen wie im Worker, eine Minute später: Lauf unterbrochen, Unterhaltung wieder frei.
    const spaeter = new Date(Date.now() + 61_000);
    await failStaleRuns({ db: env.db, clock: { now: () => spaeter }, receipts: env.writer });
    expect(await repo.runs.get(env.db, runId)).toMatchObject({
      status: "failed",
      errorCode: "unterbrochen",
    });
    const neu = await env.queueMessage("Frage nach dem Ausfall");
    expect(neu.runId).not.toBe(runId);
    expect((await env.verify()).ok).toBe(true);
  }, 30_000);

  it("„Stopp“ nach dem Ausfall wirkt: ein Lauf mit Stopp-Wunsch ohne Herzschlag endet schon nach drei Herzschlägen", async () => {
    const { env } = await umgebung();
    const { runId } = await env.queueMessage("Frage");
    await repo.runs.markRunning(env.db, runId);
    const jetzt = Date.now();
    await repo.runs.heartbeat(env.db, runId, { now: new Date(jetzt) });
    const nach = (ms: number) => ({ now: () => new Date(jetzt + ms) });

    // Ohne Stopp-Wunsch bleibt er nach 31 s noch (er könnte noch arbeiten).
    expect(await failStaleRuns({ db: env.db, clock: nach(31_000) })).toEqual([]);
    await repo.runs.requestCancel(env.db, runId);
    expect(await failStaleRuns({ db: env.db, clock: nach(29_000) })).toEqual([]);
    expect(await failStaleRuns({ db: env.db, clock: nach(31_000) })).toEqual([runId]);
    expect((await repo.runs.get(env.db, runId))?.status).toBe("failed");
  });
});
