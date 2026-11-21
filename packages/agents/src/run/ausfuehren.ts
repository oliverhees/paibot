/**
 * PaiBot – Ausführung eines Laufs: aus der Nachricht der Person wird die Antwort des Bots.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { contextDigest } from "@paibot/crypto";
import { type Database, repo } from "@paibot/db";
import { type GateDenied, isGateDenied } from "@paibot/gate";
import { resolveModel } from "@paibot/llm/modell";
import { type ActionRequest, botActor } from "@paibot/shared/aktionen";
import type { ReceiptResult } from "@paibot/shared/belege";
import { type ErrorCode, isPaiBotError } from "@paibot/shared/fehler";
import type { ServedBy } from "@paibot/shared/grundtypen";
import { type MessageId, newId, type RunId } from "@paibot/shared/ids";
import type { MotorErrorCode, MotorEvent, ResolvedModel, TurnInput } from "@paibot/shared/motor";
import type { Run } from "@paibot/shared/objekte";
import { errorText } from "@paibot/shared/texte";
import { buildSystemPrompt } from "../prompt";
import {
  buildHistory,
  chooseRoute,
  loadRunContext,
  modelChoice,
  modelFacts,
  type RunContext,
  requestChars,
  requestDigest,
} from "./kontext";
import { type AnswerStream, createAnswerStream, RunDatabaseError, write } from "./strom";
import {
  type FinalRunStatus,
  MAX_MOTOR_STEPS,
  RUN_TUNING,
  type RunDeps,
  type RunOutcome,
  type RunTuning,
} from "./vertrag";
import { type RunGuard, type StopReason, startGuard } from "./waechter";

/** Zeichen pro Token, mit denen die Verlaufsgrenze der Einstellungen in Zeichen umgerechnet wird. */
const CHARS_PER_TOKEN = 4;

/** Text-Schlüssel-freier Code, mit dem ein Lauf endet, der ein Werkzeug wünscht, aber keines hat. */
const TOOL_WISH_CODE: ErrorCode = "abgelehnt";

type Ready = RunContext & Required<Pick<RunContext, "model" | "provider">>;

/** Wie der Modell-Schritt endete; das bestimmt Lauf, Nachricht, Ereignisse und Beleg. */
type StepEnd =
  | { kind: "succeeded"; tokens: { input: number; output: number }; servedBy?: ServedBy }
  /** Abgebrochen; `code` nur, wenn es nicht der Stopp des Besitzers war (z. B. Not-Aus). */
  | { kind: "cancelled"; code?: ErrorCode }
  | { kind: "lost" }
  | { kind: "failed"; code: ErrorCode }
  /** Das Tor hat abgelehnt; Lauf und Ereignisse sind schon geschrieben. */
  | { kind: "denied"; code: ErrorCode };

interface StepValue {
  end: StepEnd;
  messageId?: MessageId;
}

