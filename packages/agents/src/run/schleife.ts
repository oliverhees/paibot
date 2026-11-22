/**
 * PaiBot – Schritt-Schleife eines Laufs: jeder Modell-Schritt einzeln durchs Tor mit echten
 * Fakten, jeder Werkzeug-Wunsch einzeln als Aufruf, Grenzen mitten im Lauf, Schritt-Ende in einer
 * Transaktion. Ohne angebotene Werkzeuge läuft genau ein Schritt wie bisher (Text live).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { contextDigest } from "@paibot/crypto";
import { type Database, repo } from "@paibot/db";
import { type GateDenied, isGateDenied } from "@paibot/gate";
import { resolveModel } from "@paibot/llm/modell";
import { type ActionRequest, botActor } from "@paibot/shared/aktionen";
import type { ReceiptResult } from "@paibot/shared/belege";
import { type ErrorCode, isPaiBotError } from "@paibot/shared/fehler";
import type { HmacDigest, ServedBy } from "@paibot/shared/grundtypen";
import { type AppId, type MessageId, newId } from "@paibot/shared/ids";
import type {
  MotorErrorCode,
  MotorEvent,
  ResolvedModel,
  ToolCall,
  ToolResult,
  TurnInput,
  TurnMessage,
} from "@paibot/shared/motor";
import type { Route, Run, Settings } from "@paibot/shared/objekte";
import { errorText, isTextKey, t } from "@paibot/shared/texte";
import { LIMITS_BY_ID } from "@paibot/shared/tor";
import { buildSystemPrompt } from "../prompt";
import { emptyToolRegistry, type RegisteredTool, type ToolRegistry } from "../werkzeuge/register";
import { ladeAppWerkzeuge } from "./app-werkzeuge";
import { cancelCall, type PreparedCall, prepareCalls, runToolCall } from "./aufruf";
import { createDraftStream, pieces } from "./entwurf";
import { plainText } from "./huelle";
import {
  buildHistoryWithRuns,
  chooseRoute,
  modelChoice,
  modelFacts,
  type RunContext,
  requestChars,
  requestDigest,
} from "./kontext";
import {
  addiereToken,
  ausgabeGrenze,
  kappeToken,
  kettenStand,
  laufAusloeser,
  schrittFakten,
  tokensHeute,
  untrustedInput,
  werkzeugeFuerLauf,
} from "./nahtstellen";
import { type AnswerStream, createAnswerStream, RunDatabaseError, write } from "./strom";
import type { FinalRunStatus, RunDeps, RunTuning } from "./vertrag";
import type { RunGuard, StopReason } from "./waechter";

/** Zeichen pro Token, mit denen die Verlaufsgrenze der Einstellungen in Zeichen umgerechnet wird. */
const CHARS_PER_TOKEN = 4;

type Ready = RunContext & Required<Pick<RunContext, "model" | "provider">>;

/** Wie ein Lauf endet; das bestimmt Lauf, Ereignisse und Beleg. */
export type StepEnd =
  | { kind: "succeeded"; tokens: { input: number; output: number }; servedBy?: ServedBy }
  /** Abgebrochen; `code` nur, wenn es nicht der Stopp des Besitzers war (z. B. Not-Aus). */
  | { kind: "cancelled"; code?: ErrorCode }
  | { kind: "lost" }
  | { kind: "failed"; code: ErrorCode }
  /** Das Tor hat abgelehnt; Lauf und Ereignisse sind schon geschrieben. */
  | { kind: "denied"; code: ErrorCode };

export interface StepValue {
  end: StepEnd;
  messageId?: MessageId;
}

/** Ohne angebotene Werkzeuge: ein Schritt, Text live. Mit: alle Schritte nur vorläufiger Text. */
type Mode = "ohne_werkzeuge" | "mit_werkzeugen";

/** Ergebnis eines Modell-Schritts (Rückgabe aus `execute`). */
interface StepResult {
  end: StepEnd;
  text: string;
  calls: PreparedCall[];
  tokens: { input: number; output: number };
  messageId?: MessageId;
  model: ResolvedModel;
}

