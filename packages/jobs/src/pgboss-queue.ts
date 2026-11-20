/**
 * PaiBot – Warteschlange für Läufe auf Basis von pg-boss. Nur dieses Paket kennt die Bibliothek.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { createHash } from "node:crypto";
import { invalidInput } from "@paibot/shared/fehler";
import type { Db, PgBoss } from "pg-boss";
import {
  type EnqueueOptions,
  QUEUE_SUPERVISION,
  type Queue,
  RUN_QUEUE,
  type RunJob,
  type RunJobHandler,
  type RunWorkerOptions,
  runJobSchema,
  type SqlExecutor,
} from "./vertrag";

/** Wartezeit beim Beenden, wenn keine angegeben ist. */
const DEFAULT_STOP_TIMEOUT_MS = 30_000;

/**
 * Abfrage-Abstände der Worker. Neue Aufträge wecken über LISTEN/NOTIFY sofort. Ein Auftrag, der
 * hinter einem laufenden derselben Unterhaltung wartet, löst aber kein Wecken aus, sobald der
 * vorige endet; dafür sorgt die regelmäßige Abfrage (Vorgabe der Bibliothek wären 30 s).
 */
const POLLING_SECONDS = 1;
const NOTIFY_POLLING_SECONDS = 2;

/** Abstand, in dem hängengebliebene, fehlgeschlagene Aufträge freigegeben werden. */
const DEFAULT_RELEASE_INTERVAL_MS = QUEUE_SUPERVISION.releaseIntervalSeconds * 1000;

export interface BuildQueueOptions {
  /** Abstand der Freigabe fehlgeschlagener Aufträge (für Tests kürzer). */
  releaseIntervalMs?: number;
}

/**
 * Feste Auftrags-ID zu einem Lauf (UUID-Form). Dieselbe Lauf-ID ergibt immer dieselbe Auftrags-ID;
 * die Datenbank lehnt einen zweiten Auftrag mit derselben ID ab. So wird ein Lauf nie doppelt
 * eingereiht, auch wenn zwei Prozesse gleichzeitig einreihen.
 */
