/**
 * PaiBot – Tests der Warteschlange gegen eine Datenbank im Speicher (PGlite): Reihenfolge je
 * Unterhaltung, parallele Unterhaltungen, kein Doppel-Lauf, Fehler, sauberes Ende.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { PGlite } from "@electric-sql/pglite";
import { PaiBotError } from "@paibot/shared/fehler";
import { newId } from "@paibot/shared/ids";
import { fromPglite, PgBoss } from "pg-boss";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildQueue, jobIdForRun } from "./pgboss-queue";
import { QUEUE_SCHEMA, type Queue, RUN_QUEUE, type RunJob } from "./vertrag";

interface Env {
  pg: PGlite;
  boss: PgBoss;
  queue: Queue;
}

const open: Env[] = [];

function setup(): Env {
  const pg = new PGlite();
  const boss = new PgBoss({
    db: fromPglite(pg),
    backend: "pglite",
    schema: QUEUE_SCHEMA,
    useListenNotify: true,
  });
  const queue = buildQueue(boss, { releaseIntervalMs: 200 });
  const env = { pg, boss, queue };
  open.push(env);
  return env;
}

function makeJob(conversationId = newId("conversation")): RunJob {
  return { runId: newId("run"), conversationId };
}

async function waitFor(condition: () => boolean | Promise<boolean>, ms = 15_000): Promise<void> {
  const until = Date.now() + ms;
  while (!(await condition())) {
    if (Date.now() > until) throw new Error("Zeit abgelaufen, Bedingung nicht erfüllt");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function states(pg: PGlite): Promise<string[]> {
  const result = await pg.query<{ state: string }>(
    `SELECT state FROM ${QUEUE_SCHEMA}.job WHERE name = $1 ORDER BY created_on`,
    [RUN_QUEUE.name],
  );
  return result.rows.map((row) => row.state);
}

let errorLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(async () => {
  for (const env of open.splice(0)) {
    await env.queue.stop({ timeoutMs: 1000 }).catch(() => undefined);
    await env.pg.close().catch(() => undefined);
  }
  vi.restoreAllMocks();
});

describe("Auftrags-ID", () => {
  it("ist stabil, hat UUID-Form und unterscheidet Läufe", () => {
    const runId = newId("run");
    expect(jobIdForRun(runId)).toBe(jobIdForRun(runId));
    expect(jobIdForRun(runId)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(jobIdForRun(runId)).not.toBe(jobIdForRun(newId("run")));
  });
});

describe("Start", () => {
  it("legt Schema und Warteschlange mit den festen Werten an; mehrfacher Start ist harmlos", async () => {
    const { pg, boss, queue } = setup();
    await Promise.all([queue.start(), queue.start()]);
    await queue.start();

    const schemas = await pg.query<{ schema_name: string }>(
      "SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1",
      [QUEUE_SCHEMA],
    );
    expect(schemas.rows).toHaveLength(1);

    const info = await boss.getQueue(RUN_QUEUE.name);
    expect(info).toMatchObject({
      name: "run",
      policy: "key_strict_fifo",
      retryLimit: 0,
      expireInSeconds: 600,
      notify: true,
    });
  });
});

describe("Einreihen", () => {
  it("prüft die Eingabe und reiht bei Fehlern nichts ein", async () => {
    const { pg, queue } = setup();
    await queue.start();
    const bad = { runId: newId("message"), conversationId: newId("conversation") };
    const error = await queue.enqueueRun(bad as unknown as RunJob).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PaiBotError);
    expect((error as PaiBotError).code).toBe("eingabe_ungueltig");
    expect(await states(pg)).toEqual([]);
  });

  it("derselbe Lauf zweimal eingereiht wird einmal ausgeführt", async () => {
    const { pg, queue } = setup();
    const job = makeJob();
    const seen: string[] = [];

    const [first, second] = await Promise.all([queue.enqueueRun(job), queue.enqueueRun(job)]);
    expect(second).toBe(first);
    expect(await queue.enqueueRun(job)).toBe(first);

    await queue.startRunWorker(
      async (j) => {
        seen.push(j.runId);
      },
      { concurrency: 2 },
    );
    await waitFor(async () => (await states(pg)).includes("completed"));
    // Auch nach der Ausführung wird derselbe Lauf nicht noch einmal angenommen.
    expect(await queue.enqueueRun(job)).toBe(first);
    await sleep(500);

    expect(seen).toEqual([job.runId]);
    expect(await states(pg)).toEqual(["completed"]);
  });

  it("reiht in der Transaktion der Aufrufers ein: Rückgängig nimmt den Auftrag zurück", async () => {
    const { pg, queue } = setup();
    await queue.start();
    const gone = makeJob();
    const kept = makeJob();

    await expect(
      pg.transaction(async (tx) => {
        await queue.enqueueRun(gone, {
          executor: { executeSql: (text, values) => tx.query(text, values) },
        });
        throw new Error("abbrechen");
      }),
    ).rejects.toThrow("abbrechen");
    expect(await states(pg)).toEqual([]);

    await pg.transaction(async (tx) => {
      await queue.enqueueRun(kept, {
        executor: { executeSql: (text, values) => tx.query(text, values) },
      });
    });
    expect(await states(pg)).toEqual(["created"]);
  });
});

describe("Bearbeiten", () => {
  it("hält die Reihenfolge je Unterhaltung ein und lässt nie zwei Läufe einer Unterhaltung zugleich laufen", async () => {
    const { queue } = setup();
    const convA = newId("conversation");
    const convB = newId("conversation");
    const jobsA = Array.from({ length: 5 }, () => makeJob(convA));
    const jobsB = Array.from({ length: 3 }, () => makeJob(convB));

    const order = new Map<string, string[]>([
      [convA, []],
      [convB, []],
    ]);
    const running = new Set<string>();
    let overlap = false;

    await queue.start();
    for (const job of jobsA) await queue.enqueueRun(job);
    for (const job of jobsB) await queue.enqueueRun(job);

    await queue.startRunWorker(
      async (job) => {
        if (running.has(job.conversationId)) overlap = true;
        running.add(job.conversationId);
        await sleep(40);
        order.get(job.conversationId)?.push(job.runId);
        running.delete(job.conversationId);
      },
      { concurrency: 4 },
    );

    await waitFor(
      () => (order.get(convA)?.length ?? 0) === 5 && (order.get(convB)?.length ?? 0) === 3,
    );
    expect(order.get(convA)).toEqual(jobsA.map((job) => job.runId));
    expect(order.get(convB)).toEqual(jobsB.map((job) => job.runId));
    expect(overlap).toBe(false);
  });

  it("zwei Unterhaltungen laufen parallel", async () => {
    const { queue } = setup();
    const a = makeJob();
    const b = makeJob();
    let releaseA: () => void = () => undefined;
    const gateA = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    const started: string[] = [];
    const done: string[] = [];

    await queue.enqueueRun(a);
    await queue.enqueueRun(b);
    await queue.startRunWorker(
      async (job) => {
        started.push(job.runId);
        if (job.runId === a.runId) await gateA; // A hält fest, bis B läuft
        done.push(job.runId);
      },
      { concurrency: 2 },
    );

    await waitFor(() => started.includes(a.runId) && started.includes(b.runId));
    await waitFor(() => done.includes(b.runId));
    expect(done).toEqual([b.runId]); // B ist fertig, während A noch läuft
    releaseA();
    await waitFor(() => done.length === 2);
  });

  it("mit concurrency 1 läuft immer nur ein Lauf", async () => {
    const { queue } = setup();
    const jobs = [makeJob(), makeJob(), makeJob()];
    let active = 0;
    let peak = 0;
    let finished = 0;
    for (const job of jobs) await queue.enqueueRun(job);
    await queue.startRunWorker(
      async () => {
        active += 1;
        peak = Math.max(peak, active);
        await sleep(60);
        active -= 1;
        finished += 1;
      },
      { concurrency: 1 },
    );
    await waitFor(() => finished === 3);
    expect(peak).toBe(1);
  });

  it("der Lauf-Worker startet nur einmal und prüft concurrency", async () => {
    const { queue } = setup();
    await expect(queue.startRunWorker(async () => undefined, { concurrency: 0 })).rejects.toThrow(
      RangeError,
    );
    await queue.startRunWorker(async () => undefined, { concurrency: 1 });
    await expect(queue.startRunWorker(async () => undefined, { concurrency: 1 })).rejects.toThrow(
      /läuft schon/,
    );
  });
});

describe("Fehler", () => {
  it("ein Fehler in der Aufgabe wird nicht wiederholt und blockiert die Unterhaltung nicht", async () => {
    const { pg, queue } = setup();
    const conv = newId("conversation");
    const failing = makeJob(conv);
    const next = makeJob(conv);
    const other = makeJob();
    const calls: string[] = [];

    await queue.enqueueRun(failing);
    await queue.enqueueRun(next);
    await queue.enqueueRun(other);
    await queue.startRunWorker(
      async (job) => {
        calls.push(job.runId);
        if (job.runId === failing.runId) throw new Error("Motor kaputt");
      },
      { concurrency: 2 },
    );

    await waitFor(() => calls.includes(next.runId) && calls.includes(other.runId));
    await waitFor(async () => (await states(pg)).every((state) => state === "completed"));
    await sleep(500); // Zeit für eine mögliche (unerwünschte) Wiederholung
    expect(calls.filter((id) => id === failing.runId)).toHaveLength(1);
    expect(calls).toHaveLength(3);
    expect(await states(pg)).toEqual(["completed", "completed"]);
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining("Motor kaputt"));
  });

  it("ein unlesbarer Auftrag erreicht die Aufgabe nicht und blockiert nichts", async () => {
    const { boss, queue } = setup();
    const conv = newId("conversation");
    const good = makeJob(conv);
    const calls: string[] = [];

    await queue.start();
    await boss.send(RUN_QUEUE.name, { kaputt: true }, { singletonKey: conv });
    await queue.enqueueRun(good);
    await queue.startRunWorker(
      async (job) => {
        calls.push(job.runId);
      },
      { concurrency: 1 },
    );
    await waitFor(() => calls.length === 1);
    expect(calls).toEqual([good.runId]);
  });

  it("ein von außen fehlgeschlagener Auftrag (z. B. abgelaufen) wird freigegeben", async () => {
    const { boss, queue } = setup();
    const conv = newId("conversation");
    const stuck = makeJob(conv);
    const next = makeJob(conv);
    let releaseStuck: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      releaseStuck = resolve;
    });
    const calls: string[] = [];

    await queue.enqueueRun(stuck);
    await queue.startRunWorker(
      async (job) => {
        calls.push(job.runId);
        if (job.runId === stuck.runId) await gate;
      },
      { concurrency: 2 },
    );
    await waitFor(() => calls.includes(stuck.runId));

    // So endet ein Auftrag, dessen Ablaufzeit vorbei ist: pg-boss setzt ihn auf „failed“.
    await boss.fail(RUN_QUEUE.name, jobIdForRun(stuck.runId), { message: "abgelaufen" });
    await queue.enqueueRun(next);
    await waitFor(() => calls.includes(next.runId));
    releaseStuck();
  });
});

describe("Ende", () => {
  it("stop lässt eine laufende Aufgabe zu Ende laufen und löst das Signal dann nicht aus", async () => {
    const { pg, queue } = setup();
    const job = makeJob();
    let started = false;
    let finished = false;
    let aborted = true;

    await queue.enqueueRun(job);
    await queue.startRunWorker(
      async (_job, signal) => {
        started = true;
        await sleep(800);
        aborted = signal.aborted;
        finished = true;
      },
      { concurrency: 1 },
    );
    await waitFor(() => started);

    await queue.stop({ timeoutMs: 10_000 });
    expect(finished).toBe(true);
    expect(aborted).toBe(false);
    expect(await states(pg)).toEqual(["completed"]);
  });

  it("stop löst nach der Wartezeit das Abbruch-Signal aus und kehrt zurück", async () => {
    const { queue } = setup();
    const job = makeJob();
    let started = false;
    let sawAbort = false;

    await queue.enqueueRun(job);
    await queue.startRunWorker(
      async (_job, signal) => {
        started = true;
        await new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => {
            sawAbort = true;
            resolve();
          });
        });
      },
      { concurrency: 1 },
    );
    await waitFor(() => started);

    await queue.stop({ timeoutMs: 1000 });
    expect(sawAbort).toBe(true);
  });

  it("nach stop nimmt die Warteschlange nichts mehr an; stop ist wiederholbar", async () => {
    const { queue } = setup();
    await queue.start();
    await queue.stop({ timeoutMs: 1000 });
    await queue.stop();
    await expect(queue.enqueueRun(makeJob())).rejects.toThrow(/beendet/);
    await expect(queue.start()).rejects.toThrow(/beendet/);
  });

  it("stop ohne vorherigen start ist harmlos", async () => {
    const { queue } = setup();
    await queue.stop();
  });
});
