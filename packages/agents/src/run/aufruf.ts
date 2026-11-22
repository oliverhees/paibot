/**
 * PaiBot – Ein Werkzeug-Aufruf: Wunsch des Modells selbst prüfen (Name, Kennung, Eingabe),
 * Fakten bilden, einzeln durchs Tor, nur nach „erlaubt“ ausführen und das Ergebnis als feste
 * Hülle zurückgeben.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { contextDigest, type DerivedKey } from "@paibot/crypto";
import { type Database, repo } from "@paibot/db";
import { isGateDenied, isGatePermit, toolCallDigestText, toolResultDigestText } from "@paibot/gate";
import {
  type ActionRequest,
  botActor,
  type Facts,
  UNKNOWN_TOOL_NAME,
} from "@paibot/shared/aktionen";
import type { ReceiptResult } from "@paibot/shared/belege";
import { type ErrorCode, PaiBotError } from "@paibot/shared/fehler";
import type { HmacDigest, Sha256Digest } from "@paibot/shared/grundtypen";
import { type ActionId, type ConversationId, newId, type RunId } from "@paibot/shared/ids";
import type { JsonValue, ToolCall, ToolResult } from "@paibot/shared/motor";
import { TOOL_NAME_PATTERN, type ToolKind, type ToolSource } from "@paibot/shared/objekte";
import { t } from "@paibot/shared/texte";
import type { GatePermit } from "@paibot/shared/tor";
import type { ToolEnvelope, ToolKey } from "@paibot/shared/werkzeug";
import { belegFelder, dokuAusHuelle } from "../werkzeuge/beleg-felder";
import type { RegisteredTool, ToolRegistry } from "../werkzeuge/register";
import {
  cleanJson,
  cleanText,
  jsonHasKeyClash,
  jsonHasNonInteger,
  jsonHasProtoKey,
  jsonHasUnwanted,
  rawToolName,
} from "./bereinigen";
import {
  codeEnvelope,
  contentChars,
  dataEnvelope,
  deniedText,
  errorEnvelopeText,
  invalidInputText,
  resultStatus,
  truncateContent,
  unknownToolText,
} from "./huelle";
import { nachFrage } from "./nahtstellen";
import { write } from "./strom";
import type { RunDeps } from "./vertrag";

/** Längste Kennung eines Aufrufs, wie sie in `tool_calls.call_id` passt. */
export const MAX_CALL_ID_CHARS = 200;
/** Längster gespeicherter Rohtext einer ungültigen Eingabe. */
export const MAX_STORED_RAW_INPUT_CHARS = 2000;

/** Ein Wunsch des Modells nach dem Prüfen durch die Steuerung (nie durch das SDK). */
export interface PreparedCall {
  actionId: ActionId;
  /** Position im Schritt (Reihenfolge des Modells), ab 0. */
  index: number;
  /** Kennung, wie das Modell sie gesendet hat; geht so zurück an das Modell. */
  sentCallId: string;
  /** Kennung in `tool_calls.call_id` (bei leerer, zu langer oder doppelter Kennung ein Ersatz). */
  storedCallId: string;
  /** Name in den Fakten und in der Zeile: der Name des Modells oder `unbekannt`. */
  name: string;
  /** Bereinigter roher Name, nur wenn `name` der Platzhalter ist. */
  rawName?: string;
  tool?: RegisteredTool;
  toolKey: ToolKey;
  toolDigest: Sha256Digest;
  source: ToolSource;
  kind: ToolKind;
  reach: "intern" | "nach_aussen";
  foreignContent: boolean;
  toolRegistered: boolean;
  toolOffered: boolean;
  inputValid: boolean;
  /** Erster Fehler der Eingabe laut Schema (nur bei Schema-Fehlern). */
  issue?: Parameters<typeof invalidInputText>[0];
  /** Eingabe für die Zeile und für den nächsten Schritt: bereinigt bzw. `{ roh }`. */
  storedInput: JsonValue;
  argsDigest: HmacDigest;
}

