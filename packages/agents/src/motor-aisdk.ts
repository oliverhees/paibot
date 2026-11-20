/**
 * PaiBot – Motor auf dem Vercel AI SDK: genau ein Modell-Schritt, gestreamt, ohne Werkzeug-Ausführung.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { isRetryable, mapProviderError } from "@paibot/llm";
import { isResolvedModel } from "@paibot/llm/modell";
import { invalidInput } from "@paibot/shared/fehler";
import type {
  JsonValue,
  Motor,
  MotorCapabilities,
  MotorEvent,
  ToolResult,
  ToolSpec,
  TurnInput,
  TurnMessage,
} from "@paibot/shared/motor";
import { jsonSchema, type ModelMessage, streamText, type ToolSet, tool } from "ai";
import { z } from "zod";
import { AISDK_MOTOR_ID } from "./motor";

export interface AiSdkMotorOptions {
  /** Fehlt Antwort-Strom länger als so viele Millisekunden, endet die Runde mit `anbieter_nicht_erreichbar`. */
  idleTimeoutMs?: number;
}

const optionsSchema = z.strictObject({
  idleTimeoutMs: z.number().int().positive().optional(),
});

const turnLimitsSchema = z.strictObject({
  maxOutputTokens: z.number().int().positive(),
  timeoutMs: z.number().int().positive(),
});

/** Name, unter dem der Anbieter im AI SDK geführt wird. Erscheint in keiner Anfrage. */
const PROVIDER_NAME = "paibot";

const TOOL_NAME_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

const CAPABILITIES: MotorCapabilities = {
  streaming: true,
  tools: true,
  reasoning: false,
  abort: true,
  toolsExecutedInternally: false,
};

/**
 * Baut den Motor auf dem Vercel AI SDK (`streamText` mit einem Modell aus
 * `createOpenAICompatible({ name, baseURL, headers, fetch, includeUsage: true })`, alles aus
 * `TurnInput.model`).
 *
 * Zusagen:
 * - genau ein Modell-Schritt: kein `stopWhen`, Werkzeuge nur als Beschreibung ohne `execute`;
 *   Werkzeug-Wünsche kommen als `tool-call` heraus, ausgeführt wird nichts
 *   (`capabilities().toolsExecutedInternally === false`)
 * - nie eine Text-Kennung als Modell, keine Telemetrie-Registrierung, kein anderes `fetch` als
 *   `TurnInput.model.fetch`; die Anmeldung setzt dieses `fetch` selbst, der Motor kennt keinen
 *   Schlüssel
 * - nur ein Modell-Zugang, den die Anbieter-Schicht gebaut hat (`isResolvedModel`); eine Kopie oder
 *   ein Nachbau ergibt das Ereignis `error` mit `detail: "zugang_ungueltig"`, ohne Anfrage
 * - Abbruch über `signal` beendet den Strom sofort; danach kommt kein Ereignis mehr
 * - Fehler kommen als Ereignis `error` mit `MotorErrorCode` (`mapProviderError`), nicht als Ausnahme
 * - speichert nichts: Verlauf und Ergebnisse liegen nur bei der Lauf-Steuerung
 */
export function createAiSdkMotor(options?: AiSdkMotorOptions): Motor {
  const parsed = optionsSchema.safeParse(options ?? {});
  if (!parsed.success) throw invalidInput(parsed.error, options);
  const { idleTimeoutMs } = parsed.data;

  return {
    id: AISDK_MOTOR_ID,
    capabilities: () => ({ ...CAPABILITIES }),
    runTurn: (input, signal) => runTurn(input, signal, idleTimeoutMs),
  };
}