/**
 * Führt einen Lauf aus, der in der Warteschlange stand.
 *
 * 1. Lauf, Unterhaltung, Bot, Einstellungen, Modell, Anbieter, Verlauf und Tagesverbrauch in einem
 *    Lesestand laden (`loadRunContext`). Steht der Lauf nicht mehr in `queued`, passiert nichts.
 *    War schon ein Abbruch gewünscht, endet er als `cancelled`, ohne das Modell zu fragen.
 * 2. Lauf auf `running`, Ereignis `run.started`; ab jetzt Herzschlag und Nachsehen nach einem
 *    Abbruch-Wunsch (`startGuard`).
 * 3. Ohne Modell endet der Lauf mit `kein_modell`. Sonst: Weg (Datenschleuse laut Unterhaltung,
 *    sonst Standard), Anweisung (`buildSystemPrompt`), Verlauf bis zur Grenze, Fakten der Aktion
 *    `modell.anfragen` nur aus der Datenbank.
 * 4. Tor (`gate.run`, Akteur `bot:<id>`, Kontext-Prüfsumme der Anfrage). Nur in `execute` entsteht
 *    mit der Berechtigung der Modell-Zugang (`resolveModel`), und dort läuft der ganze Schritt des
 *    Motors: Text-Stücke gebündelt als `text.delta`, am Ende Nachricht `assistant` mit Modell, Weg
 *    und Token (`message.completed`). Der Beleg „Ergebnis“ trägt Status, Token und die Prüfsumme
 *    der Antwort, nie Inhalte.
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
 * `runs` und als Ereignis. Der Motor bekommt keine Werkzeuge; wünscht das Modell trotzdem eines,
 * endet der Lauf mit `abgelehnt`, und nichts wird ausgeführt.
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
    const end = await askModel(context, deps, tuning, guard);
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
  if (run.status === "queued" || run.status === "running") {
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

/** Schritt 3 und 4: Kontext bauen, Tor fragen, Motor in `execute` laufen lassen. */
async function askModel(
  context: RunContext,
  deps: RunDeps,
  tuning: RunTuning,
  guard: RunGuard,
): Promise<StepValue> {
  if (!isReady(context)) return { end: { kind: "failed", code: "kein_modell" } };

  const schleuseStatus =
    (context.conversation.schleuseMode ?? context.settings.schleuseModeDefault) === "on"
      ? await deps.schleuseStatus()
      : { installed: deps.schleuse !== undefined, reachable: false };
  if (guard.reason !== undefined) return { end: stopEnd(guard.reason) };
  const route = chooseRoute(context.conversation, context.settings, schleuseStatus);

  const system = buildSystemPrompt(context.bot, context.settings, deps.clock.now());
  const historyLimit =
    context.settings.historyTokenLimit === undefined
      ? Number.POSITIVE_INFINITY
      : context.settings.historyTokenLimit * CHARS_PER_TOKEN;
  const history = buildHistory(
    context.messages,
    Math.min(tuning.maxRequestChars - system.length, historyLimit),
  );
  const facts = modelFacts({
    context,
    route,
    schleuse: deps.schleuse,
    inputChars: requestChars(system, history),
    maxInputChars: tuning.maxRequestChars,
  });
  const action: ActionRequest<"modell.anfragen"> = {
    actionId: newId("action"),
    type: "modell.anfragen",
    actor: botActor(context.run.botId),
    target: {
      conversationId: context.conversation.id,
      runId: context.run.id,
      botId: context.run.botId,
      modelId: context.model.id,
    },
  };
  const turn: Omit<TurnInput, "model"> = {
    system,
    history,
    limits: { maxOutputTokens: context.bot.maxOutputTokens, timeoutMs: tuning.totalTimeoutMs },
  };
  const choice = modelChoice(context);
  const digest = requestDigest(deps.keys.context, {
    system,
    history,
    modelId: context.model.id,
    route: route.route,
  });

  try {
    const { value } = await deps.gate.run(
      action,
      facts,
      async (permit) => {
        // Der Modell-Zugang entsteht nur hier und verlässt `execute` nie.
        const model = resolveModel(permit, choice, {
          secretsKey: deps.keys.secrets,
          ...(deps.schleuse === undefined ? {} : { schleuse: deps.schleuse }),
        });
        return runMotor(context as Ready, deps, tuning, guard, { ...turn, model });
      },
      { context: { digest: digest as `hmac-sha256:${string}` } },
    );
    return value;
  } catch (error) {
    if (error instanceof RunDatabaseError) throw error;
    if (isGateDenied(error)) {
      const code = await recordDenial(
        deps.db,
        context.run,
        error,
        facts.requestedMode === "on",
        schleuseStatus.state === "schluessel_falsch",
        deps.clock.now(),
      );
      return { end: code === undefined ? { kind: "lost" } : { kind: "denied", code } };
    }
    if (isPaiBotError(error)) {
      return { end: { kind: "failed", code: error.code } };
    }
    throw error;
  }
}

function isReady(context: RunContext): context is Ready {
  return (
    context.model?.enabled === true &&
    context.provider !== undefined &&
    context.provider.provider.id === context.model.providerId
  );
}

/**
 * Der Schritt des Motors innerhalb von `execute`. Abbruch, Zeitgrenzen und Größe kommen über den
 * Wächter; ein Werkzeug-Wunsch beendet den Schritt sofort, ausgeführt wird nichts.
 */