function isPlainObject(value: unknown): value is { [key: string]: JsonValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Text einer Eingabe, die nicht als gültiges Objekt angenommen wird. */
function inputText(call: ToolCall): string {
  if (call.rawInput !== undefined) return call.rawInput;
  if (typeof call.input === "string") return call.input;
  return JSON.stringify(call.input) ?? "";
}

function storedCallIds(calls: readonly ToolCall[]): string[] {
  const used = new Set<string>();
  return calls.map((call, index) => {
    const valid = call.callId.length >= 1 && call.callId.length <= MAX_CALL_ID_CHARS;
    let id = valid ? call.callId : `pb-${index}`;
    if (used.has(id)) {
      const suffix = `-${index}`;
      id = `${id.slice(0, MAX_CALL_ID_CHARS - suffix.length)}${suffix}`;
    }
    for (let n = 1; used.has(id); n++) id = `pb-${index}-${n}`;
    used.add(id);
    return id;
  });
}

/**
 * Prüft die Wünsche eines Schritts selbst (Vermerke des SDK wie `invalid` sind nur Auskunft):
 * - Name passt nicht zu `TOOL_NAME_PATTERN` (leer, zu lang, andere Zeichen): Name `unbekannt`,
 *   roher Name bereinigt und gekürzt, Platzhalter-Werkzeug (schreibt, wirkt nach außen, fremd);
 *   gültig, aber nicht im Register: ebenso, mit dem Namen; nicht angeboten: `toolOffered = false`.
 * - Kennung leer oder über 200 Zeichen: `inputValid = false`, Ersatz in der Zeile; doppelt: Endung.
 * - Eingabe kein reines Objekt (auch Text mit gültigem JSON), Rohtext gesetzt, Schema verletzt,
 *   Steuer-, Bidi- oder unsichtbare Zeichen, Gleitkommazahl: `inputValid = false`, nie geparst.
 * - Abdruck über die bereinigte Eingabe bzw. `{ roh }` mit dem ganzen vorhandenen Text.
 */
export function prepareCalls(
  calls: readonly ToolCall[],
  input: {
    registry: ToolRegistry;
    offered: ReadonlySet<string>;
    contextKey: DerivedKey<"context-v1">;
    runId: RunId;
    conversationId: ConversationId;
  },
): PreparedCall[] {
  const ids = storedCallIds(calls);
  return calls.map((call, index) => {
    const nameValid = typeof call.name === "string" && TOOL_NAME_PATTERN.test(call.name);
    const tool = nameValid ? input.registry.byModelName(call.name) : undefined;
    const placeholder = input.registry.placeholder;
    const name = nameValid ? call.name : UNKNOWN_TOOL_NAME;
    const rawName = nameValid ? undefined : rawToolName(String(call.name ?? ""));
    const def = tool?.definition;

    let inputValid = call.callId.length >= 1 && call.callId.length <= MAX_CALL_ID_CHARS;
    let issue: PreparedCall["issue"];
    let accepted: JsonValue | undefined;
    if (call.rawInput === undefined && isPlainObject(call.input)) {
      const value = call.input;
      if (jsonHasUnwanted(value) || jsonHasNonInteger(value)) {
        inputValid = false;
      } else if (def !== undefined) {
        // Erst bereinigen (NFC), dann prüfen: Das Werkzeug bekommt genau die geprüfte Form.
        const parsed = def.input.safeParse(cleanJson(value));
        if (parsed.success) accepted = parsed.data as JsonValue;
        else {
          inputValid = false;
          issue = parsed.error.issues[0];
        }
      } else {
        accepted = cleanJson(value);
      }
    } else {
      inputValid = false;
    }
    if (accepted === undefined) inputValid = false;

    const actionId = newId("action") as ActionId;
    const toolKey = tool?.definition.key ?? placeholder.toolKey;
    const toolDigest = tool?.toolDigest ?? placeholder.toolDigest;
    const fullText = inputText(call);
    let args: JsonValue = inputValid && accepted !== undefined ? accepted : { roh: fullText };
    let argsDigest: HmacDigest;
    try {
      argsDigest = digestOf(input, actionId, args, toolDigest, toolKey);
    } catch {
      // Der Abdruck wirft z. B. bei Gleitkommazahlen; dann gilt die Eingabe als ungültig.
      inputValid = false;
      args = { roh: fullText };
      argsDigest = digestOf(input, actionId, args, toolDigest, toolKey);
    }
    const storedInput: JsonValue = deepFreeze(
      inputValid && accepted !== undefined
        ? accepted
        : { roh: Array.from(cleanText(fullText)).slice(0, MAX_STORED_RAW_INPUT_CHARS).join("") },
    );

    return {
      actionId,
      index,
      sentCallId: call.callId,
      storedCallId: ids[index] as string,
      name,
      ...(rawName === undefined ? {} : { rawName }),
      ...(tool === undefined ? {} : { tool }),
      toolKey,
      toolDigest,
      source: def?.source ?? placeholder.source,
      kind: def?.kind ?? placeholder.kind,
      reach: def?.reach ?? placeholder.reach,
      foreignContent: def?.foreignContent ?? placeholder.foreignContent,
      toolRegistered: tool !== undefined,
      toolOffered: tool !== undefined && input.offered.has(tool.definition.modelName),
      inputValid,
      ...(issue === undefined ? {} : { issue }),
      storedInput,
      argsDigest,
    };
  });
}

/** Friert einen JSON-Wert samt allen Teilen ein (die Eingabe ändert sich nach der Prüfung nicht). */
function deepFreeze<T extends JsonValue>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const entry of Object.values(value)) deepFreeze(entry as JsonValue);
    Object.freeze(value);
  }
  return value;
}

