/**
 * PaiBot – Tests des Workers mit eingespritzten Abhängigkeiten: Einstellungen, Reihenfolge beim
 * Start, jede Abbruch-Bedingung, Ende bei Signal mit Zeitgrenze und Herzschlag.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { randomBytes } from "node:crypto";
import type { RunDeps, RunOutcome } from "@paibot/agents";
import type { Database } from "@paibot/db";
import type { MigrationState, RoleCheck } from "@paibot/db/migrate";
import type { Queue, RunJob, RunJobHandler } from "@paibot/jobs";
import { newId, type RunId } from "@paibot/shared/ids";
import { describe, expect, it } from "vitest";
import type { WorkerLog } from "./protokoll";
import { readStand, STAND_ENV } from "./stand";
import { checkWorkerEnv } from "./umgebung";
import {
  type DatabaseHandle,
  loadWorkerConfig,
  type RunningWorker,
  runWorker,
  type WorkerConfig,
  type WorkerDeps,
  WorkerStartError,
} from "./worker";

const SECRET = randomBytes(32).toString("base64");
const DB_PASSWORD = randomBytes(16).toString("hex");
const URL_OK = `postgres://paibot_app:${DB_PASSWORD}@postgres:5432/paibot`;
const ENV = { PAIBOT_SECRET: SECRET, DATABASE_URL: URL_OK, NODE_ENV: "production" };

const CONFIG: WorkerConfig = { databaseUrl: URL_OK, concurrency: 2, shutdownTimeoutMs: 200 };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(condition: () => boolean, ms = 3000): Promise<void> {
  const until = Date.now() + ms;
  while (!condition()) {
    if (Date.now() > until) throw new Error("Zeit abgelaufen");
    await sleep(5);
  }
}

function memoryLog() {
  const lines: string[] = [];
  const log: WorkerLog = {
    info: (m) => lines.push(`info ${m}`),
    warn: (m) => lines.push(`warn ${m}`),
    error: (m) => lines.push(`error ${m}`),
  };
  return { log, lines };
}

/** Warteschlange im Speicher: ruft den Handler direkt, beendet mit Zeitgrenze. */
function memoryQueue(calls: string[]) {
  let handler: RunJobHandler | undefined;
  const running = new Set<Promise<void>>();
  const controllers = new Set<AbortController>();
  let stopped = false;
  const queue: Queue & { push(job: RunJob): Promise<void> } = {
    start: async () => {
      calls.push("queue.start");
    },
    enqueueRun: async (job) => job.runId,
    startRunWorker: async (h) => {
      calls.push("queue.startRunWorker");
      handler = h;
    },
    stop: async (options) => {
      calls.push("queue.stop");
      stopped = true;
      const all = Promise.all(running);
      const timedOut = await Promise.race([
        all.then(() => false),
        sleep(options?.timeoutMs ?? 1000).then(() => true),
      ]);
      if (timedOut) for (const c of controllers) c.abort(new Error("Zeit abgelaufen"));
    },
    push(job) {
      if (handler === undefined || stopped) throw new Error("kein Arbeiter");
      const controller = new AbortController();
      controllers.add(controller);
      const p = handler(job, controller.signal);
      running.add(p);
      return p.finally(() => running.delete(p));
    },
  };
  return queue;
}

interface FakeOptions {
  ping?: () => boolean;
  states?: MigrationState[];
  stateError?: boolean;
  role?: RoleCheck;
  stale?: () => Promise<RunId[]>;
  executeRun?: WorkerDeps["executeRun"];
  toolsInternal?: boolean;
  probe?: () => Promise<void>;
}

const AKTUELL: MigrationState = { status: "aktuell", expected: 6, applied: 6 };
const EINGESCHRAENKT: RoleCheck = { status: "eingeschraenkt", role: "paibot_app", issues: [] };