async function runMotor(
  context: Ready,
  deps: RunDeps,
  tuning: RunTuning,
  guard: RunGuard,
  input: TurnInput & { model: ResolvedModel },
): Promise<{ value: StepValue; result: ReceiptResult }> {
  const stream = createAnswerStream({
    db: deps.db,
    conversationId: context.conversation.id,
    runId: context.run.id,
    flushMs: tuning.deltaFlushMs,
    flushChars: tuning.deltaFlushChars,
  });
  let finish: Extract<MotorEvent, { type: "finish" }> | undefined;
  let failure: MotorErrorCode | undefined;
  let toolWish = false;

  try {
    for (let step = 0; step < MAX_MOTOR_STEPS; step++) {
      guard.watchIdle(true);
      try {
        for await (const event of deps.motor.runTurn(input, guard.signal)) {
          guard.touch();
          if (event.type === "text-delta") {
            if (stream.text.length + event.text.length > tuning.maxAnswerChars) {
              guard.stop("zu_gross");
              break;
            }
            await stream.push(event.text);
          } else if (event.type === "tool-call") {
            toolWish = true;
            break;
          } else if (event.type === "finish") {
            finish = event;
            if (event.finishReason === "tool-calls") toolWish = true;
          } else if (event.type === "error") {
            failure = event.code;
          }
          if (guard.signal.aborted) break;
        }
      } catch (error) {
        if (error instanceof RunDatabaseError) throw error;
        failure ??= "intern";
      } finally {
        guard.watchIdle(false);
      }
      if (!toolWish || failure !== undefined || guard.reason !== undefined) break;
      if (!continueWithTools()) break;
    }
    await stream.flush();
  } finally {
    stream.dispose();
  }

  const end: StepEnd =
    guard.reason !== undefined
      ? stopEnd(guard.reason)
      : failure !== undefined
        ? { kind: "failed", code: failure }
        : toolWish
          ? { kind: "failed", code: TOOL_WISH_CODE }
          : finish !== undefined
            ? {
                kind: "succeeded",
                tokens: { ...finish.usage },
                ...(finish.servedBy === undefined ? {} : { servedBy: { ...finish.servedBy } }),
              }
            : { kind: "failed", code: "unterbrochen" };

  const messageId = await saveAnswer(deps.db, context, stream, end, input.model);
  const value: StepValue = { end, ...(messageId === undefined ? {} : { messageId }) };
  return { value, result: receiptResult(end, stream.text, deps) };
}

/**
 * Stelle für die spätere Schleife über Werkzeug-Aufrufe: jeder Aufruf einzeln durch `gate.run`
 * (`werkzeug.aufrufen`), Ergebnisse als `role: "tool"` in den Verlauf, dann der nächste Schritt
 * bis `MAX_MOTOR_STEPS`, der letzte ohne Werkzeuge. In der Basis gibt der Motor keine Werkzeuge
 * heraus; ein Werkzeug-Wunsch beendet den Lauf, nichts wird ausgeführt.
 */
function continueWithTools(): boolean {
  return false;
}

function stopEnd(reason: StopReason): StepEnd {
  switch (reason) {
    case "signal":
    case "abbruch":
      return { kind: "cancelled" };
    case "not_aus":
      return { kind: "cancelled", code: "angehalten" };
    case "verloren":
      return { kind: "lost" };
    case "zeitgrenze":
    case "leerlauf":
      return { kind: "failed", code: "anbieter_nicht_erreichbar" };
    case "zu_gross":
      return { kind: "failed", code: "limit_erreicht" };
  }
}

/** Was in den Beleg „Ergebnis“ geht: Status, Code, Token, Prüfsumme der Antwort. Nie der Text. */
function receiptResult(end: StepEnd, text: string, deps: RunDeps): ReceiptResult {
  switch (end.kind) {
    case "succeeded":
      return {
        status: "ok",
        tokens: end.tokens,
        digest: contextDigest(deps.keys.context, text) as `hmac-sha256:${string}`,
        ...(end.servedBy === undefined ? {} : { servedBy: end.servedBy }),
      };
    case "cancelled":
    case "lost":
      return { status: "cancelled" };
    case "failed":
    case "denied":
      return { status: "error", code: end.code };
  }
}

/**
 * Speichert die Antwort: bei Erfolg als `complete` mit Modell, Weg und Token und Ereignis
 * `message.completed`; bei Abbruch bleibt der Teiltext als `cancelled`, bei Fehler als `failed`
 * mit Code. Ohne Text und ohne Erfolg entsteht keine Nachricht.
 */
