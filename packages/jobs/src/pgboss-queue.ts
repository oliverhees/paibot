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
  QUEUE_SCHEMA,
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
  /**
   * Nur arbeiten (Worker-Rolle): beim Start weder Schema prüfen noch die Warteschlange `run`
   * anlegen oder ändern. Das hat `prepareQueue` mit der App-Rolle getan.
   */
  nurArbeiten?: boolean;
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

/** Name, Code und Warteschlange nur, wenn sie wie Kennungen aussehen; sonst fallen sie weg. */
const KENNUNG = /^[A-Za-z0-9_.-]{1,60}$/;
const MAX_MESSAGE = 300;

function kennung(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isInteger(value)) return String(value);
  return typeof value === "string" && KENNUNG.test(value) ? value : undefined;
}

/**
 * Beschreibung eines Fehlers für das Log, in einer Zeile. pg-boss meldet Fehler seiner
 * Abfrage-Schleife nicht als `Error`, sondern als einfaches Objekt (`message`, `stack`, `queue`,
 * `worker` und die Felder des ursprünglichen Fehlers wie `code`); auch das wird lesbar
 * beschrieben statt als „[object Object]“. Den Stapel und weitere Felder gibt es nie aus.
 */
export function describeQueueError(error: unknown): string {
  if (error === null || typeof error !== "object") {
    return String(error).replace(/\s+/g, " ").slice(0, MAX_MESSAGE);
  }
  const record = error as Record<string, unknown>;
  const name = kennung(record.name) ?? "Error";
  const code = kennung(record.code);
  const head = code === undefined ? name : `${name} (${code})`;
  const raw = typeof record.message === "string" ? record.message.replace(/\s+/g, " ").trim() : "";
  const text = raw.length > MAX_MESSAGE ? `${raw.slice(0, MAX_MESSAGE)} …` : raw;
  const queue = kennung(record.queue);
  const described = text === "" ? head : `${head}: ${text}`;
  return queue === undefined ? described : `${described} [Warteschlange ${queue}]`;
}

type State = "new" | "started" | "stopped";

/** Verbindung der Bibliothek; die eigene öffnet sie erst beim Start. */
type BossDb = ReturnType<PgBoss["getDb"]> & { opened?: boolean; open?: () => Promise<void> };

/**
 * Sorgt dafür, dass das Schema der Warteschlange da ist, bevor die Bibliothek startet. Im Betrieb
 * legt es der Migrations-Schritt an; dann wird hier nur nachgesehen. Fehlt es (nur eine Rolle,
 * z. B. in der Entwicklung), wird es angelegt; einer App-Rolle ohne dieses Recht verweigert
 * Postgres das, und der Start scheitert mit einer klaren Meldung.
 */
async function ensureSchema(boss: PgBoss): Promise<void> {
  const db = boss.getDb() as BossDb;
  if (db.opened === false && typeof db.open === "function") await db.open();
  const { rows } = await db.executeSql("select to_regnamespace($1) is not null as ok", [
    QUEUE_SCHEMA,
  ]);
  if ((rows[0] as { ok?: boolean } | undefined)?.ok === true) return;
  await db.executeSql(`create schema ${QUEUE_SCHEMA}`);
}

/** Legt die Warteschlange `run` an und setzt ihre Werte (auch bei einer schon vorhandenen). */
async function ensureRunQueue(boss: PgBoss): Promise<void> {
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
}

/** Name einer Rolle in doppelten Anführungszeichen. */
function quoteIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/**
 * Einrichtung durch die Besitzerin (App-Rolle): Schema prüfen, Bibliothek starten (installiert oder
 * hebt ihre Tabellen an), Warteschlange `run` anlegen, Rechte der Worker-Rolle setzen, beenden.
 * Die Rechte vergibt die Besitzerin, weil nur sie das für ihre Tabellen darf. `alter default
 * privileges` gilt für Tabellen, die sie später anlegt (etwa Teil-Tabellen der Statistik).
 */
export async function prepareQueueWith(
  boss: PgBoss,
  options: { workerRole?: string },
): Promise<void> {
  boss.on("error", (error) => {
    console.error(`[jobs] Fehler der Warteschlange: ${describeQueueError(error)}`);
  });
  try {
    await ensureSchema(boss);
    await boss.start();
    await ensureRunQueue(boss);
    if (options.workerRole !== undefined) {
      const role = quoteIdent(options.workerRole);
      const db = boss.getDb();
      for (const statement of [
        `grant usage on schema ${QUEUE_SCHEMA} to ${role}`,
        `grant select, insert, update, delete on all tables in schema ${QUEUE_SCHEMA} to ${role}`,
        `grant usage, select on all sequences in schema ${QUEUE_SCHEMA} to ${role}`,
        `alter default privileges in schema ${QUEUE_SCHEMA} grant select, insert, update, delete on tables to ${role}`,
        `alter default privileges in schema ${QUEUE_SCHEMA} grant usage, select on sequences to ${role}`,
      ]) {
        await db.executeSql(statement);
      }
    }
  } finally {
    await boss.stop({ graceful: false, close: true, timeout: 5_000 });
  }
}

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
    console.error(`[jobs] Fehler der Warteschlange: ${describeQueueError(error)}`);
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
        `[jobs] Fehlgeschlagene Aufträge konnten nicht freigegeben werden: ${describeQueueError(error)}`,
      );
    } finally {
      releasing = false;
    }
    return released;
  }

  async function doStart(): Promise<void> {
    if (options.nurArbeiten === true) {
      await boss.start();
      if ((await boss.getQueue(RUN_QUEUE.name)) === null) {
        throw new Error(
          `Die Warteschlange ${RUN_QUEUE.name} fehlt. Sie legt der Migrations-Schritt (Dienst migrate) an.`,
        );
      }
    } else {
      await ensureSchema(boss);
      await boss.start();
      await ensureRunQueue(boss);
    }
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
            console.error(`[jobs] Auftrag ${job.id} fehlgeschlagen: ${describeQueueError(error)}`);
            try {
              await failAndRelease(job.id, describeQueueError(error));
            } catch (releaseError) {
              console.error(
                `[jobs] Auftrag ${job.id} nicht freigegeben: ${describeQueueError(releaseError)}`,
              );
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
