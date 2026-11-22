/**
 * PaiBot – Ausführung eines Laufs: aus der Nachricht der Person wird die Antwort des Bots.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { type Database, repo } from "@paibot/db";
import type { ErrorCode } from "@paibot/shared/fehler";
import type { RunId } from "@paibot/shared/ids";
import type { Run } from "@paibot/shared/objekte";
import { errorText } from "@paibot/shared/texte";
import { loadRunContext } from "./kontext";
import { closeRun, runLoop, type StepEnd } from "./schleife";
import { RunDatabaseError, write } from "./strom";
import { RUN_TUNING, type RunDeps, type RunOutcome, type RunTuning } from "./vertrag";
import { startGuard } from "./waechter";

/**
 * Führt einen Lauf aus, der in der Warteschlange stand.
 *
 * 1. Lauf, Unterhaltung, Bot, Einstellungen, Modell, Anbieter, Verlauf und Tagesverbrauch in einem
 *    Lesestand laden (`loadRunContext`). Steht der Lauf nicht mehr in `queued`, passiert nichts.
 *    War schon ein Abbruch gewünscht, endet er als `cancelled`, ohne das Modell zu fragen.
 * 2. Lauf auf `running`, Ereignis `run.started`; ab jetzt Herzschlag und Nachsehen nach einem
 *    Abbruch-Wunsch (`startGuard`).
 * 3. Ohne Modell endet der Lauf mit `kein_modell`. Sonst die Schritt-Schleife (`runLoop`): je
 *    Schritt Weg (Datenschleuse laut Unterhaltung, sonst Standard), Anweisung (`buildSystemPrompt`),
 *    Verlauf bis zur Grenze, Fakten der Aktion `modell.anfragen` nur aus der Datenbank und den
 *    Nahtstellen (`schrittFakten`).
 * 4. Je Schritt das Tor (`gate.run`, Akteur `bot:<id>`, Kontext-Prüfsumme der Anfrage). Nur in
 *    `execute` entsteht mit der Berechtigung der Modell-Zugang (`resolveModel`), und dort läuft
 *    der Schritt des Motors. Ohne angebotene Werkzeuge wie bisher: Text-Stücke gebündelt als
 *    `text.delta`, am Ende Nachricht `assistant` mit Modell, Weg und Token (`message.completed`).
 *    Mit Werkzeugen: nur `draft.delta`, die Nachricht entsteht am Schritt-Ende; jeder Wunsch geht
 *    danach einzeln durchs Tor (`werkzeug.aufrufen`). Der Beleg „Ergebnis“ trägt Status, Token und
 *    die Prüfsumme der Antwort, nie Inhalte.
 * 5. Danach Lauf beenden: `succeeded`; `cancelled` mit `run.cancelled` (Teiltext bleibt als
 *    `cancelled`); `failed` mit `run.failed` (und `schleuse.blockiert`, wenn die Datenschleuse
 *    stoppte); Ablehnung des Tors → `denied` mit `run.denied` (bei geforderter, aber nicht
 *    nutzbarer Datenschleuse zuvor `schleuse.blockiert`) – ohne Abruf beim Anbieter. Nie ein
 *    Rückfall auf den direkten Weg, nie ein automatisches Wiederholen.
 *
 * Sperr-Reihenfolge: Die Steuerung hält nie eine Transaktion offen, während sie das Tor aufruft.
 * Jeder Schreibvorgang auf der Unterhaltung (Ereignisse, Nachrichten) ist eine eigene kurze
 * Transaktion, die vor dem nächsten Aufruf des Tors bestätigt ist. Der Beleg-Schreiber nimmt so
 * immer zuerst die Beleg-Sperre und erst dann die Zeile der Unterhaltung.
 *
 * Zusagen: wirft nur bei Fehlern der Datenbank; jeder andere Ausgang steht in `RunOutcome`, in
 * `runs` und als Ereignis. Ein Werkzeug läuft nur nach dem Beleg „Entscheidung: erlaubt“. Wünscht
 * das Modell ein Werkzeug, obwohl keines angeboten war, wird jeder Wunsch belegt abgelehnt (V-12),
 * und der Lauf endet mit `werkzeug_unbekannt`.
 */
export async function executeRun(
  runId: RunId,
  deps: RunDeps,
  signal: AbortSignal,
): Promise<RunOutcome> {
  try {
    return await runSteps(runId, deps, signal);
  } catch (error) {
    throw error instanceof RunDatabaseError ? error.cause : error;
  }
}

