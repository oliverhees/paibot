/**
 * PaiBot – Rolle worker: Einstellungen prüfen, auf Datenbank und Migrationen warten, Rechte
 * prüfen, Warteschlange starten, Läufe ausführen, sauber enden.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import path from "node:path";
import {
  type executeRun as executeRunFn,
  type failStaleRuns as failStaleRunsFn,
  RUN_TUNING,
  type RunDeps,
} from "@paibot/agents";
import type { Database } from "@paibot/db";
import {
  ALLOW_PRIVILEGED_DB_ENV,
  type MigrationState,
  ROLE_ISSUE_TEXT,
  type RoleCheck,
} from "@paibot/db/migrate";
import { type Queue, RUN_QUEUE } from "@paibot/jobs";
import { type Heartbeat, startHeartbeat } from "./herzschlag";
import { createRunHandler } from "./lauf";
import { consoleLog, describeError, secretsOf, type WorkerLog } from "./protokoll";
import { type SchleuseCheck, type SchleuseMeldung, startSchleuseMeldung } from "./schleuse-meldung";
import { readStand } from "./stand";
import { checkWorkerEnv, parseWorkerConfig } from "./umgebung";

type Env = Readonly<Record<string, string | undefined>>;

/** Einstellungen des Workers aus der Umgebung. */
export interface WorkerConfig {
  databaseUrl: string;
  /** Wie viele Läufe gleichzeitig. */
  concurrency: number;
  /** Datei, deren Änderungszeit als Herzschlag für den Healthcheck des Containers dient. */
  healthFile?: string;
  /** Wie lange beim Beenden auf laufende Läufe gewartet wird, in Millisekunden. */
  shutdownTimeoutMs: number;
}

/**
 * Liest die Einstellungen: `DATABASE_URL` (Pflicht), `PAIBOT_SECRET` (Pflicht, geprüft beim Start),
 * `SCHLEUSE_URL`/`SCHLEUSE_KEY` (optional), Gleichzeitigkeit und Health-Datei mit Standardwerten.
 * Fehler: `TypeError` mit dem Namen der fehlenden oder ungültigen Variable, nie mit ihrem Wert.
 */
export function loadWorkerConfig(env: Readonly<Record<string, string | undefined>>): WorkerConfig {
  return parseWorkerConfig(env);
}

/** Laufender Worker. */
export interface RunningWorker {
  /** Nimmt keine neuen Läufe an, wartet auf laufende (höchstens `shutdownTimeoutMs`), schließt alles. */
  stop(): Promise<void>;
}

/** Verbindung des Workers zur Datenbank mit den Prüfungen, die er beim Start braucht. */
export interface DatabaseHandle {
  db: Database;
  migrationState(migrationsFolder: string): Promise<MigrationState>;
  roleCheck(): Promise<RoleCheck>;
  /** Kurze Anfrage an die Datenbank; wirft, wenn sie nicht antwortet. */
  probe(): Promise<void>;
  close(): Promise<void>;
}

/** Abhängigkeiten eines Laufs: fest gebauter Teil und Vorbereitung je Lauf. */
export interface RunDepsSource {
  base: RunDeps;
  prepare(): Promise<RunDeps>;
}

/** Zeitgrenzen und Abstände beim Start und im Betrieb. */
export interface WorkerTiming {
  /** So lange wird höchstens auf die Datenbank gewartet. */
  databaseWaitMs: number;
  /** So lange wird höchstens darauf gewartet, dass der Dienst migrate migriert hat. */
  migrationWaitMs: number;
  /** Abstand zwischen zwei Versuchen beim Warten. */
  retryDelayMs: number;
  heartbeatIntervalMs: number;
  probeTimeoutMs: number;
  /** Abstand, in dem der Zustand der Datenschleuse geprüft und gemeldet wird. */
  schleuseIntervalMs: number;
  /**
   * Abstand, in dem hängende Läufe aufgeräumt werden (wie beim Start). So bleibt nach einem
   * Ausfall der Datenbank kein Lauf dauerhaft auf „läuft“, und „Stopp“ wirkt wieder.
   */
  staleIntervalMs: number;
}

export const WORKER_TIMING: WorkerTiming = {
  databaseWaitMs: 60_000,
  migrationWaitMs: 180_000,
  retryDelayMs: 2_000,
  heartbeatIntervalMs: 10_000,
  probeTimeoutMs: 5_000,
  schleuseIntervalMs: 30_000,
  staleIntervalMs: 15_000,
};

