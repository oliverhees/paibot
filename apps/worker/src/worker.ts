/**
 * PaiBot – Rolle worker: Migrationen abwarten, Warteschlange starten, Läufe ausführen, sauber enden.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { notImplemented } from "@paibot/stub";

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
  return notImplemented("worker.loadWorkerConfig", env);
}

/** Laufender Worker. */
export interface RunningWorker {
  /** Nimmt keine neuen Läufe an, wartet auf laufende (höchstens `shutdownTimeoutMs`), schließt alles. */
  stop(): Promise<void>;
}

/**
 * Startet den Worker:
 * 1. Migrationen abwarten bzw. selbst ausführen (unter derselben Sperre wie die Web-App).
 * 2. Hängende Läufe aufräumen (`failStaleRuns`).
 * 3. Warteschlange starten und `executeRun` als Handler anmelden.
 * 4. Herzschlag in die Health-Datei schreiben, solange er läuft.
 */
export function startWorker(
  config: WorkerConfig,
  env: Readonly<Record<string, string | undefined>>,
): Promise<RunningWorker> {
  return notImplemented("worker.startWorker", config, env);
}