async function runSteps(runId: RunId, deps: RunDeps, signal: AbortSignal): Promise<RunOutcome> {
  const tuning: RunTuning = { ...RUN_TUNING, ...deps.tuning };
  const { db, clock } = deps;

  const loaded = await loadRunContext(db, runId, {
    now: clock.now(),
    historyMaxMessages: tuning.historyMaxMessages,
  });
  if (!loaded.found) return { runId, status: "failed", code: "nicht_gefunden" };
  if (loaded.run.status !== "queued") return untouched(loaded.run);
  if ("missing" in loaded) {
    const failed = await finishRun(
      db,
      loaded.run,
      { kind: "failed", code: loaded.missing },
      clock.now(),
    );
    return failed ?? current(db, runId);
  }
  const { context } = loaded;

  const conversationId = context.conversation.id;
  if (signal.aborted || context.run.cancelRequestedAt !== undefined) {
    const done = await finishRun(db, context.run, { kind: "cancelled" }, clock.now());
    return done ?? current(db, runId);
  }

  try {
    await write(() =>
      repo.withTransaction(db, async (tx) => {
        await repo.runs.markRunning(tx, runId, { now: clock.now() });
        await repo.events.append(tx, {
          conversationId,
          type: "run.started",
          data: { runId },
        });
      }),
    );
  } catch (error) {
    const cause = error instanceof RunDatabaseError ? error.cause : error;
    if (cause instanceof repo.StatuswechselError) return current(db, runId);
    throw error;
  }

  const guard = startGuard({ db, runId, clock, tuning, outer: signal });
  try {
    const end = await runLoop(context, deps, tuning, guard);
    if (end.end.kind === "lost") return current(db, runId);
    if (end.end.kind === "denied") return { runId, status: "denied", code: end.end.code };
    const finished = await finishRun(db, context.run, end.end, clock.now());
    if (finished === undefined) return current(db, runId);
    return { ...finished, ...(end.messageId === undefined ? {} : { messageId: end.messageId }) };
  } finally {
    guard.dispose();
  }
}

/** Ein Lauf, den diese Steuerung nicht anfasst, weil er nicht mehr wartet. */
function untouched(run: Run): RunOutcome {
  if (run.status === "queued" || run.status === "running" || run.status === "waiting_approval") {
    // Einen wartenden Lauf gibt es in dieser Fassung nicht (die Datenbank lässt ihn nicht zu).
    return { runId: run.id, status: "failed", code: "lauf_aktiv" };
  }
  return {
    runId: run.id,
    status: run.status,
    ...(run.errorCode === undefined ? {} : { code: run.errorCode }),
  };
}

function cancelled(runId: RunId, code: ErrorCode = "unterbrochen"): RunOutcome {
  return { runId, status: "cancelled", code };
}

async function current(db: Database, runId: RunId): Promise<RunOutcome> {
  const run = await repo.runs.get(db, runId);
  if (run === undefined) return { runId, status: "failed", code: "nicht_gefunden" };
  return untouched(run);
}

/**
 * Beendet den Lauf nach dem Schritt. `undefined`, wenn ein anderer ihn inzwischen beendet hat
 * (dann bleibt alles, wie es ist).
 */
async function finishRun(
  db: Database,
  run: Run,
  end: StepEnd,
  now: Date,
): Promise<RunOutcome | undefined> {
  const conversationId = run.conversationId;
  if (end.kind === "succeeded") {
    const done = await closeRun(db, run, "succeeded", undefined, async () => undefined, now);
    return done ? { runId: run.id, status: "succeeded" } : undefined;
  }
  if (end.kind === "cancelled") {
    const code = end.code ?? "unterbrochen";
    const done = await closeRun(
      db,
      run,
      "cancelled",
      code,
      async (tx) => {
        await repo.events.append(tx, {
          conversationId,
          type: "run.cancelled",
          data: { runId: run.id, code, text: errorText(code) },
        });
      },
      now,
    );
    return done ? cancelled(run.id, code) : undefined;
  }
  if (end.kind === "lost" || end.kind === "denied") return undefined;
  const code = end.code;
  const done = await closeRun(
    db,
    run,
    "failed",
    code,
    async (tx) => {
      if (code === "schleuse_blockiert") {
        await repo.events.append(tx, {
          conversationId,
          type: "schleuse.blockiert",
          data: { runId: run.id, reason: errorText("schleuse_blockiert") },
        });
      }
      await repo.events.append(tx, {
        conversationId,
        type: "run.failed",
        data: { runId: run.id, code, text: errorText(code) },
      });
    },
    now,
  );
  return done ? { runId: run.id, status: "failed", code } : undefined;
}