/** Ein Wunsch-Ereignis des Motors ohne die Art. */
function toToolCall(event: Extract<MotorEvent, { type: "tool-call" }>): ToolCall {
  return {
    callId: event.callId,
    name: event.name,
    input: event.input,
    ...(event.invalid === undefined ? {} : { invalid: event.invalid }),
    ...(event.rawInput === undefined ? {} : { rawInput: event.rawInput }),
  };
}

function isReady(context: RunContext): context is Ready {
  return (
    context.model?.enabled === true &&
    context.provider !== undefined &&
    context.provider.provider.id === context.model.providerId
  );
}

/** Einstellungen frisch lesen (Not-Aus, Tagesbudget, Grenzen). */
async function freshSettings(db: Database): Promise<Settings> {
  const settings = await repo.settings.get(db);
  if (settings === undefined) throw new RunDatabaseError(new Error("Einstellungen fehlen"));
  return settings;
}

/** Grenzen, deren Ablehnung in einem späteren Schritt mit einer festen End-Antwort endet. */
const LIMIT_END_NAMES = new Set(["laenge", "lauf_token", "lauf_schritte"]);

/** Endet die Ablehnung eines späteren Schritts mit festem Satz (nur G-03, G-16, G-18 verletzt)? */
function limitEnd(denied: GateDenied): string | undefined {
  const { decision } = denied;
  if (decision.preconditions.some((check) => check.result === "verletzt")) return undefined;
  const violated = decision.limits.filter((check) => check.result === "verletzt");
  if (violated.length === 0 || violated.some((check) => !LIMIT_END_NAMES.has(check.name))) {
    return undefined;
  }
  const first = violated[0]?.name;
  const id = Object.entries(LIMITS_BY_ID).find(([, name]) => name === first)?.[0];
  const key = `regel.${id}`;
  return isTextKey(key) ? plainText(key) : errorText("limit_erreicht");
}

/**
 * Die Schritt-Schleife. Je Schritt: Einstellungen und Zustand der Datenschleuse frisch, Anfrage
 * aus Anweisung, Verlauf (nur End-Antworten), den Schritten dieses Laufs und den angebotenen
 * Werkzeugen (im letzten Schritt keine), Fakten aus `schrittFakten`, eigenes `gate.run`
 * (`modell.anfragen`) mit dem Motor nur in `execute`. Danach jeder Wunsch nacheinander als
 * eigener Aufruf (`runToolCall`), dann der nächste Schritt.
 */
