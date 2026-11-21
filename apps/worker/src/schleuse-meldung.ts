/**
 * PaiBot – Zustand der Datenschleuse melden: Der Worker hängt im Netz der Datenschleuse, prüft sie
 * beim Start und danach in festen Abständen und schreibt das Ergebnis in die Datenbank. Die Web-App
 * hat keinen Netz-Weg zur Datenschleuse und liest nur diesen Zustand.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { type Database, repo, type SchleuseZustandWert } from "@paibot/db";
import { probeSchleuse, schleuseFromEnv } from "@paibot/llm";
import { describeError, type WorkerLog } from "./protokoll";

type Env = Readonly<Record<string, string | undefined>>;

/** Prüfen und Festhalten; im Betrieb `realSchleuseCheck()`, in Tests ersetzbar. */
export interface SchleuseCheck {
  /** Prüft die Datenschleuse aus den Einstellungen des Workers. Wirft nie. */
  check(env: Env): Promise<SchleuseZustandWert>;
  /** Hält den Zustand in der Datenbank fest. */
  report(db: Database, state: SchleuseZustandWert, now: Date): Promise<void>;
}

/** Echte Prüfung (`probeSchleuse`: Lebenszeichen, dann Schlüssel) und Meldung über `repo.schleuse`. */
export function realSchleuseCheck(): SchleuseCheck {
  return {
    async check(env) {
      // schleuseFromEnv wirft bei ungültigen Werten; das prüft schon der Start des Workers.
      let connection: ReturnType<typeof schleuseFromEnv>;
      try {
        connection = schleuseFromEnv(env);
      } catch {
        return "nicht_erreichbar";
      }
      return (await probeSchleuse(connection)).state;
    },
    async report(db, state, now) {
      await repo.schleuse.report(db, { state, now });
    },
  };
}

export interface SchleuseMeldungOptions {
  db: Database;
  env: Env;
  check: SchleuseCheck;
  intervalMs: number;
  log: WorkerLog;
  /** Werte, die nie im Log erscheinen dürfen. */
  secrets: readonly string[];
  clock?: () => Date;
}

export interface SchleuseMeldung {
  /** Anzahl der geschriebenen Meldungen. */
  reports(): number;
  /** Zuletzt gemeldeter Zustand. */
  last(): SchleuseZustandWert | undefined;
  /** Hält an; eine laufende Prüfung wird nicht mehr gemeldet. */
  stop(): void;
}

/**
 * Prüft sofort einmal (das Ergebnis steht, wenn das Versprechen erfüllt ist) und danach alle
 * `intervalMs`. Eine Prüfung, die noch läuft, wird nicht doppelt gestartet. Ins Log kommt nur ein
 * Wechsel des Zustands (feste Wörter, keine Meldungen der Datenschleuse); ein Fehler beim Schreiben
 * steht im Log, hält den Worker aber nicht an.
 */
export async function startSchleuseMeldung(
  options: SchleuseMeldungOptions,
): Promise<SchleuseMeldung> {
  const clock = options.clock ?? (() => new Date());
  let reports = 0;
  let last: SchleuseZustandWert | undefined;
  let running = false;
  let stopped = false;
  let writeFailed = false;

  async function tick(): Promise<void> {
    if (stopped || running) return;
    running = true;
    try {
      const state = await options.check.check(options.env);
      if (stopped) return;
      await options.check.report(options.db, state, clock());
      reports += 1;
      if (writeFailed) options.log.info("Zustand der Datenschleuse wird wieder gemeldet.");
      writeFailed = false;
      if (state !== last) options.log.info(`Datenschleuse: ${state}.`);
      last = state;
    } catch (error) {
      if (!writeFailed) {
        options.log.warn(
          `Zustand der Datenschleuse nicht gemeldet: ${describeError(error, options.secrets)}`,
        );
      }
      writeFailed = true;
    } finally {
      running = false;
    }
  }

  await tick();
  const timer = setInterval(() => void tick(), options.intervalMs);
  timer.unref();

  return {
    reports: () => reports,
    last: () => last,
    stop() {
      stopped = true;
      clearInterval(timer);
    },
  };
}
