/**
 * PaiBot – Prozess des Workers: Start, Signale (SIGTERM, SIGINT) und unerwartete Fehler.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { describeError, secretsOf, type WorkerLog } from "./protokoll";
import { checkWorkerEnv } from "./umgebung";
import type { RunningWorker, WorkerConfig } from "./worker";

type Listener = (...args: unknown[]) => void;

export interface ProcessDeps {
  env: Record<string, string | undefined>;
  log: WorkerLog;
  load(env: Readonly<Record<string, string | undefined>>): WorkerConfig;
  start(
    config: WorkerConfig,
    env: Readonly<Record<string, string | undefined>>,
  ): Promise<RunningWorker>;
  exit(code: number): void;
  on(
    event: "SIGTERM" | "SIGINT" | "unhandledRejection" | "uncaughtException",
    listener: Listener,
  ): void;
  /** Wie lange nach einem unerwarteten Fehler höchstens auf das Beenden gewartet wird. */
  fatalStopTimeoutMs?: number;
}

/**
 * Startet den Worker und meldet die Handler an:
 *
 * - Erstes SIGTERM/SIGINT: `stop()` (keine neuen Läufe, Abbruch-Signal mit Zeitgrenze, alles
 *   schließen), danach Exit-Code 0. Kommt das Signal noch während des Starts, endet der Prozess
 *   sofort mit 0.
 * - Zweites Signal: sofort Exit-Code 1.
 * - `unhandledRejection`/`uncaughtException`: eine Zeile ins Log (geschwärzt), kurzes Beenden,
 *   Exit-Code 1.
 * - Unvollständige Einstellungen oder abgebrochener Start: Exit-Code 1.
 */
export async function installProcessHandlers(deps: ProcessDeps): Promise<void> {
  const { env, log } = deps;
  const secrets = secretsOf(env);
  const fatalTimeout = deps.fatalStopTimeoutMs ?? 5000;
  let worker: RunningWorker | undefined;
  let signals = 0;
  let fatal = false;
  let done = false;

  const exit = (code: number) => {
    if (done) return;
    done = true;
    deps.exit(code);
  };

  const onFatal = (error: unknown) => {
    log.error(`Unerwarteter Fehler: ${describeError(error, secrets)}`);
    if (fatal) {
      exit(1);
      return;
    }
    fatal = true;
    const stop = worker?.stop() ?? Promise.resolve();
    void Promise.race([
      stop.catch(() => undefined),
      new Promise((resolve) => setTimeout(resolve, fatalTimeout).unref()),
    ]).then(() => exit(1));
  };
  deps.on("unhandledRejection", onFatal);
  deps.on("uncaughtException", onFatal);

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    deps.on(signal, () => {
      signals += 1;
      if (signals > 1) {
        log.warn(`Zweites Signal (${signal}): beende sofort.`);
        exit(1);
        return;
      }
      if (worker === undefined) {
        log.info(`Signal ${signal} während des Starts: beende.`);
        exit(0);
        return;
      }
      log.info(`Signal ${signal} empfangen.`);
      void worker.stop().then(
        () => exit(0),
        (error: unknown) => {
          log.error(`Beenden fehlgeschlagen: ${describeError(error, secrets)}`);
          exit(1);
        },
      );
    });
  }

  const production = env.NODE_ENV === "production";
  const errors = checkWorkerEnv(env, production);
  if (errors.length > 0) {
    for (const message of errors) log.error(message);
    log.error("Start abgebrochen: Einstellungen unvollständig.");
    exit(1);
    return;
  }

  let config: WorkerConfig;
  try {
    config = deps.load(env);
  } catch (error) {
    if (!(error instanceof TypeError)) throw error;
    log.error(error.message);
    log.error("Start abgebrochen: Einstellungen unvollständig.");
    exit(1);
    return;
  }

  try {
    const started = await deps.start(config, env);
    if (signals > 0 || done) {
      await started.stop();
      return;
    }
    worker = started;
  } catch (error) {
    // Bei WorkerStartError stehen die Gründe schon im Log.
    if (!(error instanceof Error && error.name === "WorkerStartError")) {
      log.error(`Start fehlgeschlagen: ${describeError(error, secrets)}`);
    }
    exit(1);
  } finally {
    delete env.DATABASE_MIGRATION_URL;
  }
}