function fakeDeps(options: FakeOptions = {}) {
  const calls: string[] = [];
  const { log, lines } = memoryLog();
  const queue = memoryQueue(calls);
  const states = [...(options.states ?? [AKTUELL])];
  const handle: DatabaseHandle = {
    db: {} as Database,
    migrationState: async () => {
      calls.push("migrationState");
      if (options.stateError) throw new Error(`permission denied for schema drizzle ${URL_OK}`);
      return states.length > 1 ? (states.shift() as MigrationState) : (states[0] as MigrationState);
    },
    roleCheck: async () => {
      calls.push("roleCheck");
      return options.role ?? EINGESCHRAENKT;
    },
    probe: options.probe ?? (async () => undefined),
    close: async () => {
      calls.push("db.close");
    },
  };
  const base = {
    motor: {
      id: "test",
      capabilities: () => ({
        streaming: true,
        tools: true,
        reasoning: false,
        abort: true,
        toolsExecutedInternally: options.toolsInternal ?? false,
      }),
      runTurn: () => {
        throw new Error("nicht benutzt");
      },
    },
    clock: { now: () => new Date() },
  } as unknown as RunDeps;
  const deps: WorkerDeps = {
    log,
    pingDatabase: async () => {
      calls.push("ping");
      return options.ping?.() ?? true;
    },
    openDatabase: () => {
      calls.push("openDatabase");
      return handle;
    },
    createQueue: () => {
      calls.push("createQueue");
      return queue;
    },
    executeRun: options.executeRun ?? (async (runId) => ({ runId, status: "succeeded" })),
    failStaleRuns: async (staleDeps) => {
      calls.push(`failStaleRuns${staleDeps.receipts === undefined ? "" : " mit Belegen"}`);
      if (options.stale) return options.stale();
      return [];
    },
    buildRunDeps: () => {
      calls.push("buildRunDeps");
      return {
        base,
        prepare: async () => {
          calls.push("prepare");
          return base;
        },
      };
    },
    timing: {
      databaseWaitMs: 60,
      migrationWaitMs: 60,
      retryDelayMs: 10,
      heartbeatIntervalMs: 20,
      probeTimeoutMs: 30,
    },
  };
  return { deps, calls, lines, queue };
}

async function startFails(promise: Promise<RunningWorker>, reason: string) {
  const error = await promise.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(WorkerStartError);
  expect((error as WorkerStartError).reason).toBe(reason);
}

describe("Einstellungen", () => {
  it("liest den Stand aus PAIBOT_BUILD", () => {
    expect(STAND_ENV).toBe("PAIBOT_BUILD");
    expect(readStand({ PAIBOT_BUILD: "0.3.0+20261205.3f9c2ab" })).toBe("0.3.0+20261205.3f9c2ab");
    expect(readStand({})).toMatch(/\+dev$/);
  });

  it("liest Standardwerte und prüft Zahlen, ohne Werte zu nennen", () => {
    expect(loadWorkerConfig({ DATABASE_URL: URL_OK })).toEqual({
      databaseUrl: URL_OK,
      concurrency: 2,
      shutdownTimeoutMs: 20_000,
      healthFile: "/tmp/paibot-worker.herzschlag",
    });
    expect(
      loadWorkerConfig({
        DATABASE_URL: URL_OK,
        PAIBOT_WORKER_CONCURRENCY: "4",
        PAIBOT_WORKER_HEALTH_FILE: "",
      }),
    ).toEqual({ databaseUrl: URL_OK, concurrency: 4, shutdownTimeoutMs: 20_000 });
    expect(() => loadWorkerConfig({})).toThrow(TypeError);
    expect(() =>
      loadWorkerConfig({ DATABASE_URL: URL_OK, PAIBOT_WORKER_CONCURRENCY: "x" }),
    ).toThrow(/PAIBOT_WORKER_CONCURRENCY/);
    expect(() =>
      loadWorkerConfig({ DATABASE_URL: URL_OK, PAIBOT_WORKER_CONCURRENCY: "0" }),
    ).toThrow(TypeError);
    expect(() =>
      loadWorkerConfig({ DATABASE_URL: URL_OK, PAIBOT_WORKER_HEALTH_FILE: "herz" }),
    ).toThrow(/absoluter Pfad/);
    try {
      loadWorkerConfig({ DATABASE_URL: "kaputt:geheim" });
    } catch (error) {
      expect(String(error)).not.toContain("geheim");
    }
  });

  it("Pflichtwerte wie die Web-App, Passwort-Regeln nur in Produktion", () => {
    expect(checkWorkerEnv(ENV, true)).toEqual([]);
    expect(checkWorkerEnv({ DATABASE_URL: URL_OK }, false)).toEqual([
      "PAIBOT_SECRET fehlt. Erzeuge es mit: openssl rand -base64 32",
    ]);
    expect(checkWorkerEnv({ ...ENV, PAIBOT_SECRET: "bitte-erzeugen" }, true)[0]).toMatch(
      /Platzhalter/,
    );
    expect(checkWorkerEnv({ ...ENV, PAIBOT_SECRET: "a2V5" }, true)[0]).toMatch(/falsche Form/);
    const kurz = { ...ENV, DATABASE_URL: "postgres://u:kurz12345@h/db" };
    expect(checkWorkerEnv(kurz, true)).toEqual([
      "Das Passwort in DATABASE_URL ist zu kurz (mindestens 24 Zeichen).",
    ]);
    expect(checkWorkerEnv(kurz, false)).toEqual([]);
    expect(checkWorkerEnv({ ...ENV, DATABASE_URL: "postgres://u:postgres@h/db" }, true)[0]).toMatch(
      /Platzhalter/,
    );
    expect(checkWorkerEnv({ PAIBOT_SECRET: SECRET }, true)).toEqual(["DATABASE_URL fehlt."]);
    expect(checkWorkerEnv({ ...ENV, SCHLEUSE_URL: "http://datenschleuse:4000/v1" }, true)).toEqual([
      "SCHLEUSE_KEY fehlt.",
    ]);
    const alle = checkWorkerEnv({ ...ENV, DATABASE_URL: "postgres://u:kurz12345@h/db" }, true);
    expect(alle.join(" ")).not.toContain("kurz12345");
  });
});