function digestOf(
  input: { contextKey: DerivedKey<"context-v1">; runId: RunId; conversationId: ConversationId },
  actionId: ActionId,
  args: JsonValue,
  toolDigest: Sha256Digest,
  toolKey: ToolKey,
): HmacDigest {
  return contextDigest(
    input.contextKey,
    toolCallDigestText({
      actionId,
      args,
      // In dieser Fassung ist jede Kette ein Lauf.
      chainRootRunId: input.runId,
      conversationId: input.conversationId,
      toolDigest,
      toolKey,
    }),
  ) as HmacDigest;
}

/** Abbruch, wie das Tor ihn erkennt (Ergebnis `cancelled`). */
export function abortError(): Error {
  const error = new Error("Abgebrochen");
  error.name = "AbortError";
  return error;
}

/** Endet, sobald `signal` abbricht; die Ausführung des Werkzeugs läuft dann nicht weiter mit. */
function untilAborted(signal: AbortSignal): Promise<never> {
  return new Promise((_, reject) => {
    if (signal.aborted) reject(abortError());
    else signal.addEventListener("abort", () => reject(abortError()), { once: true });
  });
}

/**
 * Ruft `run()` eines Werkzeugs auf – der einzige Ort dafür. Ohne echte Berechtigung des Tors für
 * genau diesen Aufruf (`isGatePermit`, gleiche `actionId`) wirft sie `intern`, und nichts läuft.
 */
export async function invokeTool(
  tool: RegisteredTool,
  value: JsonValue,
  context: {
    permit: unknown;
    actionId: ActionId;
    signal: AbortSignal;
    conversationId: ConversationId;
    runId: RunId;
    botId: GatePermit<"werkzeug.aufrufen">["target"]["botId"];
    contextKey: DerivedKey<"context-v1">;
  },
): ReturnType<RegisteredTool["definition"]["run"]> {
  const { permit } = context;
  if (!isGatePermit(permit, "werkzeug.aufrufen") || permit.actionId !== context.actionId) {
    throw new PaiBotError("intern");
  }
  // Die Eingabe gehört zur Entscheidung: Abdruck unmittelbar vor dem Start neu rechnen.
  let digest: HmacDigest | undefined;
  try {
    digest = digestOf(context, context.actionId, value, tool.toolDigest, tool.definition.key);
  } catch {
    digest = undefined;
  }
  if (digest === undefined || digest !== permit.facts.argsDigest) {
    throw new PaiBotError("intern");
  }
  return Promise.race([
    tool.definition.run(value, {
      signal: context.signal,
      permit,
      conversationId: context.conversationId,
      runId: context.runId,
      botId: context.botId,
      ports: {},
    }),
    untilAborted(context.signal),
  ]);
}

/** Ausgang eines Aufrufs für Schleife und nächsten Schritt. */
export interface CallOutcome {
  envelope: ToolEnvelope;
  result: ToolResult;
  /** Ergebnis für `nachAufrufen`. */
  status: "ok" | "fehler" | "abgelehnt";
  code?: ErrorCode;
  /** Der Lauf wurde während des Werkzeugs angehalten. */
  aborted: boolean;
  /** Das Tor hat erlaubt und das Werkzeug ist zu Ende gelaufen (mit Ergebnis oder Werkzeug-Fehler). */
  ausgefuehrt: boolean;
  /** Nur beim Nachschlagen in der Doku mit Ergebnis: Doku-Stand und Zahl der Fundstellen. */
  doku?: { stand: string; gefunden: number };
}

