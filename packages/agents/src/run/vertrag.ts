/**
 * PaiBot – Vertrag der Lauf-Steuerung: Stellschrauben, Abhängigkeiten und Ausgang eines Laufs.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { DerivedKey } from "@paibot/crypto";
import type { Database } from "@paibot/db";
import type { Clock, Gate, ReceiptWriter } from "@paibot/gate";
import type { SchleuseConnection, SchleuseHealthState, SchleuseStatus } from "@paibot/llm";
import type { ErrorCode } from "@paibot/shared/fehler";
import type { MessageId, RunId } from "@paibot/shared/ids";
import type { Motor } from "@paibot/shared/motor";
import type { RunStatus } from "@paibot/shared/objekte";

/** Stellschrauben eines Laufs. */
export interface RunTuning {
  /** Text-Stücke werden höchstens so lange gesammelt, bevor ein Ereignis `text.delta` entsteht. */
  deltaFlushMs: number;
  /** … oder bis so viele Zeichen beisammen sind. */
  deltaFlushChars: number;
  /** Ein Lauf ohne Herzschlag seit so vielen Millisekunden gilt als abgebrochen. */
  staleAfterMs: number;
  /** Ein Lauf, der so lange in der Warteschlange steht, ohne abgeholt zu werden, gilt als verloren. */
  queuedStaleAfterMs: number;
  /** Abstand des Herzschlags in `runs.heartbeat_at`. */
  heartbeatMs: number;
  /** Abstand, in dem die Steuerung nachsieht, ob ein Abbruch gewünscht ist. */
  cancelPollMs: number;
  /** Längste Dauer eines Laufs ab dem Start. */
  totalTimeoutMs: number;
  /** Längste Pause des Motors ohne Ereignis. */
  idleTimeoutMs: number;
  /** Längste Antwort in Zeichen; darüber endet der Lauf mit `limit_erreicht`. */
  maxAnswerChars: number;
  /** Höchstens so viele Nachrichten aus dem Verlauf gehen an das Modell. */
  historyMaxMessages: number;
  /** Höchstens so viele Zeichen (Anweisung plus Verlauf) gehen an das Modell. */
  maxRequestChars: number;
}

export const RUN_TUNING: RunTuning = {
  deltaFlushMs: 50,
  deltaFlushChars: 200,
  staleAfterMs: 60000,
  queuedStaleAfterMs: 900000,
  heartbeatMs: 10000,
  cancelPollMs: 500,
  totalTimeoutMs: 540000,
  idleTimeoutMs: 60000,
  maxAnswerChars: 200000,
  historyMaxMessages: 50,
  maxRequestChars: 120000,
};

/**
 * Schritt-Budget eines Laufs: so viele Modell-Schritte darf ein Lauf machen. In der Basis gibt es
 * keine Werkzeuge, also genau einen Schritt.
 */
export const MAX_MOTOR_STEPS = 1;

/**
 * Zustand der Datenschleuse für einen Lauf. `state` (aus `probeSchleuse`) sagt, warum sie nicht
 * bereit ist; fehlt er, zählt nur `reachable`.
 */
export interface RunSchleuseStatus extends SchleuseStatus {
  state?: SchleuseHealthState;
}

/** Was ein Lauf braucht. Alles von außen, damit Tests es ersetzen können. */
export interface RunDeps {
  db: Database;
  gate: Gate;
  motor: Motor;
  clock: Clock;
  keys: { secrets: DerivedKey<"secrets-v1">; context: DerivedKey<"context-v1"> };
  /** Verbindung zur Datenschleuse, wenn installiert. */
  schleuse?: SchleuseConnection;
  /** Aktueller Zustand der Datenschleuse (installiert, erreichbar; im Betrieb `readSchleuseStatus`). */
  schleuseStatus(): Promise<RunSchleuseStatus>;
  /**
   * Beleg-Schreiber des Tors. Nur `failStaleRuns` braucht ihn direkt: Es schreibt für einen
   * hängenden Lauf das fehlende Ergebnis zur schon belegten Entscheidung.
   */
  receipts?: ReceiptWriter;
  tuning?: Partial<RunTuning>;
}

/** Endzustände eines Laufs. */
export type FinalRunStatus = Extract<
  RunStatus,
  "succeeded" | "failed" | "cancelled" | "denied" | "waiting_approval"
>;

export interface RunOutcome {
  runId: RunId;
  status: FinalRunStatus;
  /** Antwort des Bots, auch bei Abbruch mit dem Teiltext. */
  messageId?: MessageId;
  code?: ErrorCode;
}