export async function runLoop(
  context: RunContext,
  deps: RunDeps,
  tuning: RunTuning,
  guard: RunGuard,
): Promise<StepValue> {
  if (!isReady(context)) return { end: { kind: "failed", code: "kein_modell" } };
  const { db } = deps;
  const run = context.run;
  const basisRegister: ToolRegistry = deps.tools ?? (await emptyToolRegistry());
  // Werkzeuge aus Apps gibt es nur im Chat mit dem eigenen Bot. Der Not-Aus-Wert ist derselbe, der
  // in Schritt 0 als Fakt an das Tor geht (`context.settings`): doppelte Prüfung, erst die Sperre
  // vor dem Abruf, dann das Tor.
  const appWerkzeuge = await write(() =>
    ladeAppWerkzeuge({
      db,
      anschluss: run.botId === context.conversation.botId ? deps.apps : undefined,
      basis: basisRegister,
      botId: run.botId,
      killSwitch: context.settings.killSwitch,
      signal: guard.signal,
      gesamtfristMs: tuning.appAbrufMs,
    }),
  );
  const registry: ToolRegistry = appWerkzeuge.registry;
  const werkzeuge = werkzeugeFuerLauf(run, registry);
  const mode: Mode = werkzeuge.length === 0 ? "ohne_werkzeuge" : "mit_werkzeugen";
  const stand = kettenStand(run);
  const startedAt = Date.now();
  // Die Werkzeuge des Laufs (nicht die des Schritts): Die Anweisung bleibt im letzten Schritt gleich.
  const system = buildSystemPrompt(
    context.bot,
    context.settings,
    deps.clock.now(),
    werkzeuge.map((tool) => tool.definition.key),
  );
  const historyLimit =
    context.settings.historyTokenLimit === undefined
      ? Number.POSITIVE_INFINITY
      : context.settings.historyTokenLimit * CHARS_PER_TOKEN;
  const base = buildHistoryWithRuns(
    context.messages,
    Math.min(tuning.maxRequestChars - system.length, historyLimit),
  );
  const runHistory: TurnMessage[] = [];
  let lastMessageId: MessageId | undefined;
  let lastModel: { route: Route; label: string } | undefined;
  const withMessage = (end: StepEnd): StepValue => ({
    end,
    ...(lastMessageId === undefined ? {} : { messageId: lastMessageId }),
  });

  // Alle Nachrichten dieses Laufs als „fremder Inhalt“ kennzeichnen, sobald die Anfrage oder ein
  // erfolgreicher Aufruf dieses Laufs fremde Inhalte hat (nur setzen, nie zurücknehmen). Das
  // Kennzeichen setzt die Steuerung nach jedem Schritt selbst; verlassen wird sich darauf nicht
  // allein auf die Vererbung in der Datenbank.
  const kennzeichne = async (anfrageHatFremdes: boolean): Promise<void> => {
    const fremd =
      anfrageHatFremdes ||
      (await untrustedInput(db, {
        runId: run.id,
        historyRunIds: base.runIds,
        historyMessageIds: base.messageIds,
      }));
    if (fremd) await write(() => repo.messages.markRunUntrusted(db, run.id));
  };

  for (let step = 0; ; step++) {
    const settings = step === 0 ? context.settings : await write(() => freshSettings(db));
    const last = step >= settings.maxStepsPerRun - 1;
    const offered: readonly RegisteredTool[] = mode === "mit_werkzeugen" && !last ? werkzeuge : [];
    const schleuseStatus =
      (context.conversation.schleuseMode ?? settings.schleuseModeDefault) === "on"
        ? await deps.schleuseStatus()
        : { installed: deps.schleuse !== undefined, reachable: false };
    if (guard.reason !== undefined) return withMessage(stopEnd(guard.reason));
    const route = chooseRoute(context.conversation, settings, schleuseStatus);
    const history = [...base.history, ...runHistory];
    const specs = offered.map((tool) => tool.spec);
    const inputChars = requestChars(system, history, specs);
    const untrusted = await untrustedInput(db, {
      runId: run.id,
      historyRunIds: base.runIds,
      historyMessageIds: base.messageIds,
    });
    const ausgabe = ausgabeGrenze({
      botMaxOutputTokens: context.bot.maxOutputTokens,
      maxRunTokens: settings.maxTokensPerRun,
      runTokens: stand.token,
      inputChars,
    });
    const facts = modelFacts({
      context: { ...context, settings },
      route,
      schleuse: deps.schleuse,
      inputChars,
      maxInputChars: tuning.maxRequestChars,
      maxOutputTokens: ausgabe,
      tokensToday: tokensHeute(context.tokensToday, stand),
      schritt: schrittFakten({
        run,
        settings,
        step,
        stand,
        inputChars,
        ausgabe,
        toolCount: offered.length,
        untrustedInput: untrusted,
      }),
    });
    const action: ActionRequest<"modell.anfragen"> = {
      actionId: newId("action"),
      type: "modell.anfragen",
      actor: botActor(run.botId),
      target: {
        conversationId: context.conversation.id,
        runId: run.id,
        botId: run.botId,
        modelId: context.model.id,
      },
    };
    const turn: Omit<TurnInput, "model"> = {
      system,
      history,
      limits: {
        maxOutputTokens: ausgabe,
        timeoutMs: Math.max(1, tuning.totalTimeoutMs - (Date.now() - startedAt)),
      },
      ...(specs.length === 0 ? {} : { tools: specs.map((spec) => ({ ...spec })) }),
    };
    const choice = modelChoice(context);
    const digest = requestDigest(deps.keys.context, {
      system,
      history,
      modelId: context.model.id,
      route: route.route,
      tools: offered.map((tool) => ({ ...tool.spec, toolDigest: tool.toolDigest })),
    });

    let value: StepResult;
    try {
      ({ value } = await deps.gate.run(
        action,
        facts,
        async (permit) => {
          // Der Modell-Zugang entsteht nur hier und verlässt `execute` nie.
          const model = resolveModel(permit, choice, {
            secretsKey: deps.keys.secrets,
            ...(deps.schleuse === undefined ? {} : { schleuse: deps.schleuse }),
          });
          return runStep({
            context,
            deps,
            tuning,
            guard,
            input: { ...turn, model },
            mode,
            step,
            inputChars,
            ausgabe,
            settings,
            registry,
            offered,
            untrusted,
          });
        },
        { context: { digest: digest as HmacDigest } },
      ));
    } catch (error) {
      if (error instanceof RunDatabaseError) throw error;
      if (isGateDenied(error)) {
        const title = step === 0 ? undefined : limitEnd(error);
        if (title !== undefined) {
          lastMessageId = await fixedAnswer(db, context, {
            text: t("lauf.grenze.antwort", { titel: title, n: step }),
            route: lastModel?.route ?? route.route,
            label: lastModel?.label ?? context.model.displayName,
            flushChars: tuning.deltaFlushChars,
          });
          return withMessage({ kind: "failed", code: "limit_erreicht" });
        }
        const code = await recordDenial(
          db,
          run,
          error,
          facts.requestedMode === "on",
          schleuseStatus.state === "schluessel_falsch",
          deps.clock.now(),
        );
        return withMessage(code === undefined ? { kind: "lost" } : { kind: "denied", code });
      }
      if (isPaiBotError(error)) return withMessage({ kind: "failed", code: error.code });
      throw error;
    }

    lastModel = { route: value.model.route, label: value.model.label };
    if (value.messageId !== undefined) lastMessageId = value.messageId;
    await kennzeichne(untrusted);
    if (value.end.kind !== "succeeded" || value.calls.length === 0) return withMessage(value.end);

    // Wünsche des Schritts, je einzeln durchs Tor, nacheinander in der Reihenfolge des Modells.
    const results: ToolResult[] = [];
    let stepChars = 0;
    // Im Schritt nur Aufrufe an die App des ersten App-Aufrufs; die Steuerung führt sie mit.
    const stepApp: { appId: AppId | undefined } = { appId: undefined };
    for (const [i, call] of value.calls.entries()) {
      if (guard.reason !== undefined) {
        await cancelOpen(db, run, value.calls.slice(i));
        await kennzeichne(untrusted);
        return withMessage(stopEnd(guard.reason));
      }
      const outcome = await runToolCall({
        deps,
        call,
        run: { id: run.id, conversationId: run.conversationId, botId: run.botId },
        botOfConversation: run.botId === context.conversation.botId,
        step,
        callsInRun: stand.aufrufe,
        offeredNames: offered.map((tool) => tool.definition.modelName),
        historyRunIds: base.runIds,
        stepCharsLeft: settings.toolResultsMaxCharsPerStep - stepChars,
        guardSignal: guard.signal,
        // Fremde Inhalte zählen je Anfrage: Aufrufe desselben Schritts haben alle den Wert der
        // Anfrage, die sie erzeugte; ein Ergebnis aus diesem Schritt ändert ihn nicht.
        untrusted: async () => untrusted,
        trigger: laufAusloeser(run),
        stepApp,
      });
      stand.aufrufe += 1;
      if (outcome.status === "ok") stepChars += outcome.chars;
      if (outcome.aborted) {
        await cancelOpen(db, run, value.calls.slice(i + 1));
        await kennzeichne(untrusted);
        return withMessage(stopEnd(guard.reason ?? "abbruch"));
      }
      results.push(outcome.result);
    }
    // Nach den Ergebnissen: war eines fremd, tragen alle bisherigen Nachrichten dieses Laufs das Kennzeichen.
    await kennzeichne(untrusted);
    stand.token = addiereToken(stand.token, addiereToken(value.tokens.input, value.tokens.output));
    stand.schritte += 1;

    if (mode === "ohne_werkzeuge") {
      // Wunsch, obwohl keine Werkzeuge angeboten waren: alle sind belegt abgelehnt (V-12).
      return withMessage({ kind: "failed", code: "werkzeug_unbekannt" });
    }
    if (last) {
      lastMessageId = await fixedAnswer(db, context, {
        text: t("lauf.schritte.antwort"),
        route: value.model.route,
        label: value.model.label,
        flushChars: tuning.deltaFlushChars,
      });
      return withMessage({ kind: "failed", code: "schritte_aufgebraucht" });
    }
    runHistory.push(
      {
        role: "assistant",
        text: value.text,
        toolCalls: value.calls.map((call) => ({
          callId: call.sentCallId,
          name: call.name,
          input: call.storedInput,
        })),
      },
      { role: "tool", results },
    );
  }
}