/** Code, mit dem ein abgebrochener Aufruf endet: streng, wenn er gewirkt haben könnte. */
export function abortCode(
  call: Pick<PreparedCall, "kind" | "reach">,
): "unterbrochen" | "ausgang_unbekannt" {
  return call.kind === "lesen" && call.reach === "intern" ? "unterbrochen" : "ausgang_unbekannt";
}

/** Text der Hülle bei Ablehnung durch das Tor (nur aus Text-Schlüsseln). */
function denialEnvelopeText(
  call: PreparedCall,
  code: ErrorCode,
  decision: Parameters<typeof deniedText>[0],
  offeredNames: readonly string[],
): string {
  if (code === "freigabe_noetig") return t("werkzeug.huelle.freigabe_noetig");
  if (code === "werkzeug_unbekannt" && !call.toolRegistered) return unknownToolText(offeredNames);
  if (code === "werkzeug_eingabe_ungueltig") {
    const shape = (call.tool?.definition.input as { shape?: Record<string, unknown> } | undefined)
      ?.shape;
    return invalidInputText(call.issue, shape === undefined ? [] : Object.keys(shape));
  }
  return deniedText(decision, code);
}

/** Was ein Aufruf aus dem Schritt braucht. */
export interface CallInput {
  deps: RunDeps;
  call: PreparedCall;
  run: {
    id: RunId;
    conversationId: ConversationId;
    botId: GatePermit<"werkzeug.aufrufen">["target"]["botId"];
  };
  botOfConversation: boolean;
  step: number;
  callsInRun: number;
  offeredNames: readonly string[];
  historyRunIds: readonly RunId[];
  /** Zeichen der Ergebnisse, die in diesem Schritt noch frei sind. */
  stepCharsLeft: number;
  guardSignal: AbortSignal;
  untrusted: (input: { runId: RunId; historyRunIds: readonly RunId[] }) => Promise<boolean>;
  trigger: Facts<"werkzeug.aufrufen">["trigger"];
}

/**
 * Ein Aufruf in fester Reihenfolge: Fakten (frisch gelesen) → `gate.run("werkzeug.aufrufen")` →
 * bei Ablehnung Zeile `denied` mit Hülle → bei „erlaubt“ in `execute`: Berechtigung prüfen,
 * `requested → running` festschreiben (eigene Transaktion), `tool.started`, Werkzeug ohne offene
 * Transaktion ausführen, Ergebnis prüfen, bereinigen, kürzen → nach dem Tor Zeile beenden mit der
 * Kennung des Ergebnis-Belegs. Ein Abbruch des Laufs während des Werkzeugs endet als `cancelled`.
 */