/** Alles, was der Worker von außen braucht; Tests ersetzen es. */
export interface WorkerDeps {
  log: WorkerLog;
  pingDatabase(url: string): Promise<boolean>;
  openDatabase(url: string): DatabaseHandle;
  createQueue(url: string): Queue;
  executeRun: typeof executeRunFn;
  failStaleRuns: typeof failStaleRunsFn;
  buildRunDeps(db: Database, env: Env): RunDepsSource;
  /** Prüft die Datenschleuse und meldet ihren Zustand in die Datenbank (für die Web-App). */
  schleuse?: SchleuseCheck;
  timing?: Partial<WorkerTiming>;
}

/** Start abgebrochen; die Gründe stehen schon im Log. Der Prozess endet mit Exit-Code 1. */
export class WorkerStartError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(`Start abgebrochen: ${reason}`);
    this.name = "WorkerStartError";
    this.reason = reason;
  }
}

/** Ein Lauf, der länger als seine Ablaufzeit plus eine Minute dauert, gilt als hängend. */
const HANG_AFTER_MS = RUN_QUEUE.expireInSeconds * 1000 + 60_000;

const HILFE = "Anleitung: docs/installation.md, Abschnitt „Rollen der Datenbank“.";

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function migrationsFolderOf(env: Env): string {
  return env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), "../../packages/db/drizzle");
}

function stateText(state: MigrationState): string {
  return `${state.applied} von ${state.expected} Migrationen angewendet`;
}

/**
 * Startet den Worker mit eingespritzten Abhängigkeiten. Reihenfolge:
 *
 * 1. Pflichtwerte der Umgebung prüfen.
 * 2. Auf die Datenbank warten (`timing.databaseWaitMs`).
 * 3. Warten, bis der Dienst migrate alle Migrationen angewendet hat (`timing.migrationWaitMs`); der
 *    Worker migriert nie selbst.
 * 4. Rechte der Verbindung prüfen: zu viele Rechte brechen in Produktion ab (außer
 *    `PAIBOT_ALLOW_PRIVILEGED_DB=1`).
 * 5. Warteschlange starten, veraltete Läufe aufräumen (`failStaleRuns`), Lauf-Arbeiter anmelden.
 * 6. Zustand der Datenschleuse prüfen und in die Datenbank schreiben, danach regelmäßig.
 * 7. Herzschlag in die Health-Datei schreiben.
 *
 * Jeder Abbruch steht im Log und endet mit `WorkerStartError`; offene Verbindungen werden geschlossen.
 */
