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

import { newId } from "@paibot/shared/ids";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQueue, type Queue, type RunJob } from "./index";

const url = process.env.PAIBOT_TEST_DATABASE_URL;
const open: Queue[] = [];

function queue(): Queue {
  const created = createQueue(url ?? "");
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