async function saveAnswer(
  db: Database,
  context: Ready,
  stream: AnswerStream,
  end: StepEnd,
  model: ResolvedModel,
): Promise<MessageId | undefined> {
  if (end.kind !== "succeeded" && stream.messageId === undefined) return undefined;
  const messageId = await stream.ensureMessage();
  const conversationId = context.conversation.id;
  const base = {
    content: stream.text,
    modelId: context.model.id,
    providerId: context.provider.provider.id,
    route: model.route,
  };
  await write(() =>
    repo.withTransaction(db, async (tx) => {
      if (end.kind === "succeeded") {
        await repo.messages.finalize(tx, messageId, {
          ...base,
          status: "complete",
          tokensIn: end.tokens.input,
          tokensOut: end.tokens.output,
          ...(end.servedBy === undefined ? {} : { servedBy: end.servedBy }),
        });
        await repo.events.append(tx, {
          conversationId,
          type: "message.completed",
          data: {
            messageId,
            route: model.route,
            modelLabel: model.label,
            tokens: end.tokens,
            ...(end.servedBy === undefined ? {} : { servedBy: end.servedBy }),
          },
          runId: context.run.id,
        });
      } else if (end.kind === "failed") {
        await repo.messages.finalize(tx, messageId, {
          ...base,
          status: "failed",
          errorCode: end.code,
        });
      } else {
        await repo.messages.finalize(tx, messageId, {
          ...base,
          status: "cancelled",
          ...(end.kind === "cancelled" && end.code !== undefined ? { errorCode: end.code } : {}),
        });
      }
    }),
  );
  return messageId;
}

/**
 * Ablehnung durch das Tor: Lauf `denied`, Ereignis `run.denied`, bei Datenschleuse vorher
 * `schleuse.blockiert`. Lag es an der Datenschleuse und hat sie ihren Schlüssel abgelehnt, trägt
 * der Lauf den Code `schluessel_ungueltig` statt des Codes aus dem Tor, damit der Ausweg passt.
 * Liefert den Code des Laufs oder `undefined`, wenn der Lauf schon beendet war.
 */
async function recordDenial(
  db: Database,
  run: Run,
  denied: GateDenied,
  schleuseRequired: boolean,
  schleuseKeyRejected: boolean,
  now: Date,
): Promise<ErrorCode | undefined> {
  const schleuseBlocked =
    schleuseRequired &&
    denied.decision.limits.some(
      (limit) => limit.name === "schleuse_gefordert" && limit.result === "verletzt",
    );
  const code: ErrorCode =
    schleuseBlocked && schleuseKeyRejected ? "schluessel_ungueltig" : denied.code;
  const closed = await closeRun(
    db,
    run,
    "denied",
    code,
    async (tx) => {
      if (schleuseBlocked) {
        await repo.events.append(tx, {
          conversationId: run.conversationId,
          type: "schleuse.blockiert",
          data: {
            runId: run.id,
            reason: errorText(schleuseKeyRejected ? "schluessel_ungueltig" : "schleuse_blockiert"),
          },
        });
      }
      await repo.events.append(tx, {
        conversationId: run.conversationId,
        type: "run.denied",
        data: { runId: run.id, code, text: denied.decision.reason },
      });
    },
    now,
  );
  return closed ? code : undefined;
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

/** Statuswechsel und Ereignisse in einer Transaktion; `false`, wenn der Lauf schon beendet war. */
async function closeRun(
  db: Database,
  run: Run,
  status: Exclude<FinalRunStatus, "waiting_approval">,
  code: ErrorCode | undefined,
  events: (tx: Database) => Promise<void>,
  now: Date = new Date(),
): Promise<boolean> {
  try {
    await write(() =>
      repo.withTransaction(db, async (tx) => {
        await repo.runs.finish(tx, run.id, {
          status,
          now,
          ...(code === undefined ? {} : { errorCode: code }),
        });
        await events(tx);
      }),
    );
    return true;
  } catch (error) {
    const cause = error instanceof RunDatabaseError ? error.cause : error;
    if (cause instanceof repo.StatuswechselError) return false;
    throw error;
  }
}