/** Eine Runde: ein Aufruf von `streamText`, dessen Strom auf `MotorEvent` abgebildet wird. */
async function* runTurn(
  input: TurnInput,
  signal: AbortSignal,
  idleTimeoutMs: number | undefined,
): AsyncGenerator<MotorEvent> {
  if (signal.aborted) return;
  if (!turnLimitsSchema.safeParse(input.limits).success || !toolsValid(input.tools)) {
    yield { type: "error", code: "intern", retryable: false, detail: "eingabe_ungueltig" };
    return;
  }
  if (!isResolvedModel(input.model)) {
    yield { type: "error", code: "intern", retryable: false, detail: "zugang_ungueltig" };
    return;
  }

  // Eigener Abbruch-Schalter: Abbruch durch den Aufrufer und die Zeitgrenzen laufen hier zusammen.
  // Nur so lässt sich am Ende unterscheiden, ob jemand abgebrochen hat (still enden) oder die Zeit
  // abgelaufen ist (Fehler melden).
  const controller = new AbortController();
  let timedOut = false;
  const stopByCaller = () => controller.abort(signal.reason);
  const stopByTimer = () => {
    timedOut = true;
    controller.abort(new DOMException("Zeitgrenze erreicht", "TimeoutError"));
  };
  signal.addEventListener("abort", stopByCaller, { once: true });
  const totalTimer = setTimeout(stopByTimer, input.limits.timeoutMs);
  let idleTimer = idleTimeoutMs === undefined ? undefined : setTimeout(stopByTimer, idleTimeoutMs);
  const touch = () => {
    if (idleTimer === undefined) return;
    clearTimeout(idleTimer);
    idleTimer = setTimeout(stopByTimer, idleTimeoutMs);
  };

  let completed = false;
  try {
    const { model } = input;
    const provider = createOpenAICompatible({
      name: PROVIDER_NAME,
      baseURL: model.baseUrl,
      headers: { ...model.headers },
      fetch: model.fetch,
      includeUsage: true,
    });
    const tools = toToolSet(input.tools);
    const result = streamText({
      model: provider.chatModel(model.slug),
      instructions: input.system,
      messages: toModelMessages(input.history),
      ...(tools === undefined ? {} : { tools }),
      maxOutputTokens: input.limits.maxOutputTokens,
      // Wiederholen entscheidet die Lauf-Steuerung, nicht die Bibliothek.
      maxRetries: 0,
      abortSignal: controller.signal,
      // Fehler kommen als Teil `error` im Strom; ohne eigenen Haken schreibt die Bibliothek sie
      // zusätzlich in die Konsole.
      onError: () => undefined,
    });

    let finish: MotorEvent | undefined;
    let failure: MotorEvent | undefined;
    for await (const part of result.stream) {
      if (signal.aborted) return;
      touch();
      switch (part.type) {
        case "text-delta":
          if (part.text !== "") yield { type: "text-delta", text: part.text };
          break;
        case "tool-call":
          // Vom Anbieter selbst ausgeführte Werkzeuge gibt es bei OpenAI-kompatiblen Anbietern
          // nicht; sicherheitshalber werden sie nie als Wunsch weitergereicht.
          if (part.providerExecuted !== true) {
            yield {
              type: "tool-call",
              callId: part.toolCallId,
              name: part.toolName,
              input: toJsonValue(part.input),
            };
          }
          break;
        case "finish":
          finish = {
            type: "finish",
            finishReason: part.finishReason,
            usage: {
              input: part.totalUsage.inputTokens ?? 0,
              output: part.totalUsage.outputTokens ?? 0,
            },
          };
          break;
        case "error":
          failure ??= errorEvent(part.error);
          break;
        case "abort":
          if (signal.aborted) return;
          failure ??= timeoutEvent();
          break;
        default:
          break;
      }
      if (failure !== undefined) break;
    }
    if (signal.aborted) return;
    completed = true;
    if (failure !== undefined) {
      yield failure;
    } else if (finish !== undefined) {
      yield finish;
    } else {
      yield timedOut
        ? timeoutEvent()
        : {
            type: "error",
            code: "anbieter_nicht_erreichbar",
            retryable: true,
            detail: "strom_ohne_ende",
          };
    }
  } catch (error) {
    if (signal.aborted) return;
    completed = true;
    yield timedOut ? timeoutEvent() : errorEvent(error);
  } finally {
    clearTimeout(totalTimer);
    if (idleTimer !== undefined) clearTimeout(idleTimer);
    signal.removeEventListener("abort", stopByCaller);
    // Bricht der Aufrufer die Schleife ab (`return` auf dem Iterator), schließt das die Verbindung.
    if (!completed) controller.abort(new DOMException("Runde beendet", "AbortError"));
  }
}