export async function runWorker(
  config: WorkerConfig,
  env: Env,
  deps: WorkerDeps,
): Promise<RunningWorker> {
  const { log } = deps;
  const timing = { ...WORKER_TIMING, ...deps.timing };
  const production = env.NODE_ENV === "production";
  const secrets = secretsOf(env);

  function abort(message: string, reason: string): never {
    log.error(message);
    log.error("Start abgebrochen.");
    throw new WorkerStartError(reason);
  }

  // 1. Einstellungen
  const envErrors = checkWorkerEnv(env, production);
  if (envErrors.length > 0) {
    for (const message of envErrors) log.error(message);
    log.error("Start abgebrochen: Einstellungen unvollständig.");
    throw new WorkerStartError("einstellungen");
  }
  log.info(`Start: Rolle worker, Stand ${readStand(env)}.`);
  if (env.DATABASE_MIGRATION_URL) {
    log.warn(
      "DATABASE_MIGRATION_URL ist gesetzt, der Worker braucht und benutzt sie nicht. Entferne sie beim Dienst worker.",
    );
  }

  // 2. Datenbank
  log.info("Warte auf die Datenbank …");
  const dbDeadline = Date.now() + timing.databaseWaitMs;
  for (;;) {
    if (await deps.pingDatabase(config.databaseUrl)) break;
    if (Date.now() + timing.retryDelayMs > dbDeadline) {
      abort(
        `Datenbank nach ${Math.round(timing.databaseWaitMs / 1000)} s nicht erreichbar. Prüfe DATABASE_URL (Host, Benutzer, Passwort) und ob der Dienst postgres läuft. Die App-Rolle legt der Dienst migrate an.`,
        "keine_datenbank",
      );
    }
    await sleep(timing.retryDelayMs);
  }
  log.info("Datenbank erreichbar.");

  const database = deps.openDatabase(config.databaseUrl);
  let queue: Queue | undefined;
  try {
    // 3. Migrationen (nur prüfen)
    const folder = migrationsFolderOf(env);
    const migrationDeadline = Date.now() + timing.migrationWaitMs;
    let waiting = false;
    let last: MigrationState | undefined;
    let lastError = "";
    for (;;) {
      try {
        last = await database.migrationState(folder);
        lastError = "";
      } catch (error) {
        last = undefined;
        lastError = describeError(error, secrets);
      }
      if (last?.status === "aktuell") break;
      if (last?.status === "neuer") {
        abort(
          `Datenbank nicht auf Stand: Sie ist neuer als diese Version von PaiBot (${last.applied} angewendet, ${last.expected} bekannt). Spiele die passende Version ein.`,
          "nicht_auf_stand",
        );
      }
      if (!waiting) {
        waiting = true;
        log.info(
          last === undefined
            ? "Warte auf die Migrationen des Dienstes migrate (Stand noch nicht lesbar) …"
            : `Warte auf die Migrationen des Dienstes migrate (${stateText(last)}) …`,
        );
      }
      if (Date.now() + timing.retryDelayMs > migrationDeadline) {
        const detail = last === undefined ? `Stand nicht lesbar: ${lastError}` : stateText(last);
        abort(
          `Datenbank nicht auf Stand nach ${Math.round(timing.migrationWaitMs / 1000)} s (${detail}). Der Worker migriert nie selbst; das macht der Dienst migrate. Ist er ohne Fehler durchgelaufen?`,
          "nicht_auf_stand",
        );
      }
      await sleep(timing.retryDelayMs);
    }
    log.info(`Datenbank auf Stand (${stateText(last)}).`);

    // 4. Rechte
    const role = await database.roleCheck();
    if (role.status === "zu_viele_rechte") {
      const gruende = role.issues.map((issue) => ROLE_ISSUE_TEXT[issue]).join(", ");
      const text = `Der Worker verbindet sich als Rolle ${role.role} mit zu vielen Rechten (${gruende}). So lassen sich Schutz-Trigger der Belege abschalten. Setze DATABASE_URL beim Dienst worker auf die App-Rolle. ${HILFE}`;
      if (production && env[ALLOW_PRIVILEGED_DB_ENV] !== "1") {
        abort(
          `${text} Nur für den Übergang: ${ALLOW_PRIVILEGED_DB_ENV}=1 erlaubt den Start trotzdem.`,
          "zu_viele_rechte",
        );
      }
      log.warn(`WARNUNG: ${text}`);
    } else {
      log.info(`Rechte der Rolle ${role.role} geprüft: eingeschränkt.`);
    }

    // 5. Lauf-Abhängigkeiten, Warteschlange, Aufräumen, Arbeiter
    const runDeps = deps.buildRunDeps(database.db, env);
    if (runDeps.base.motor.capabilities().toolsExecutedInternally !== false) {
      abort(
        "Der Motor würde Werkzeuge selbst ausführen. Das ist nicht erlaubt: jede Ausführung muss durch das Tor.",
        "motor",
      );
    }

    queue = deps.createQueue(config.databaseUrl);
    await queue.start();
    log.info("Warteschlange gestartet.");

    const prepared = await runDeps.prepare();
    const stale = await deps.failStaleRuns(
      {
        db: database.db,
        clock: prepared.clock,
        ...(prepared.receipts === undefined ? {} : { receipts: prepared.receipts }),
      },
      { staleAfterMs: RUN_TUNING.staleAfterMs },
    );
    log.info(`Veraltete Läufe aufgeräumt: ${stale.length}.`);
    const staleCleanup = startStaleCleanup(
      () =>
        deps.failStaleRuns(
          {
            db: database.db,
            clock: prepared.clock,
            ...(prepared.receipts === undefined ? {} : { receipts: prepared.receipts }),
          },
          { staleAfterMs: RUN_TUNING.staleAfterMs },
        ),
      timing.staleIntervalMs,
      log,
      secrets,
    );

    const runs = createRunHandler({
      db: database.db,
      executeRun: deps.executeRun,
      prepareRunDeps: () => runDeps.prepare(),
      log,
      secrets,
    });
    await queue.startRunWorker(runs.handler, { concurrency: config.concurrency });
    log.info(`Bereit: nimmt Läufe an (höchstens ${config.concurrency} gleichzeitig).`);

    // 6. Zustand der Datenschleuse (die Web-App liest ihn, sie hat keinen Netz-Weg dorthin)
    const schleuse: SchleuseMeldung | undefined =
      deps.schleuse === undefined
        ? undefined
        : await startSchleuseMeldung({
            db: database.db,
            env,
            check: deps.schleuse,
            intervalMs: timing.schleuseIntervalMs,
            log,
            secrets,
          });

    // 7. Herzschlag
    let heartbeat: Heartbeat | undefined;
    if (config.healthFile !== undefined) {
      heartbeat = startHeartbeat({
        file: config.healthFile,
        intervalMs: timing.heartbeatIntervalMs,
        probeTimeoutMs: timing.probeTimeoutMs,
        log,
        secrets,
        probe: async () => {
          const now = Date.now();
          if (runs.active().some((run) => now - run.startedAt > HANG_AFTER_MS)) {
            throw new Error("ein Lauf hängt länger als erlaubt");
          }
          try {
            await database.probe();
          } catch (error) {
            throw new Error(`Datenbank antwortet nicht (${describeError(error, secrets)})`);
          }
        },
      });
    }

    const startedQueue = queue;
    let stopping: Promise<void> | undefined;
    return {
      stop() {
        stopping ??= (async () => {
          log.info("Beende: nehme keine neuen Läufe mehr an.");
          staleCleanup.stop();
          await heartbeat?.stop();
          schleuse?.stop();
          const aborted = runs.abortAll("Der Worker wird beendet.");
          if (aborted > 0) {
            log.info(
              `Abbruch-Signal an ${aborted} laufende Läufe, Zeitgrenze ${Math.round(config.shutdownTimeoutMs / 1000)} s.`,
            );
          }
          const queueStopped = startedQueue
            .stop({ timeoutMs: config.shutdownTimeoutMs })
            .then(() => true)
            .catch((error: unknown) => {
              log.error(`Warteschlange nicht sauber beendet: ${describeError(error, secrets)}`);
              return true;
            });
          const inTime = await Promise.race([
            Promise.all([queueStopped, runs.idle()]).then(() => true),
            sleep(config.shutdownTimeoutMs + 1000).then(() => false),
          ]);
          if (!inTime) {
            log.warn(`Zeitgrenze erreicht: ${runs.active().length} Läufe noch offen.`);
          }
          await database.close().catch(() => undefined);
          log.info("Beendet.");
        })();
        return stopping;
      },
    };
  } catch (error) {
    if (!(error instanceof WorkerStartError)) {
      log.error(`Start fehlgeschlagen: ${describeError(error, secrets)}`);
      log.error("Start abgebrochen.");
    }
    await queue?.stop({ timeoutMs: 1000 }).catch(() => undefined);
    await database.close().catch(() => undefined);
    throw error instanceof WorkerStartError ? error : new WorkerStartError("intern");
  }
}