describe("Start", () => {
  it("arbeitet in der festen Reihenfolge und meldet jeden Schritt", async () => {
    const { deps, calls, lines } = fakeDeps({ stale: async () => [] });
    const worker = await runWorker(CONFIG, ENV, deps);
    expect(calls).toEqual([
      "ping",
      "openDatabase",
      "migrationState",
      "roleCheck",
      "buildRunDeps",
      "createQueue",
      "queue.start",
      "prepare",
      "failStaleRuns",
      "queue.startRunWorker",
    ]);
    expect(lines).toEqual([
      expect.stringMatching(/^info Start: Rolle worker, Stand .+\.$/),
      "info Warte auf die Datenbank …",
      "info Datenbank erreichbar.",
      "info Datenbank auf Stand (6 von 6 Migrationen angewendet).",
      "info Rechte der Rolle paibot_app geprüft: eingeschränkt.",
      "info Warteschlange gestartet.",
      "info Veraltete Läufe aufgeräumt: 0.",
      "info Bereit: nimmt Läufe an (höchstens 2 gleichzeitig).",
    ]);
    await worker.stop();
    expect(calls.slice(-2)).toEqual(["queue.stop", "db.close"]);
    expect(lines.slice(-2)).toEqual([
      "info Beende: nehme keine neuen Läufe mehr an.",
      "info Beendet.",
    ]);
    expect(lines.join("\n")).not.toContain(DB_PASSWORD);
  });

  it("bricht bei unvollständigen Einstellungen ab, bevor er die Datenbank anfasst", async () => {
    const { deps, calls, lines } = fakeDeps();
    await startFails(runWorker(CONFIG, { DATABASE_URL: URL_OK }, deps), "einstellungen");
    expect(calls).toEqual([]);
    expect(lines).toEqual([
      "error PAIBOT_SECRET fehlt. Erzeuge es mit: openssl rand -base64 32",
      "error Start abgebrochen: Einstellungen unvollständig.",
    ]);
  });

  it("wartet mit Zeitgrenze auf die Datenbank und bricht dann ab", async () => {
    const { deps, calls, lines } = fakeDeps({ ping: () => false });
    await startFails(runWorker(CONFIG, ENV, deps), "keine_datenbank");
    expect(calls.filter((c) => c === "ping").length).toBeGreaterThan(1);
    expect(calls).not.toContain("openDatabase");
    expect(lines.at(-2)).toMatch(/^error Datenbank nach 0 s nicht erreichbar\. Prüfe DATABASE_URL/);
  });

  it("wartet, bis die Web-App migriert hat, und migriert nie selbst", async () => {
    const leer: MigrationState = { status: "leer", expected: 6, applied: 0 };
    const { deps, calls, lines } = fakeDeps({
      states: [leer, leer, AKTUELL],
      stale: async () => [],
    });
    const worker = await runWorker(CONFIG, ENV, deps);
    expect(calls.filter((c) => c === "migrationState")).toHaveLength(3);
    expect(lines).toContain(
      "info Warte auf die Migrationen der Web-App (0 von 6 Migrationen angewendet) …",
    );
    expect(calls.some((c) => /migrat/i.test(c) && c !== "migrationState")).toBe(false);
    await worker.stop();
  });

  it("bricht nach der Zeitgrenze ab, wenn die Migrationen fehlen, und schließt die Verbindung", async () => {
    const { deps, calls, lines } = fakeDeps({
      states: [{ status: "veraltet", expected: 6, applied: 4 }],
    });
    await startFails(runWorker(CONFIG, ENV, deps), "nicht_auf_stand");
    expect(calls).not.toContain("createQueue");
    expect(calls.at(-1)).toBe("db.close");
    expect(lines.at(-2)).toMatch(
      /^error Datenbank nicht auf Stand nach 0 s \(4 von 6 Migrationen angewendet\)\. Der Worker migriert nie selbst/,
    );
  });

  it("bricht ab, wenn der Stand nicht lesbar ist, ohne Zugangsdaten im Log", async () => {
    const { deps, lines } = fakeDeps({ stateError: true });
    await startFails(runWorker(CONFIG, ENV, deps), "nicht_auf_stand");
    expect(lines.at(-2)).toMatch(/Stand nicht lesbar: Error: permission denied/);
    expect(lines.join("\n")).not.toContain(DB_PASSWORD);
  });

  it("bricht sofort ab, wenn die Datenbank neuer ist als diese Version", async () => {
    const { deps, calls } = fakeDeps({ states: [{ status: "neuer", expected: 6, applied: 7 }] });
    await startFails(runWorker(CONFIG, ENV, deps), "nicht_auf_stand");
    expect(calls.filter((c) => c === "migrationState")).toHaveLength(1);
  });

  const SUPER: RoleCheck = { status: "zu_viele_rechte", role: "paibot", issues: ["superuser"] };

  it("bricht in Produktion ab, wenn er mit zu vielen Rechten verbunden ist", async () => {
    const { deps, calls, lines } = fakeDeps({ role: SUPER });
    await startFails(runWorker(CONFIG, ENV, deps), "zu_viele_rechte");
    expect(calls).not.toContain("createQueue");
    expect(lines.at(-2)).toMatch(/Rolle paibot mit zu vielen Rechten \(ist Superuser\)/);
    expect(lines.at(-2)).toMatch(/PAIBOT_ALLOW_PRIVILEGED_DB=1/);
  });

  it("warnt bei zu vielen Rechten außerhalb der Produktion oder mit ausdrücklicher Erlaubnis", async () => {
    for (const env of [
      { ...ENV, NODE_ENV: "development" },
      { ...ENV, PAIBOT_ALLOW_PRIVILEGED_DB: "1" },
    ]) {
      const { deps, lines } = fakeDeps({ role: SUPER, stale: async () => [] });
      const worker = await runWorker(CONFIG, env, deps);
      expect(lines.some((l) => l.startsWith("warn WARNUNG: Der Worker verbindet sich"))).toBe(true);
      await worker.stop();
    }
  });

  it("verweigert einen Motor, der Werkzeuge selbst ausführt", async () => {
    const { deps, calls } = fakeDeps({ toolsInternal: true });
    await startFails(runWorker(CONFIG, ENV, deps), "motor");
    expect(calls).not.toContain("createQueue");
  });

  it("räumt erst nach dem Laden der Schlüssel auf und schreibt dabei Belege", async () => {
    const { deps, lines, calls } = fakeDeps({ stale: async () => [] });
    const original = deps.buildRunDeps;
    deps.buildRunDeps = (db, env) => {
      const source = original(db, env);
      const base = { ...source.base, receipts: {} as never };
      return {
        base,
        prepare: async () => {
          await source.prepare();
          return base;
        },
      };
    };
    const worker = await runWorker(CONFIG, ENV, deps);
    expect(calls.indexOf("prepare")).toBeLessThan(calls.indexOf("failStaleRuns mit Belegen"));
    expect(lines).toContain("info Veraltete Läufe aufgeräumt: 0.");
    await worker.stop();
  });

  it("bricht ab, wenn das Aufräumen an der Datenbank scheitert, und schließt alles", async () => {
    const { deps, calls } = fakeDeps({
      stale: async () => {
        throw new Error("connection terminated");
      },
    });
    await startFails(runWorker(CONFIG, ENV, deps), "intern");
    expect(calls).toContain("queue.stop");
    expect(calls.at(-1)).toBe("db.close");
  });

  it("warnt, wenn die Migrations-Adresse gesetzt ist", async () => {
    const { deps, lines } = fakeDeps({ stale: async () => [] });
    const worker = await runWorker(
      CONFIG,
      { ...ENV, DATABASE_MIGRATION_URL: `postgres://paibot:${DB_PASSWORD}@postgres/paibot` },
      deps,
    );
    expect(lines.some((l) => l.startsWith("warn DATABASE_MIGRATION_URL ist gesetzt"))).toBe(true);
    expect(lines.join("\n")).not.toContain(DB_PASSWORD);
    await worker.stop();
  });
});

