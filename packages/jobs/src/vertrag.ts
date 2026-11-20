/**
 * PaiBot – Vertrag der Warteschlange für Läufe: Auftrag, feste Einstellungen und Schnittstelle.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { idSchema } from "@paibot/shared/ids";
import { z } from "zod";

/** Auftrag für einen Lauf. */
export const runJobSchema = z.strictObject({
  runId: idSchema("run"),
  conversationId: idSchema("conversation"),
});
export type RunJob = z.infer<typeof runJobSchema>;

/** Einstellungen der Warteschlange `run`. */
export const RUN_QUEUE = {
  name: "run",
  /** Ein Lauf pro Unterhaltung gleichzeitig, Reihenfolge bleibt (Schlüssel = `conversationId`). */
  policy: "key_strict_fifo",
  /** Keine Wiederholung: eine Modell-Antwort darf nicht doppelt entstehen. */
  retryLimit: 0,
  expireInSeconds: 600,
  /**
   * Herzschlag des Workers (kleinster Wert der Bibliothek). Bleibt er aus, weil der Worker
   * abgestürzt ist, gilt der Auftrag nach dieser Zeit als fehlgeschlagen und gibt die
   * Unterhaltung frei, statt bis `expireInSeconds` zu warten.
   */
  heartbeatSeconds: 10,
  /** Wecken über LISTEN/NOTIFY; Abfragen in Abständen bleibt als Rückfall. */
  notify: true,
} as const;

/**
 * Wie oft die Warteschlange abgelaufene Aufträge und ausgebliebene Herzschläge prüft und wie oft
 * fehlgeschlagene Aufträge freigegeben werden. Zusammen mit `RUN_QUEUE.heartbeatSeconds` ist eine
 * Unterhaltung nach einem Absturz des Workers spätestens nach etwa 30 s wieder frei.
 */
export const QUEUE_SUPERVISION = {
  monitorIntervalSeconds: 10,
  superviseIntervalSeconds: 10,
  releaseIntervalSeconds: 10,
} as const;

/** Schema der Warteschlange in Postgres. */
export const QUEUE_SCHEMA = "pgboss";

/**
 * Führt SQL auf einer bestehenden Verbindung bzw. Transaktion aus. So landet `enqueueRun` in
 * derselben Transaktion wie Nachricht, Lauf und Ereignisse.
 */
export interface SqlExecutor {
  executeSql(text: string, values?: unknown[]): Promise<{ rows: unknown[] }>;
}

export interface EnqueueOptions {
  /** Transaktion, in der der Auftrag angelegt wird. Ohne Angabe eine eigene Verbindung. */
  executor?: SqlExecutor;
}

/**
 * Bearbeitet einen Auftrag. `signal` wird ausgelöst, wenn die Warteschlange beendet wird oder der
 * Auftrag abläuft. Ein geworfener Fehler markiert den Auftrag als fehlgeschlagen, ohne Wiederholung.
 */
export type RunJobHandler = (job: RunJob, signal: AbortSignal) => Promise<void>;

export interface RunWorkerOptions {
  /** Wie viele Läufe gleichzeitig (über verschiedene Unterhaltungen). */
  concurrency: number;
}

export interface QueueOptions {
  /** Höchstzahl der Verbindungen der Warteschlange. */
  maxConnections?: number;
}

export interface Queue {
  /** Verbindet, legt Schema und Warteschlange `run` an, falls nötig. Mehrfacher Aufruf ist harmlos. */
  start(): Promise<void>;
  /**
   * Stellt einen Lauf ein. Eingabe wird mit `runJobSchema` geprüft (`PaiBotError("eingabe_ungueltig")`).
   * Liefert die ID des Auftrags.
   */
  enqueueRun(job: RunJob, options?: EnqueueOptions): Promise<string>;
  /** Startet die Bearbeitung im Worker. Nur einmal pro Queue. */
  startRunWorker(handler: RunJobHandler, options: RunWorkerOptions): Promise<void>;
  /**
   * Beendet die Warteschlange: nimmt keine neuen Aufträge an, wartet bis `timeoutMs` auf laufende
   * Handler (deren `signal` dann ausgelöst wird) und schließt die Verbindungen.
   */
  stop(options?: { timeoutMs?: number }): Promise<void>;
}
