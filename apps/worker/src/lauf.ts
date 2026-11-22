/**
 * PaiBot – Bearbeitung eines Auftrags aus der Warteschlange: Lauf über die Lauf-Steuerung
 * ausführen; scheitert sie, den Lauf sauber als fehlgeschlagen abschließen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { closeOpenRunWork, type executeRun as executeRunFn, type RunDeps } from "@paibot/agents";
import { type Database, repo } from "@paibot/db";
import type { RunJob, RunJobHandler } from "@paibot/jobs";
import type { ErrorCode } from "@paibot/shared/fehler";
import type { RunId } from "@paibot/shared/ids";
import { errorText } from "@paibot/shared/texte";
import { describeError, type WorkerLog } from "./protokoll";

const ACTIVE = new Set(["queued", "running", "waiting_approval"]);

export interface RunHandlerDeps {
  db: Database;
  executeRun: typeof executeRunFn;
  /** Liefert die Abhängigkeiten für einen Lauf (lädt z. B. den aktuellen Signaturschlüssel). */
  prepareRunDeps(): Promise<RunDeps>;
  log: WorkerLog;
  secrets: readonly string[];
  now?: () => number;
}

/** Ein Lauf, der gerade bearbeitet wird. */
export interface ActiveRun {
  runId: RunId;
  startedAt: number;
}

export interface RunHandler {
  handler: RunJobHandler;
  active(): ActiveRun[];
  /** Löst bei allen laufenden Läufen das Abbruch-Signal aus. */
  abortAll(reason: string): number;
  /** Wartet, bis kein Lauf mehr bearbeitet wird. */
  idle(): Promise<void>;
}

/**
 * Setzt einen Lauf auf `failed` mit `code`, beendet seine offenen Werkzeug-Aufrufe und seine
 * streamende Antwort und hängt das Ereignis `run.failed` an, alles in einer Transaktion. Ist der Lauf schon beendet oder gehört er zu einer anderen Unterhaltung,
 * bleibt alles, wie es ist. Liefert, ob der Lauf jetzt als fehlgeschlagen gilt.
 */
export async function failRun(
  db: Database,
  job: RunJob,
  code: ErrorCode,
  log: WorkerLog,
): Promise<boolean> {
  const run = await repo.runs.get(db, job.runId);
  if (run === undefined) {
    log.warn(`Lauf ${job.runId} nicht gefunden, Auftrag verworfen.`);
    return false;
  }
  if (run.conversationId !== job.conversationId) {
    log.warn(`Lauf ${job.runId} gehört zu einer anderen Unterhaltung, Auftrag verworfen.`);
    return false;
  }
  if (!ACTIVE.has(run.status)) {
    log.info(`Lauf ${job.runId} ist schon beendet (${run.status}).`);
    return false;
  }
  try {
    await repo.withTransaction(db, async (tx) => {
      await repo.runs.finish(tx, job.runId, { status: "failed", errorCode: code });
      // Offene Werkzeug-Aufrufe und eine streamende Antwort enden mit dem Lauf.
      await closeOpenRunWork(tx, run, code);
      await repo.events.append(tx, {
        conversationId: run.conversationId,
        type: "run.failed",
        data: { runId: job.runId, code, text: errorText(code) },
      });
    });
  } catch (error) {
    if (error instanceof repo.StatuswechselError) {
      log.info(`Lauf ${job.runId} wurde inzwischen beendet.`);
      return false;
    }
    throw error;
  }
  return true;
}

/**
 * Baut den Handler für die Warteschlange. Er wirft nie: Jeder Ausgang landet in `runs`, als
 * Ereignis und im Log, damit die Warteschlange den Auftrag abschließt und nichts wiederholt.
 */
export function createRunHandler(deps: RunHandlerDeps): RunHandler {
  const now = deps.now ?? Date.now;
  const running = new Map<RunId, { controller: AbortController; startedAt: number }>();
  let waiters: (() => void)[] = [];

  function release(runId: RunId): void {
    running.delete(runId);
    if (running.size === 0) {
      const list = waiters;
      waiters = [];
      for (const resolve of list) resolve();
    }
  }

  async function failSafely(job: RunJob, code: ErrorCode): Promise<void> {
    try {
      if (await failRun(deps.db, job, code, deps.log)) {
        deps.log.info(`Lauf ${job.runId} als fehlgeschlagen markiert (${code}).`);
      }
    } catch (error) {
      deps.log.error(
        `Lauf ${job.runId} konnte nicht als fehlgeschlagen markiert werden: ${describeError(error, deps.secrets)}`,
      );
    }
  }

  const handler: RunJobHandler = async (job, signal) => {
    const controller = new AbortController();
    const startedAt = now();
    running.set(job.runId, { controller, startedAt });
    deps.log.info(`Lauf ${job.runId} angenommen.`);
    try {
      const runDeps = await deps.prepareRunDeps();
      const outcome = await deps.executeRun(
        job.runId,
        runDeps,
        AbortSignal.any([signal, controller.signal]),
      );
      const code = outcome.code === undefined ? "" : ` (${outcome.code})`;
      deps.log.info(
        `Lauf ${job.runId} beendet: ${outcome.status}${code}, ${now() - startedAt} ms.`,
      );
    } catch (error) {
      deps.log.error(`Lauf ${job.runId} gescheitert: ${describeError(error, deps.secrets)}`);
      await failSafely(job, "intern");
    } finally {
      release(job.runId);
    }
  };

  return {
    handler,
    active: () => [...running].map(([runId, { startedAt }]) => ({ runId, startedAt })),
    abortAll(reason) {
      for (const { controller } of running.values()) controller.abort(new Error(reason));
      return running.size;
    },
    idle: () =>
      running.size === 0 ? Promise.resolve() : new Promise((resolve) => waiters.push(resolve)),
  };
}
