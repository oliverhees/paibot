/**
 * PaiBot – Tests der Warteschlange gegen einen echten Postgres-Server. Sie laufen nur, wenn
 * `PAIBOT_TEST_DATABASE_URL` auf eine Wegwerf-Datenbank zeigt (das Schema `pgboss` wird dort angelegt
 * und benutzt); ohne die Variable werden sie übersprungen. Die Tests mit PGlite in `queue.test.ts`
 * laufen immer.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { randomBytes } from "node:crypto";
import { newId } from "@paibot/shared/ids";
import { PgBoss } from "pg-boss";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createQueue, QUEUE_SCHEMA, type Queue, type RunJob } from "./index";

const url = process.env.PAIBOT_TEST_DATABASE_URL;
const open: Queue[] = [];

/** SQL über die Verbindungs-Schicht der Bibliothek (das Paket hat keinen eigenen Postgres-Client). */
interface AdminDb {
  open(): Promise<void>;
  close(): Promise<void>;
  executeSql(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

function adminDb(address: string): AdminDb {
  return new PgBoss({ connectionString: address, max: 1 }).getDb() as unknown as AdminDb;
}

function withUser(address: string, user: string, password: string, database?: string): string {
  const parsed = new URL(address);
  parsed.username = user;
  parsed.password = password;
  if (database !== undefined) parsed.pathname = `/${database}`;
  return parsed.toString();
}

/**
 * Frische Installation wie im Betrieb: eigene Datenbank, eine App-Rolle ohne Sonderrechte und ohne
 * das Recht, Schemas in der Datenbank anzulegen; das leere Schema der Warteschlange gehört ihr.
 */
const install = {
  database: `paibot_jobs_${randomBytes(4).toString("hex")}`,
  role: `paibot_app_test_${randomBytes(4).toString("hex")}`,
  password: randomBytes(24).toString("hex"),
  appUrl: "",
};

beforeAll(async () => {
  if (!url) return;
  const admin = adminDb(url);
  await admin.open();
  try {
    await admin.executeSql(`create database ${install.database}`);
    await admin.executeSql(
      `create role ${install.role} with login nosuperuser nocreatedb nocreaterole noinherit password '${install.password}'`,
    );
    await admin.executeSql(`grant connect on database ${install.database} to ${install.role}`);
  } finally {
    await admin.close();
  }
  const inDatabase = adminDb(
    withUser(url, new URL(url).username, new URL(url).password, install.database),
  );
  await inDatabase.open();
  try {
    await inDatabase.executeSql(`revoke create on database ${install.database} from public`);
    await inDatabase.executeSql(`revoke create on schema public from public`);
    await inDatabase.executeSql(`create schema ${QUEUE_SCHEMA} authorization ${install.role}`);
  } finally {
    await inDatabase.close();
  }
  install.appUrl = withUser(url, install.role, install.password, install.database);
});

afterAll(async () => {
  if (!url) return;
  for (const q of open.splice(0)) await q.stop({ timeoutMs: 1000 }).catch(() => undefined);
  const admin = adminDb(url);
  await admin.open();
  try {
    await admin.executeSql(`drop database if exists ${install.database} with (force)`);
    await admin.executeSql(`drop role if exists ${install.role}`);
  } finally {
    await admin.close();
  }
});

function queue(): Queue {
  const created = createQueue(install.appUrl);
  open.push(created);
  return created;
}

async function waitFor(condition: () => boolean, ms = 15_000): Promise<void> {
  const until = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > until) throw new Error("Zeit abgelaufen, Bedingung nicht erfüllt");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

afterEach(async () => {
  for (const q of open.splice(0)) await q.stop({ timeoutMs: 1000 }).catch(() => undefined);
  vi.restoreAllMocks();
});

describe.skipIf(!url)("Warteschlange mit der App-Rolle einer frischen Installation", () => {
  it("die App-Rolle darf keine Schemas anlegen, die Warteschlange startet trotzdem", async () => {
    const admin = adminDb(
      withUser(
        url ?? "",
        new URL(url ?? "").username,
        new URL(url ?? "").password,
        install.database,
      ),
    );
    await admin.open();
    try {
      const before = await admin.executeSql(
        `select has_database_privilege('${install.role}', current_database(), 'CREATE') as ok,
                to_regclass('${QUEUE_SCHEMA}.version') is null as frisch`,
      );
      expect(before.rows[0]).toEqual({ ok: false, frisch: true });

      const q = queue();
      await q.start();
      const id = await q.enqueueRun({ runId: newId("run"), conversationId: newId("conversation") });
      expect(id).toMatch(/^[0-9a-f-]{36}$/);

      const after = await admin.executeSql(
        `select has_database_privilege('${install.role}', current_database(), 'CREATE') as ok,
                to_regclass('${QUEUE_SCHEMA}.version') is not null as eingerichtet`,
      );
      expect(after.rows[0]).toEqual({ ok: false, eingerichtet: true });
    } finally {
      await admin.close();
    }
  });

  it("wer das Schema selbst anlegen will, scheitert an der App-Rolle", async () => {
    const boss = new PgBoss({
      connectionString: install.appUrl,
      schema: "pgboss_eigenes",
      max: 1,
    });
    boss.on("error", () => undefined);
    await expect(boss.start()).rejects.toMatchObject({ code: "42501" });
    await boss.stop({ graceful: false, close: true, timeout: 1000 }).catch(() => undefined);
  });
});

describe.skipIf(!url)("Warteschlange mit echtem Postgres", () => {
  it("Reihenfolge je Unterhaltung, parallele Unterhaltungen, kein Doppel-Lauf", async () => {
    const worker = queue();
    const producer = queue(); // zweite Instanz wie die Web-App neben dem Worker
    const convA = newId("conversation");
    const convB = newId("conversation");
    const jobsA: RunJob[] = Array.from({ length: 4 }, () => ({
      runId: newId("run"),
      conversationId: convA,
    }));
    const jobsB: RunJob[] = Array.from({ length: 2 }, () => ({
      runId: newId("run"),
      conversationId: convB,
    }));
    const seen: string[] = [];
    const running = new Set<string>();
    let overlap = false;
    let parallel = false;

    await producer.start();
    for (const job of jobsA) await producer.enqueueRun(job);
    for (const job of jobsB) await producer.enqueueRun(job);
    // Dieselben Aufträge noch einmal, gleichzeitig aus beiden Instanzen.
    await Promise.all([
      ...jobsA.map((job) => producer.enqueueRun(job)),
      ...jobsB.map((job) => worker.enqueueRun(job)),
    ]);

    const mine = new Set([...jobsA, ...jobsB].map((job) => job.runId));
    await worker.startRunWorker(
      async (job) => {
        if (!mine.has(job.runId)) return;
        if (running.has(job.conversationId)) overlap = true;
        if (running.size > 0) parallel = true;
        running.add(job.conversationId);
        await sleep(100);
        seen.push(job.runId);
        running.delete(job.conversationId);
      },
      { concurrency: 4 },
    );

    await waitFor(() => seen.length >= 6);
    await sleep(2500);
    expect(seen).toHaveLength(6);
    expect(seen.filter((id) => jobsA.some((j) => j.runId === id))).toEqual(
      jobsA.map((job) => job.runId),
    );
    expect(seen.filter((id) => jobsB.some((j) => j.runId === id))).toEqual(
      jobsB.map((job) => job.runId),
    );
    expect(overlap).toBe(false);
    expect(parallel).toBe(true);
  });

  it("ein Fehler blockiert die Unterhaltung nicht; stop lässt Laufendes zu Ende laufen", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const q = queue();
    const conv = newId("conversation");
    const failing: RunJob = { runId: newId("run"), conversationId: conv };
    const next: RunJob = { runId: newId("run"), conversationId: conv };
    const calls: string[] = [];
    let finished = false;

    await q.enqueueRun(failing);
    await q.enqueueRun(next);
    await q.startRunWorker(
      async (job) => {
        if (job.runId !== failing.runId && job.runId !== next.runId) return;
        calls.push(job.runId);
        if (job.runId === failing.runId) throw new Error("Motor kaputt");
        await sleep(800);
        finished = true;
      },
      { concurrency: 2 },
    );

    await waitFor(() => calls.includes(next.runId));
    await q.stop({ timeoutMs: 10_000 });
    expect(finished).toBe(true);
    expect(calls).toEqual([failing.runId, next.runId]);
  });
});
