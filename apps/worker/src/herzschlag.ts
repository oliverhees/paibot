/**
 * PaiBot – Herzschlag des Workers: schreibt in festen Abständen eine Datei, solange die Prüfung
 * gelingt. Der Healthcheck des Containers liest ihre Änderungszeit.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { rm, writeFile } from "node:fs/promises";
import { describeError, type WorkerLog } from "./protokoll";

export interface HeartbeatOptions {
  file: string;
  intervalMs: number;
  /** Wie lange die Prüfung höchstens dauern darf; länger gilt als „hängt“. */
  probeTimeoutMs: number;
  /** Prüft, ob der Worker arbeiten kann (Datenbank antwortet, kein Lauf hängt). Wirft sonst. */
  probe(): Promise<void>;
  log: WorkerLog;
  /** Werte, die nie im Log erscheinen dürfen (Passwörter aus Adressen, Schlüssel). */
  secrets: readonly string[];
  /** Schreibt die Datei; in Tests ersetzbar. */
  write?: (file: string, content: string) => Promise<void>;
  /** Entfernt die Datei beim Beenden; in Tests ersetzbar. */
  remove?: (file: string) => Promise<void>;
}

export interface Heartbeat {
  /** Anzahl der geschriebenen Herzschläge. */
  beats(): number;
  /** Hält an und entfernt die Datei, damit der Healthcheck danach fehlschlägt. */
  stop(): Promise<void>;
}

class ProbeTimeout extends Error {
  constructor() {
    super("Prüfung hat nicht rechtzeitig geantwortet");
    this.name = "ProbeTimeout";
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new ProbeTimeout()), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * Startet den Herzschlag: sofort ein erster Schlag, danach alle `intervalMs`. Ein Schlag wird nur
 * geschrieben, wenn `probe` rechtzeitig gelingt. Hängt eine frühere Prüfung noch, fällt der
 * Schlag aus. Wechsel zwischen „gesund“ und „ausgesetzt“ stehen je einmal im Log.
 */
export function startHeartbeat(options: HeartbeatOptions): Heartbeat {
  const write = options.write ?? ((file, content) => writeFile(file, content, "utf8"));
  const remove = options.remove ?? ((file) => rm(file, { force: true }));
  let beats = 0;
  let running = false;
  let stopped = false;
  let healthy: boolean | undefined;

  function report(ok: boolean, reason?: string): void {
    if (healthy === ok) return;
    healthy = ok;
    if (ok) options.log.info("Herzschlag läuft.");
    else options.log.warn(`Herzschlag ausgesetzt: ${reason ?? "unbekannt"}.`);
  }

  async function tick(): Promise<void> {
    if (stopped) return;
    if (running) {
      report(false, "die vorige Prüfung hängt noch");
      return;
    }
    running = true;
    try {
      await withTimeout(options.probe(), options.probeTimeoutMs);
      if (stopped) return;
      await write(options.file, `${Math.floor(Date.now() / 1000)}\n`);
      beats += 1;
      report(true);
    } catch (error) {
      if (error instanceof ProbeTimeout) report(false, "die Prüfung antwortet nicht");
      else report(false, describeError(error, options.secrets));
    } finally {
      running = false;
    }
  }

  void tick();
  const timer = setInterval(() => void tick(), options.intervalMs);
  timer.unref();

  return {
    beats: () => beats,
    async stop() {
      if (stopped) return;
      stopped = true;
      clearInterval(timer);
      await remove(options.file).catch(() => undefined);
    },
  };
}