/**
 * Räumt im Abstand `intervalMs` hängende Läufe auf. Nie zwei Durchgänge gleichzeitig; ein Fehler
 * (etwa weil die Datenbank gerade fehlt) steht einmal im Log, bis ein Durchgang wieder gelingt.
 */
export function startStaleCleanup(
  run: () => Promise<readonly unknown[]>,
  intervalMs: number,
  log: WorkerLog,
  secrets: readonly string[],
): { stop(): void } {
  let busy = false;
  let failing = false;
  const timer = setInterval(() => {
    if (busy) return;
    busy = true;
    run()
      .then((ended) => {
        if (failing) log.info("Aufräumen hängender Läufe geht wieder.");
        failing = false;
        if (ended.length > 0) log.info(`Hängende Läufe beendet: ${ended.length}.`);
      })
      .catch((error: unknown) => {
        if (!failing) {
          log.warn(`Aufräumen hängender Läufe gescheitert: ${describeError(error, secrets)}`);
        }
        failing = true;
      })
      .finally(() => {
        busy = false;
      });
  }, intervalMs);
  timer.unref?.();
  return { stop: () => clearInterval(timer) };
}

/**
 * Startet den Worker:
 * 1. Pflichtwerte prüfen, auf die Datenbank warten.
 * 2. Warten, bis der Dienst migrate migriert hat (der Worker migriert nie selbst), Rechte prüfen.
 * 3. Warteschlange starten, hängende Läufe aufräumen (`failStaleRuns`), `executeRun` als Handler anmelden.
 * 4. Zustand der Datenschleuse melden und Herzschlag in die Health-Datei schreiben, solange er läuft.
 */
export async function startWorker(
  config: WorkerConfig,
  env: Readonly<Record<string, string | undefined>>,
): Promise<RunningWorker> {
  const { realWorkerDeps } = await import("./abhaengigkeiten");
  return runWorker(config, env, { log: consoleLog, ...realWorkerDeps() });
}