const job = (): RunJob => ({ runId: newId("run"), conversationId: newId("conversation") });

describe("Ende bei Signal", () => {
  it("gibt dem laufenden Auftrag das Abbruch-Signal und wartet auf ihn", async () => {
    let seen: AbortSignal | undefined;
    const { deps, queue, lines } = fakeDeps({
      stale: async () => [],
      executeRun: (runId, _deps, signal) => {
        seen = signal;
        return new Promise<RunOutcome>((resolve) => {
          signal.addEventListener("abort", () => resolve({ runId, status: "cancelled" }));
        });
      },
    });
    const worker = await runWorker(CONFIG, ENV, deps);
    const j = job();
    const done = queue.push(j);
    await waitFor(() => seen !== undefined);
    await worker.stop();
    await done;
    expect(seen?.aborted).toBe(true);
    expect(lines.some((l) => l.startsWith(`info Lauf ${j.runId} beendet: cancelled, `))).toBe(true);
    expect(lines).toContain("info Abbruch-Signal an 1 laufende Läufe, Zeitgrenze 0 s.");
    expect(lines.at(-1)).toBe("info Beendet.");
  });

  it("endet nach der Zeitgrenze, auch wenn ein Lauf das Signal nicht beachtet", async () => {
    let started = false;
    const { deps, queue, lines, calls } = fakeDeps({
      stale: async () => [],
      executeRun: () => {
        started = true;
        return new Promise<RunOutcome>(() => undefined);
      },
    });
    const worker = await runWorker({ ...CONFIG, shutdownTimeoutMs: 50 }, ENV, deps);
    void queue.push(job());
    await waitFor(() => started);
    const t0 = Date.now();
    await worker.stop();
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(lines).toContain("warn Zeitgrenze erreicht: 1 Läufe noch offen.");
    expect(calls.at(-1)).toBe("db.close");
  });

  it("stop ist wiederholbar", async () => {
    const { deps, calls } = fakeDeps({ stale: async () => [] });
    const worker = await runWorker(CONFIG, ENV, deps);
    await Promise.all([worker.stop(), worker.stop()]);
    await worker.stop();
    expect(calls.filter((c) => c === "queue.stop")).toHaveLength(1);
  });
});

describe("Herzschlag im Worker", () => {
  it("schreibt, solange die Datenbank antwortet, und setzt aus, wenn sie hängt", async () => {
    let hang = false;
    const { deps, lines } = fakeDeps({
      stale: async () => [],
      probe: () => (hang ? new Promise(() => undefined) : Promise.resolve()),
    });
    const file = `/tmp/paibot-worker-test-${process.pid}-${Date.now()}`;
    const worker = await runWorker({ ...CONFIG, healthFile: file }, ENV, deps);
    const { stat } = await import("node:fs/promises");
    await waitFor(() => lines.includes("info Herzschlag läuft."));
    expect((await stat(file)).isFile()).toBe(true);
    hang = true;
    await waitFor(() => lines.some((l) => l.startsWith("warn Herzschlag ausgesetzt")));
    const before = (await stat(file)).mtimeMs;
    await sleep(120);
    expect((await stat(file)).mtimeMs).toBe(before);
    await worker.stop();
    await expect(stat(file)).rejects.toThrow();
  });
});