/** Übrige Aufrufe ohne Entscheidung abbrechen (ohne Beleg; sie waren noch nicht am Tor). */
async function cancelOpen(db: Database, run: Run, calls: readonly PreparedCall[]): Promise<void> {
  for (const call of calls) await cancelCall(db, run, call, "unterbrochen");
}

interface StepInput {
  context: Ready;
  deps: RunDeps;
  tuning: RunTuning;
  guard: RunGuard;
  input: TurnInput & { model: ResolvedModel };
  mode: Mode;
  step: number;
  inputChars: number;
  ausgabe: number;
  settings: Settings;
  registry: ToolRegistry;
  offered: readonly RegisteredTool[];
  /** Fremde Inhalte in der Anfrage dieses Schritts (`untrustedInput` beim Bau der Anfrage). */
  untrusted: boolean;
}

/**
 * Ein Modell-Schritt innerhalb von `execute`: Ereignisse des Motors (Text, Wünsche, Ende), dann
 * das Schritt-Ende in einer Transaktion und das Ergebnis für den Beleg (Token, Prüfsumme über
 * genau den gespeicherten Text, wer geantwortet hat).
 */
async function runStep(s: StepInput): Promise<{ value: StepResult; result: ReceiptResult }> {
  const { context, deps, tuning, guard, mode, step } = s;
  const conversationId = context.conversation.id;
  const runId = context.run.id;
  const answer: AnswerStream | undefined =
    mode === "ohne_werkzeuge"
      ? createAnswerStream({
          db: deps.db,
          conversationId,
          runId,
          flushMs: tuning.deltaFlushMs,
          flushChars: tuning.deltaFlushChars,
        })
      : undefined;
  const draft =
    mode === "mit_werkzeugen"
      ? createDraftStream({
          db: deps.db,
          conversationId,
          runId,
          step,
          flushMs: tuning.deltaFlushMs,
          flushChars: tuning.deltaFlushChars,
        })
      : undefined;
  const stream = (answer ?? draft) as {
    push(text: string): Promise<void>;
    flush(): Promise<void>;
    dispose(): void;
    readonly text: string;
  };
  let finish: Extract<MotorEvent, { type: "finish" }> | undefined;
  let failure: MotorErrorCode | undefined;
  const wishes: ToolCall[] = [];

  try {
    guard.watchIdle(true);
    try {
      for await (const event of deps.motor.runTurn(s.input, guard.signal)) {
        guard.touch();
        if (event.type === "text-delta") {
          if (stream.text.length + event.text.length > tuning.maxAnswerChars) {
            guard.stop("zu_gross");
            break;
          }
          await stream.push(event.text);
        } else if (event.type === "tool-call") {
          // Nur sammeln; geprüft und entschieden wird nach dem Schritt, je Wunsch einzeln.
          wishes.push(toToolCall(event));
        } else if (event.type === "finish") {
          finish = event;
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
    await stream.flush();
  } finally {
    stream.dispose();
  }

  const reported =
    finish !== undefined && (finish.usage.input > 0 || finish.usage.output > 0)
      ? { input: kappeToken(finish.usage.input), output: kappeToken(finish.usage.output) }
      : undefined;
  // Ohne gemeldeten Verbrauch (auch 0/0, Abbruch, Fehler) zählt die Schätzung.
  const tokens = reported ?? {
    input: kappeToken(Math.ceil(s.inputChars / 4)),
    output: kappeToken(s.ausgabe),
  };
  const servedBy = finish?.servedBy === undefined ? undefined : { ...finish.servedBy };
  let end: StepEnd =
    guard.reason !== undefined
      ? stopEnd(guard.reason)
      : failure !== undefined
        ? { kind: "failed", code: failure }
        : finish !== undefined
          ? { kind: "succeeded", tokens, ...(servedBy === undefined ? {} : { servedBy }) }
          : { kind: "failed", code: "unterbrochen" };
  const tooMany = end.kind === "succeeded" && wishes.length > 2 * s.settings.maxToolCallsPerStep;
  if (tooMany) end = { kind: "failed", code: "zu_viele_aufrufe" };

  const calls =
    end.kind === "succeeded" && wishes.length > 0
      ? prepareCalls(wishes, {
          registry: s.registry,
          offered: new Set(s.offered.map((tool) => tool.definition.modelName)),
          contextKey: deps.keys.context,
          runId,
          conversationId,
        })
      : [];

  const messageId =
    answer !== undefined
      ? await saveLiveStep(s, answer, end, calls, tokens)
      : await saveHeldStep(s, stream.text, end, calls, tokens);

  const text = stream.text;
  const value: StepResult = {
    end,
    text,
    calls,
    tokens,
    model: s.input.model,
    ...(messageId === undefined ? {} : { messageId }),
  };
  const result: ReceiptResult =
    end.kind === "succeeded"
      ? {
          status: "ok",
          tokens: end.tokens,
          digest: contextDigest(deps.keys.context, text) as HmacDigest,
          ...(end.servedBy === undefined ? {} : { servedBy: end.servedBy }),
          ...(end.servedBy?.model === undefined ? {} : { modelReported: end.servedBy.model }),
        }
      : receiptResult(end);
  return { value, result };
}

/** Zeilen `requested` und Ereignisse `tool.requested` der Wünsche eines Schritts (in `tx`). */
async function insertCalls(
  tx: Database,
  run: Run,
  messageId: MessageId,
  step: number,
  calls: readonly PreparedCall[],
  untrusted: boolean,
): Promise<void> {
  for (const call of calls) {
    await repo.toolCalls.create(tx, {
      actionId: call.actionId,
      conversationId: run.conversationId,
      runId: run.id,
      messageId,
      position: call.index,
      callId: call.storedCallId,
      name: call.name,
      source: call.source,
      ...(call.server === undefined ? {} : { server: call.server }),
      ...(call.tool?.app === undefined
        ? {}
        : {
            appId: call.tool.app.appId,
            appToolId: call.tool.app.appToolId,
            toolVersion: call.tool.definition.version,
          }),
      kind: call.kind,
      input: call.storedInput,
      argsDigest: call.argsDigest,
      toolKey: call.toolKey,
      toolDigest: call.toolDigest,
      reach: call.reach,
      foreignContent: call.foreignContent,
      step,
      untrustedInput: untrusted,
      ...(call.rawName === undefined ? {} : { rawName: call.rawName }),
    });
    await repo.events.append(tx, {
      conversationId: run.conversationId,
      type: "tool.requested",
      data: {
        runId: run.id,
        actionId: call.actionId,
        messageId,
        name: call.name,
        source: call.source,
        kind: call.kind,
        key: call.toolKey,
        step,
      },
    });
  }
}

function stepFinished(
  run: Run,
  step: number,
  ending: "antwort" | "zwischentext",
  servedBy?: ServedBy,
) {
  return {
    conversationId: run.conversationId,
    type: "step.finished" as const,
    data: {
      runId: run.id,
      step,
      ending,
      ...(servedBy === undefined ? {} : { servedBy }),
      ...(servedBy?.model === undefined ? {} : { modelReported: servedBy.model }),
    },
  };
}

/**
 * Schritt-Ende ohne angebotene Werkzeuge (Text war live): wie bisher die streamende Nachricht
 * abschließen, dazu `step.finished`. Wünschte das Modell trotzdem Werkzeuge, endet die Nachricht
 * als `failed` (`werkzeug_unbekannt`), und die Zeilen der Wünsche entstehen in derselben
 * Transaktion.
 */
async function saveLiveStep(
  s: StepInput,
  stream: AnswerStream,
  end: StepEnd,
  calls: readonly PreparedCall[],
  tokens: { input: number; output: number },
): Promise<MessageId | undefined> {
  const { context, deps, step } = s;
  const run = context.run;
  if (end.kind !== "succeeded" && stream.messageId === undefined) return undefined;
  const messageId = await stream.ensureMessage();
  const model = s.input.model;
  const untrusted = s.untrusted;
  // Das Kennzeichen „fremder Inhalt“ wird im selben Schreibvorgang wie der Abschluss gesetzt.
  const base = {
    content: stream.text,
    modelId: context.model.id,
    providerId: context.provider.provider.id,
    route: model.route,
    ...(untrusted ? { untrusted: true } : {}),
  };
  await write(() =>
    repo.withTransaction(deps.db, async (tx) => {
      if (end.kind === "succeeded" && calls.length === 0) {
        await repo.messages.finalize(tx, messageId, {
          ...base,
          status: "complete",
          tokensIn: end.tokens.input,
          tokensOut: end.tokens.output,
          ...(end.servedBy === undefined ? {} : { servedBy: end.servedBy }),
        });
        await repo.events.append(tx, {
          conversationId: run.conversationId,
          type: "message.completed",
          data: {
            messageId,
            route: model.route,
            modelLabel: model.label,
            tokens: end.tokens,
            ...(end.servedBy === undefined ? {} : { servedBy: end.servedBy }),
          },
          runId: run.id,
        });
        await repo.events.append(tx, stepFinished(run, step, "antwort", end.servedBy));
      } else if (end.kind === "succeeded") {
        await repo.messages.finalize(tx, messageId, {
          ...base,
          status: "failed",
          errorCode: "werkzeug_unbekannt",
          tokensIn: tokens.input,
          tokensOut: tokens.output,
        });
        await insertCalls(tx, run, messageId, step, calls, untrusted);
        await repo.events.append(tx, stepFinished(run, step, "antwort", end.servedBy));
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
 * Schritt-Ende mit angebotenen Werkzeugen (Text war nur vorläufig): genau eine Nachricht in einer
 * Transaktion – End-Antwort (`step` leer, mit `message.created`, `text.delta`,
 * `message.completed`), wenn der Schritt ohne Wunsch fertig wurde; sonst Zwischentext
 * (`step = n`, nur `step.finished`) samt Zeilen der Wünsche. Abbruch und Fehler ergeben nie eine
 * End-Antwort; ohne Text entsteht dann keine Nachricht.
 */
async function saveHeldStep(
  s: StepInput,
  text: string,
  end: StepEnd,
  calls: readonly PreparedCall[],
  tokens: { input: number; output: number },
): Promise<MessageId | undefined> {
  const { context, deps, step, tuning } = s;
  const run = context.run;
  const isAnswer = end.kind === "succeeded" && calls.length === 0;
  if (end.kind !== "succeeded" && text === "") return undefined;
  const model = s.input.model;
  const untrusted = s.untrusted;
  const status =
    end.kind === "succeeded" ? "complete" : end.kind === "failed" ? "failed" : "cancelled";
  const errorCode =
    end.kind === "failed" ? end.code : end.kind === "cancelled" ? end.code : undefined;
  const servedBy = end.kind === "succeeded" ? end.servedBy : undefined;
  return write(() =>
    repo.withTransaction(deps.db, async (tx) => {
      const message = await repo.messages.insert(tx, {
        conversationId: run.conversationId,
        role: "assistant",
        status: "streaming",
        content: "",
        runId: run.id,
        origin: "modell",
        ...(isAnswer ? {} : { step }),
      });
      await repo.messages.finalize(tx, message.id, {
        status,
        content: text,
        modelId: context.model.id,
        providerId: context.provider.provider.id,
        route: model.route,
        tokensIn: tokens.input,
        tokensOut: tokens.output,
        ...(servedBy === undefined ? {} : { servedBy }),
        ...(errorCode === undefined ? {} : { errorCode }),
        ...(untrusted ? { untrusted: true } : {}),
      });
      if (calls.length > 0) await insertCalls(tx, run, message.id, step, calls, untrusted);
      await repo.events.append(
        tx,
        stepFinished(run, step, isAnswer ? "antwort" : "zwischentext", servedBy),
      );
      if (isAnswer) {
        await announceAnswer(tx, run, message.id, text, {
          route: model.route,
          label: model.label,
          tokens,
          flushChars: tuning.deltaFlushChars,
          ...(servedBy === undefined ? {} : { servedBy }),
        });
      }
      return message.id;
    }),
  );
}

/** Ereignisse einer End-Antwort, die auf einmal erscheint: angelegt, Text in Stücken, fertig. */
async function announceAnswer(
  tx: Database,
  run: Run,
  messageId: MessageId,
  text: string,
  info: {
    route: Route;
    label: string;
    tokens: { input: number; output: number };
    flushChars: number;
    servedBy?: ServedBy;
  },
): Promise<void> {
  await repo.events.append(tx, {
    conversationId: run.conversationId,
    type: "message.created",
    data: { messageId, role: "assistant", text: "" },
    runId: run.id,
  });
  for (const piece of pieces(text, info.flushChars)) {
    await repo.events.append(tx, {
      conversationId: run.conversationId,
      type: "text.delta",
      data: { runId: run.id, messageId, text: piece },
    });
  }
  await repo.events.append(tx, {
    conversationId: run.conversationId,
    type: "message.completed",
    data: {
      messageId,
      route: info.route,
      modelLabel: info.label,
      tokens: info.tokens,
      ...(info.servedBy === undefined ? {} : { servedBy: info.servedBy }),
    },
    runId: run.id,
  });
}

/**
 * Feste End-Antwort von PaiBot (Herkunft `fest`), z. B. wenn eine Grenze mitten im Lauf greift.
 */
async function fixedAnswer(
  db: Database,
  context: Ready,
  input: { text: string; route: Route; label: string; flushChars: number },
): Promise<MessageId> {
  const run = context.run;
  return write(() =>
    repo.withTransaction(db, async (tx) => {
      const message = await repo.messages.insert(tx, {
        conversationId: run.conversationId,
        role: "assistant",
        status: "streaming",
        content: "",
        runId: run.id,
        origin: "fest",
      });
      await repo.messages.finalize(tx, message.id, {
        status: "complete",
        content: input.text,
        modelId: context.model.id,
        providerId: context.provider.provider.id,
        route: input.route,
      });
      await announceAnswer(tx, run, message.id, input.text, {
        route: input.route,
        label: input.label,
        tokens: { input: 0, output: 0 },
        flushChars: input.flushChars,
      });
      return message.id;
    }),
  );
}

export function stopEnd(reason: StopReason): StepEnd {
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
    case "datenbank":
      return { kind: "failed", code: "unterbrochen" };
  }
}

/** Beleg „Ergebnis“ eines Schritts, der nicht fertig wurde. Nie der Text. */
function receiptResult(end: Exclude<StepEnd, { kind: "succeeded" }>): ReceiptResult {
  switch (end.kind) {
    case "cancelled":
    case "lost":
      return { status: "cancelled" };
    case "failed":
    case "denied":
      return { status: "error", code: end.code };
  }
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

/** Statuswechsel und Ereignisse in einer Transaktion; `false`, wenn der Lauf schon beendet war. */
export async function closeRun(
  db: Database,
  run: Run,
  status: FinalRunStatus,
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