function toolsValid(tools: readonly ToolSpec[] | undefined): boolean {
  if (tools === undefined) return true;
  const names = new Set<string>();
  for (const spec of tools) {
    if (!TOOL_NAME_PATTERN.test(spec.name) || names.has(spec.name)) return false;
    names.add(spec.name);
  }
  return true;
}

/** Werkzeug-Beschreibungen ohne `execute`: Die Bibliothek kann nichts davon ausführen. */
function toToolSet(tools: readonly ToolSpec[] | undefined): ToolSet | undefined {
  if (tools === undefined || tools.length === 0) return undefined;
  const set: ToolSet = {};
  for (const spec of tools) {
    set[spec.name] = tool({
      description: spec.description,
      inputSchema: jsonSchema(spec.inputSchema),
    });
  }
  return set;
}

/** Verlauf der Lauf-Steuerung im Nachrichtenformat der Bibliothek. */
function toModelMessages(history: readonly TurnMessage[]): ModelMessage[] {
  return history.map(toModelMessage);
}

function toModelMessage(message: TurnMessage): ModelMessage {
  if (message.role === "user") return { role: "user", content: message.text };
  if (message.role === "tool") {
    return {
      role: "tool",
      content: message.results.map((result) => ({
        type: "tool-result" as const,
        toolCallId: result.callId,
        toolName: result.name,
        output: toToolOutput(result),
      })),
    };
  }
  const calls = message.toolCalls ?? [];
  if (calls.length === 0) return { role: "assistant", content: message.text };
  return {
    role: "assistant",
    content: [
      ...(message.text === "" ? [] : [{ type: "text" as const, text: message.text }]),
      ...calls.map((call) => ({
        type: "tool-call" as const,
        toolCallId: call.callId,
        toolName: call.name,
        input: call.input,
      })),
    ],
  };
}

function toToolOutput(result: ToolResult) {
  switch (result.status) {
    case "ok":
      return { type: "json" as const, value: result.output };
    case "error":
      return { type: "error-json" as const, value: result.output };
    case "denied":
      return {
        type: "execution-denied" as const,
        reason: typeof result.output === "string" ? result.output : JSON.stringify(result.output),
      };
  }
}

/** Eingabe eines Werkzeug-Wunschs als reines JSON (ungültige Eingaben kommen als Text). */
function toJsonValue(value: unknown): JsonValue {
  if (value === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(value)) as JsonValue;
  } catch {
    return String(value);
  }
}

function timeoutEvent(): MotorEvent {
  return {
    type: "error",
    code: "anbieter_nicht_erreichbar",
    retryable: true,
    detail: "zeitgrenze",
  };
}

/** Fehler als Ereignis. `detail` enthält nur feste Kurzangaben, nie Texte des Anbieters. */
function errorEvent(error: unknown): MotorEvent {
  const code = mapProviderError(error);
  const detail = detailOf(error);
  return {
    type: "error",
    code,
    retryable: isRetryable(code),
    ...(detail === undefined ? {} : { detail }),
  };
}

function detailOf(error: unknown): string | undefined {
  for (let current = error, depth = 0; depth < 5; depth++) {
    if (current === null || typeof current !== "object") return undefined;
    const record = current as Record<string, unknown>;
    const status =
      typeof record.statusCode === "number"
        ? record.statusCode
        : typeof record.status === "number"
          ? record.status
          : undefined;
    // Ein Strom, der nach einer erfolgreichen Antwort (HTTP 2xx) abbricht, trägt diesen Status
    // weiter; gemeldet wird dann der Abbruch, nicht der Status.
    if (status !== undefined)
      return status >= 200 && status < 300 ? "strom_abgebrochen" : `http_${status}`;
    if (record.name === "EgressBlockedError") return "ziel_gesperrt";
    current = record.cause;
  }
  return undefined;
}
