/**
 * PaiBot – Wächter eines laufenden Laufs: Herzschlag, Abbruch-Wunsch aus der Datenbank,
 * Zeitgrenzen. Er hält den Motor über ein eigenes Signal an.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { type Database, repo } from "@paibot/db";
import type { Clock } from "@paibot/gate";
import type { RunId } from "@paibot/shared/ids";
import type { RunTuning } from "./vertrag";

/**
 * Warum der Lauf angehalten wurde:
 * - `signal`: Abbruch von außen (Stopp, Ende des Workers);
 * - `abbruch`: Abbruch-Wunsch in der Datenbank (`runs.cancel_requested_at`);
 * - `verloren`: der Lauf ist nicht mehr `running` (z. B. von `failStaleRuns` beendet);
 * - `zeitgrenze`, `leerlauf`: Gesamtdauer bzw. Pause des Motors überschritten;
 * - `zu_gross`: die Antwort ist länger als erlaubt;
 * - `not_aus`: der Besitzer hat alle Bots angehalten (`settings.kill_switch`);
 * - `datenbank`: Lauf und Not-Aus ließen sich mehrmals in Folge nicht lesen (oder das Lesen
 *   hing). Ohne diese Angaben kann der Lauf weder Stopp noch Not-Aus sehen; er hält deshalb an.
 */
export type StopReason =
  | "signal"
  | "abbruch"
  | "verloren"
  | "zeitgrenze"
  | "leerlauf"
  | "zu_gross"
  | "not_aus"
  | "datenbank";

export interface RunGuard {
  /** Endet, sobald der Lauf angehalten werden soll (auch bei Abbruch von außen). */
  readonly signal: AbortSignal;
  /** Erster Grund, aus dem angehalten wurde. */
  readonly reason: StopReason | undefined;
  stop(reason: StopReason): void;
  /** Der Motor hat sich gemeldet: die Leerlauf-Grenze beginnt neu. */
  touch(): void;
  /** Leerlauf-Grenze an (während der Motor läuft) oder aus. */
  watchIdle(on: boolean): void;
  /** Hält alle Zeitgeber an. */
  dispose(): void;
}

/** So oft in Folge darf das Nachsehen scheitern, bevor der Lauf anhält. */
export const GUARD_READ_FAILURES = 3;
/** So lange darf ein einzelnes Nachsehen dauern (mindestens), danach gilt es als gescheitert. */
export const GUARD_READ_TIMEOUT_MS = 5000;

/**
 * Startet den Wächter. Ein gescheiterter Herzschlag wird nicht weitergegeben (das Nachsehen
 * im selben Takt merkt einen Ausfall). Scheitert das Nachsehen von Lauf und Not-Aus
 * `GUARD_READ_FAILURES`-mal in Folge oder hängt es länger als `GUARD_READ_TIMEOUT_MS`
 * (bzw. drei Takte, wenn das länger ist), hält der Lauf mit Grund `datenbank` an: Er arbeitet nie
 * weiter, ohne Stopp und Not-Aus sehen zu können.
 */
export function startGuard(input: {
  db: Database;
  runId: RunId;
  clock: Clock;
  tuning: RunTuning;
  outer: AbortSignal;
}): RunGuard {
  const { db, runId, clock, tuning, outer } = input;
  const controller = new AbortController();
  let reason: StopReason | undefined;
  let idle: ReturnType<typeof setTimeout> | undefined;
  let idleOn = false;
  let polling = false;
  let pollStartedAt = 0;
  let failures = 0;
  const readTimeoutMs = Math.max(GUARD_READ_TIMEOUT_MS, 3 * tuning.cancelPollMs);

  const stop = (why: StopReason) => {
    if (reason !== undefined) return;
    reason = why;
    controller.abort(new Error(why));
  };
  const onOuter = () => stop("signal");
  if (outer.aborted) stop("signal");
  else outer.addEventListener("abort", onOuter, { once: true });

  const total = setTimeout(() => stop("zeitgrenze"), tuning.totalTimeoutMs);
  const heartbeat = setInterval(() => {
    repo.runs
      .heartbeat(db, runId, { now: clock.now() })
      .then((alive) => {
        if (!alive) stop("verloren");
      })
      .catch(() => undefined);
  }, tuning.heartbeatMs);
  const poll = setInterval(() => {
    if (reason !== undefined) return;
    if (polling) {
      if (Date.now() - pollStartedAt > readTimeoutMs) stop("datenbank");
      return;
    }
    polling = true;
    pollStartedAt = Date.now();
    // Lauf und Not-Aus im selben Takt: Schaltet der Besitzer den Not-Aus ein, endet der Lauf
    // binnen `cancelPollMs`, auch mitten im Strom.
    Promise.all([repo.runs.get(db, runId), repo.settings.get(db)])
      .then(([run, settings]) => {
        failures = 0;
        if (run === undefined || run.status !== "running") stop("verloren");
        else if (settings?.killSwitch === true) stop("not_aus");
        else if (run.cancelRequestedAt !== undefined) stop("abbruch");
      })
      .catch(() => {
        failures += 1;
        if (failures >= GUARD_READ_FAILURES) stop("datenbank");
      })
      .finally(() => {
        polling = false;
      });
  }, tuning.cancelPollMs);
  for (const timer of [total, heartbeat, poll]) timer.unref?.();

  const armIdle = () => {
    if (idle !== undefined) clearTimeout(idle);
    idle = idleOn ? setTimeout(() => stop("leerlauf"), tuning.idleTimeoutMs) : undefined;
    idle?.unref?.();
  };

  return {
    signal: controller.signal,
    get reason() {
      return reason;
    },
    stop,
    touch: armIdle,
    watchIdle(on) {
      idleOn = on;
      armIdle();
    },
    dispose() {
      clearTimeout(total);
      clearInterval(heartbeat);
      clearInterval(poll);
      if (idle !== undefined) clearTimeout(idle);
      outer.removeEventListener("abort", onOuter);
    },
  };
}