export function jobIdForRun(runId: string): string {
  const bytes = createHash("sha256").update(`paibot:lauf:${runId}`).digest().subarray(0, 16);
  bytes.writeUInt8((bytes.readUInt8(6) & 0x0f) | 0x50, 6);
  bytes.writeUInt8((bytes.readUInt8(8) & 0x3f) | 0x80, 8);
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Macht aus einer bestehenden Verbindung bzw. Transaktion die Form, die pg-boss erwartet. */
function toDb(executor: SqlExecutor): Db {
  return {
    executeSql: async (text, values) => {
      const result = await executor.executeSql(text, values);
      return { rows: result.rows as never[] };
    },
  };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

type State = "new" | "started" | "stopped";

/**
 * Setzt die Schnittstelle `Queue` auf eine (noch nicht gestartete) pg-boss-Instanz. Die Instanz
 * wird von außen übergeben, damit Tests sie auf PGlite setzen können.
 */
export function buildQueue(boss: PgBoss, options: BuildQueueOptions = {}): Queue {
  const releaseIntervalMs = options.releaseIntervalMs ?? DEFAULT_RELEASE_INTERVAL_MS;
  let state: State = "new";
  let starting: Promise<void> | undefined;
  let workerStarted = false;
  let releaseTimer: ReturnType<typeof setInterval> | undefined;
  let releasing = false;

  boss.on("error", (error) => {
    console.error(`[jobs] Fehler der Warteschlange: ${message(error)}`);
  });

  /**
   * Bei `key_strict_fifo` hält ein fehlgeschlagener Auftrag alle folgenden Aufträge derselben
   * Unterhaltung zurück. Das darf nicht passieren: Er wird entfernt, die Unterhaltung läuft weiter.
   */
  async function releaseFailedJobs(): Promise<number> {
    if (releasing || state !== "started") return 0;
    releasing = true;
    let released = 0;
    try {
      for (const key of await boss.getBlockedKeys(RUN_QUEUE.name)) {
        const jobs = await boss.findJobs(RUN_QUEUE.name, { key });
        const failed = jobs.filter((job) => job.state === "failed").map((job) => job.id);
        if (failed.length > 0) {
          await boss.deleteJob(RUN_QUEUE.name, failed);
          released += failed.length;
        }
      }
    } catch (error) {
      console.error(
        `[jobs] Fehlgeschlagene Aufträge konnten nicht freigegeben werden: ${message(error)}`,
      );
    } finally {
      releasing = false;
    }
    return released;
  }

  async function doStart(): Promise<void> {
    await boss.start();
    await boss.createQueue(RUN_QUEUE.name, {
      policy: RUN_QUEUE.policy,
      retryLimit: RUN_QUEUE.retryLimit,
      expireInSeconds: RUN_QUEUE.expireInSeconds,
      heartbeatSeconds: RUN_QUEUE.heartbeatSeconds,
      notify: RUN_QUEUE.notify,
    });
    // Eine schon vorhandene Warteschlange behält sonst ihre alten Werte.
    await boss.updateQueue(RUN_QUEUE.name, {
      retryLimit: RUN_QUEUE.retryLimit,
      expireInSeconds: RUN_QUEUE.expireInSeconds,
      heartbeatSeconds: RUN_QUEUE.heartbeatSeconds,
      notify: RUN_QUEUE.notify,
    });
    if (state === "new") state = "started";
  }

  function start(): Promise<void> {
    if (state === "stopped") {
      return Promise.reject(new Error("Die Warteschlange ist beendet."));
    }
    if (state === "started") return Promise.resolve();
    if (!starting) {
      starting = doStart().catch((error: unknown) => {
        starting = undefined;
        throw error;
      });
    }
    return starting;
  }

  async function enqueueRun(job: RunJob, enqueueOptions?: EnqueueOptions): Promise<string> {
    const parsed = runJobSchema.safeParse(job);
    if (!parsed.success) throw invalidInput(parsed.error, job);
    if (state === "stopped") throw new Error("Die Warteschlange ist beendet.");
    await start();
    const id = jobIdForRun(parsed.data.runId);
    await boss.send(RUN_QUEUE.name, parsed.data, {
      id,
      singletonKey: parsed.data.conversationId,
      ...(enqueueOptions?.executor ? { db: toDb(enqueueOptions.executor) } : {}),
    });
    // `send` liefert nichts, wenn es diesen Lauf schon gibt. Die ID bleibt dieselbe.
    return id;
  }

  /** Setzt einen Auftrag nach einem Fehler auf „fehlgeschlagen“ und gibt die Unterhaltung frei. */
  async function failAndRelease(jobId: string, reason: string): Promise<void> {
    await boss.fail(RUN_QUEUE.name, jobId, { message: reason });
    await boss.deleteJob(RUN_QUEUE.name, jobId);
  }

  async function startRunWorker(handler: RunJobHandler, workerOptions: RunWorkerOptions) {
    const concurrency = workerOptions.concurrency;
    if (!Number.isInteger(concurrency) || concurrency < 1) {
      throw new RangeError("concurrency muss eine ganze Zahl ab 1 sein");
    }
    if (workerStarted) throw new Error("Der Lauf-Worker läuft schon.");
    await start();
    workerStarted = true;

    await releaseFailedJobs();
    releaseTimer = setInterval(() => void releaseFailedJobs(), releaseIntervalMs);
    releaseTimer.unref();

    await boss.work(
      RUN_QUEUE.name,
      {
        localConcurrency: concurrency,
        batchSize: 1,
        pollingIntervalSeconds: POLLING_SECONDS,
        notifyPollingIntervalSeconds: NOTIFY_POLLING_SECONDS,
      },
      async (jobs) => {
        for (const job of jobs) {
          try {
            const parsed = runJobSchema.parse(job.data);
            await handler(parsed, job.signal);
          } catch (error) {
            console.error(`[jobs] Auftrag ${job.id} fehlgeschlagen: ${message(error)}`);
            try {
              await failAndRelease(job.id, message(error));
            } catch (releaseError) {
              console.error(`[jobs] Auftrag ${job.id} nicht freigegeben: ${message(releaseError)}`);
              throw error;
            }
          }
        }
      },
    );
  }

  async function stop(stopOptions?: { timeoutMs?: number }): Promise<void> {
    if (state === "stopped") return;
    const wasStarted = state === "started" || starting !== undefined;
    state = "stopped";
    if (releaseTimer) clearInterval(releaseTimer);
    releaseTimer = undefined;
    if (!wasStarted) return;
    await starting?.catch(() => undefined);
    await boss.stop({
      graceful: true,
      close: true,
      timeout: stopOptions?.timeoutMs ?? DEFAULT_STOP_TIMEOUT_MS,
    });
  }

  return { start, enqueueRun, startRunWorker, stop };
}
