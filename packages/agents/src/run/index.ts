/**
 * PaiBot – Steuerung eines Laufs: Kontext laden, Tor fragen, Modell-Zugang holen, Motor laufen
 * lassen, Ereignisse, Nachricht und Belege schreiben.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { DerivedKey } from "@paibot/crypto";
import type { Database } from "@paibot/db";
import type { Clock, Gate } from "@paibot/gate";
import type { SchleuseConnection, SchleuseStatus } from "@paibot/llm";
import type { ErrorCode } from "@paibot/shared/fehler";
import type { MessageId, RunId } from "@paibot/shared/ids";
import type { Motor } from "@paibot/shared/motor";
import type { RunStatus } from "@paibot/shared/objekte";
import { notImplemented } from "@paibot/stub";

/** Stellschrauben eines Laufs. */
export interface RunTuning {
  /** Text-Stücke werden höchstens so lange gesammelt, bevor ein Ereignis `text.delta` entsteht. */
  deltaFlushMs: number;
  /** … oder bis so viele Zeichen beisammen sind. */
  deltaFlushChars: number;
  /** Ein Lauf ohne Herzschlag seit so vielen Millisekunden gilt als abgebrochen. */
  staleAfterMs: number;
}

export const RUN_TUNING: RunTuning = {
  deltaFlushMs: 50,
  deltaFlushChars: 200,
  staleAfterMs: 60000,
};

/** Was ein Lauf braucht. Alles von außen, damit Tests es ersetzen können. */
export interface RunDeps {
  db: Database;
  gate: Gate;
  motor: Motor;
  clock: Clock;
  keys: { secrets: DerivedKey<"secrets-v1">; context: DerivedKey<"context-v1"> };
  /** Verbindung zur Datenschleuse, wenn installiert. */
  schleuse?: SchleuseConnection;
  /** Aktueller Zustand der Datenschleuse (installiert, erreichbar). */
  schleuseStatus(): Promise<SchleuseStatus>;
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

/**
 * Führt einen Lauf aus, der in der Warteschlange stand.
 *
 * 1. Lauf auf `running`, Ereignis `run.started`, Herzschlag in `runs.heartbeat_at`.
 * 2. Kontext: Anweisung (`buildSystemPrompt`), letzte Nachrichten bis zur Verlaufsgrenze,
 *    Schleusen-Modus (Nachricht → Unterhaltung → Standard), Route.
 * 3. Tor: Aktion `modell.anfragen` (Akteur `bot:<id>`) über `gate.run` mit Kontext-Prüfsumme; nur in
 *    `execute` wird mit der Berechtigung `resolveModel` aufgerufen und der Motor gestartet.
 * 4. Motor-Ereignisse: `text-delta` gebündelt nach `RunTuning` als `text.delta`; `finish` →
 *    Nachricht `assistant` speichern, `message.completed`, Lauf `succeeded`.
 * 5. Fehlerwege, jeweils mit Beleg „Ergebnis“ über das Tor: Abbruch (`runs.cancel_requested_at`
 *    oder `signal`) → `run.cancelled`, Teiltext bleibt als `cancelled`; Datenschleuse gefordert,
 *    aber nicht nutzbar → `schleuse.blockiert` und `run.denied`, nie direkt; Tor lehnt ab →
 *    `run.denied` mit Grund; Motor-Fehler → `run.failed` mit Code.
 *
 * Zusagen: wirft nur bei Fehlern der Datenbank; jeder andere Ausgang steht in `RunOutcome`, in
 * `runs` und als Ereignis. Werkzeug-Aufrufe (später) gehen einzeln durch `gate.run`; der Motor führt
 * nie selbst etwas aus.
 */
export function executeRun(runId: RunId, deps: RunDeps, signal: AbortSignal): Promise<RunOutcome> {
  return notImplemented("agents.executeRun", runId, deps, signal);
}

/**
 * Sucht Läufe in `running`, deren Herzschlag älter als `staleAfterMs` ist, setzt sie auf `failed`
 * mit Code `unterbrochen` und schreibt Ereignis `run.failed` und Beleg „Ergebnis“. Für den Start
 * des Workers. Liefert die betroffenen Läufe.
 */
export function failStaleRuns(
  deps: Pick<RunDeps, "db" | "clock">,
  options?: { staleAfterMs?: number },
): Promise<RunId[]> {
  return notImplemented("agents.failStaleRuns", deps, options);
}