export async function runToolCall(input: CallInput): Promise<CallOutcome & { chars: number }> {
  const { deps, call, run } = input;
  const db = deps.db;
  const [settings, current] = await Promise.all([repo.settings.get(db), repo.runs.get(db, run.id)]);
  if (settings === undefined) throw new PaiBotError("einrichtung_offen");
  const untrustedInput = await input.untrusted({
    runId: run.id,
    historyRunIds: input.historyRunIds,
  });
  const facts: Facts<"werkzeug.aufrufen"> = {
    toolName: call.name,
    toolSource: call.source,
    toolKind: call.kind,
    toolKey: call.toolKey,
    toolDigest: call.toolDigest,
    toolReach: call.reach,
    toolForeign: call.foreignContent,
    toolRegistered: call.toolRegistered,
    toolOffered: call.toolOffered,
    inputValid: call.inputValid,
    untrustedInput,
    step: input.step,
    callIndexInStep: call.index,
    maxCallsPerStep: settings.maxToolCallsPerStep,
    callsInRun: input.callsInRun,
    maxCallsPerRun: settings.maxToolCallsPerRun,
    killSwitch: settings.killSwitch,
    trigger: input.trigger,
    botOfConversation: input.botOfConversation,
    runRunning: current?.status === "running" && current.cancelRequestedAt === undefined,
    argsDigest: call.argsDigest,
  };
  const action: ActionRequest<"werkzeug.aufrufen"> = {
    actionId: call.actionId,
    type: "werkzeug.aufrufen",
    actor: botActor(run.botId),
    target: { conversationId: run.conversationId, runId: run.id, botId: run.botId },
  };
  const toolResult = (envelope: ToolEnvelope): ToolResult => ({
    callId: call.sentCallId,
    name: call.name,
    status: resultStatus(envelope),
    output: envelope as unknown as JsonValue,
  });
  let truncation = { truncated: false, chars: 0 };
  try {
    const { value, receipts } = await deps.gate.run(action, facts, async (permit) => {
      if (!isGatePermit(permit, "werkzeug.aufrufen") || permit.actionId !== call.actionId) {
        throw new PaiBotError("intern");
      }
      await write(() =>
        repo.withTransaction(db, async (tx) => {
          await repo.toolCalls.recordDecision(tx, call.actionId, {
            outcome: "allow",
            decisionReceiptId: permit.decisionReceiptId,
          });
          await repo.events.append(tx, {
            conversationId: run.conversationId,
            type: "tool.started",
            data: { runId: run.id, actionId: call.actionId },
          });
        }),
      );
      const tool = call.tool;
      if (tool === undefined) throw new PaiBotError("intern");
      // Ab hier ist keine Transaktion offen und keine Zeile gesperrt.
      const timeout = AbortSignal.timeout(tool.definition.limits.timeoutMs);
      const signal = AbortSignal.any([input.guardSignal, timeout]);
      let envelope: ToolEnvelope;
      try {
        const outcome = await invokeTool(tool, call.storedInput, {
          permit,
          actionId: call.actionId,
          signal,
          conversationId: run.conversationId,
          runId: run.id,
          botId: run.botId,
          contextKey: deps.keys.context,
        });
        if (input.guardSignal.aborted) throw abortError();
        envelope = outcomeEnvelope(outcome, tool, settings, input.stepCharsLeft, (t) => {
          truncation = t;
        });
      } catch {
        if (input.guardSignal.aborted) throw abortError();
        // Die Meldung des Werkzeugs geht nie weiter: nicht an das Modell, nicht ins Log.
        const code: ErrorCode = timeout.aborted ? "werkzeug_zeitgrenze" : "werkzeug_fehler";
        envelope = codeEnvelope(call.toolKey, "fehler", code, errorEnvelopeText(code));
      }
      const result: ReceiptResult =
        envelope.status === "ok"
          ? {
              status: "ok",
              digest: contextDigest(
                deps.keys.context,
                toolResultDigestText(envelope),
              ) as HmacDigest,
              // Doku-Stand und Fundstellen aus genau der Hülle, die das Modell bekommt.
              ...belegFelder(call.toolKey, envelope),
            }
          : {
              status: "error",
              code: envelope.code,
              digest: contextDigest(
                deps.keys.context,
                toolResultDigestText(envelope),
              ) as HmacDigest,
            };
      return { value: envelope, result };
    });
    const envelope = value;
    const status = envelope.status === "ok" ? "succeeded" : "failed";
    await write(() =>
      repo.withTransaction(db, async (tx) => {
        await repo.toolCalls.finish(tx, call.actionId, {
          status,
          output: envelope,
          resultReceiptId: receipts.result.receiptId,
          ...(envelope.status === "ok"
            ? { outputTruncated: truncation.truncated, outputChars: truncation.chars }
            : { errorCode: envelope.code }),
        });
        await repo.events.append(tx, {
          conversationId: run.conversationId,
          type: "tool.finished",
          data: {
            runId: run.id,
            actionId: call.actionId,
            status,
            ...(envelope.status === "ok" ? {} : { code: envelope.code }),
          },
        });
      }),
    );
    const doku = dokuAusHuelle(call.toolKey, envelope);
    return {
      envelope,
      result: toolResult(envelope),
      status: envelope.status === "ok" ? "ok" : "fehler",
      ...(envelope.status === "ok" ? {} : { code: envelope.code }),
      aborted: false,
      ausgefuehrt: true,
      ...(doku === undefined ? {} : { doku }),
      chars: contentChars(envelope as unknown as JsonValue),
    };
  } catch (error) {
    if (isGateDenied(error)) {
      const decision =
        error.outcome === "ask" ? nachFrage(error).decision : error.toolCallDecision();
      const envelope = codeEnvelope(
        call.toolKey,
        "abgelehnt",
        decision.errorCode,
        denialEnvelopeText(call, decision.errorCode, error.decision, input.offeredNames),
      );
      await write(() =>
        repo.withTransaction(db, async (tx) => {
          await repo.toolCalls.recordDecision(tx, call.actionId, {
            outcome: "deny",
            decisionReceiptId: decision.decisionReceiptId,
            resultReceiptId: decision.resultReceiptId,
            output: envelope,
            errorCode: decision.errorCode,
          });
          await repo.events.append(tx, {
            conversationId: run.conversationId,
            type: "tool.finished",
            data: {
              runId: run.id,
              actionId: call.actionId,
              status: "denied",
              code: decision.errorCode,
            },
          });
        }),
      );
      return {
        envelope,
        result: toolResult(envelope),
        status: "abgelehnt",
        code: decision.errorCode,
        aborted: false,
        ausgefuehrt: false,
        chars: contentChars(envelope as unknown as JsonValue),
      };
    }
    if (isAbort(error)) {
      const code = abortCode(call);
      const envelope = await cancelCall(db, run, call, code);
      return {
        envelope,
        result: toolResult(envelope),
        status: "fehler",
        code,
        aborted: true,
        ausgefuehrt: false,
        chars: 0,
      };
    }
    throw error;
  }
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/** Bricht einen offenen Aufruf ab: Zeile `cancelled` mit Hülle, Ereignis `tool.finished`. */
export async function cancelCall(
  db: Database,
  run: { id: RunId; conversationId: ConversationId },
  call: Pick<PreparedCall, "actionId" | "toolKey">,
  code: "unterbrochen" | "ausgang_unbekannt",
): Promise<ToolEnvelope> {
  const envelope = codeEnvelope(call.toolKey, "fehler", code, errorEnvelopeText(code));
  await write(() =>
    repo.withTransaction(db, async (tx) => {
      await repo.toolCalls.cancel(tx, call.actionId, { output: envelope, errorCode: code });
      await repo.events.append(tx, {
        conversationId: run.conversationId,
        type: "tool.finished",
        data: { runId: run.id, actionId: call.actionId, status: "cancelled", code },
      });
    }),
  );
  return envelope;
}

/** Hülle aus dem Ausgang eines Werkzeugs: Ausgabe prüfen, bereinigen, kürzen. */
function outcomeEnvelope(
  outcome: Awaited<ReturnType<RegisteredTool["definition"]["run"]>>,
  tool: RegisteredTool,
  settings: { toolResultMaxChars: number },
  stepCharsLeft: number,
  report: (t: { truncated: boolean; chars: number }) => void,
): ToolEnvelope {
  const key = tool.definition.key;
  if (outcome.status !== "ok") {
    const code: ErrorCode =
      outcome.code === "werkzeug_zeitgrenze" || outcome.code === "werkzeug_eingabe_ungueltig"
        ? outcome.code
        : "werkzeug_fehler";
    return codeEnvelope(key, "fehler", code, errorEnvelopeText(code));
  }
  const checked = tool.definition.output.safeParse(outcome.output);
  if (!checked.success)
    return codeEnvelope(key, "fehler", "werkzeug_fehler", errorEnvelopeText("werkzeug_fehler"));
  // Kein stilles Überschreiben und nie ein Schlüssel `__proto__` (auch nicht erst durch das
  // Bereinigen): so ein Ergebnis geht nicht an das Modell.
  if (jsonHasKeyClash(checked.data as JsonValue))
    return codeEnvelope(key, "fehler", "werkzeug_fehler", errorEnvelopeText("werkzeug_fehler"));
  const cleaned = cleanJson(checked.data as JsonValue);
  if (jsonHasProtoKey(cleaned))
    return codeEnvelope(key, "fehler", "werkzeug_fehler", errorEnvelopeText("werkzeug_fehler"));
  const limit = Math.max(
    0,
    Math.min(tool.definition.limits.maxOutputChars, settings.toolResultMaxChars, stepCharsLeft),
  );
  const cut = truncateContent(cleaned, limit);
  if (cut === undefined)
    return codeEnvelope(key, "fehler", "werkzeug_fehler", errorEnvelopeText("werkzeug_fehler"));
  report({ truncated: cut.gekuerzt, chars: cut.chars });
  try {
    return dataEnvelope(key, cut.inhalt, cut.gekuerzt);
  } catch {
    return codeEnvelope(key, "fehler", "werkzeug_fehler", errorEnvelopeText("werkzeug_fehler"));
  }
}
