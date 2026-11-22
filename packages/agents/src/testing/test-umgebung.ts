/**
 * PaiBot – Test-Umgebung für Motoren: Modell-Zugang über das echte Tor und die echte
 * Anbieter-Schicht, Belege und Uhr im Speicher. Nur für Tests des Pakets, nicht exportiert.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { randomBytes } from "node:crypto";
import { type DerivedKey, deriveKey, encryptSecret, loadMasterSecret } from "@paibot/crypto";
import {
  ACTIVE_STANDARD_RULES,
  type Clock,
  createGate,
  type DecisionRecord,
  type Gate,
  type ReceiptRef,
  type ReceiptWriter,
  type ResultRecord,
  type RuleDefinition,
  ruleSnapshot,
} from "@paibot/gate";
import { providerTargetFacts } from "@paibot/llm";
import { type ModelChoice, type ResolveModelDeps, resolveModel } from "@paibot/llm/modell";
import { type ActionRequest, botActor, type Facts } from "@paibot/shared/aktionen";
import type { ReceiptResult } from "@paibot/shared/belege";
import { providerSecretBinding, secretAad } from "@paibot/shared/bindung";
import { newId } from "@paibot/shared/ids";
import type { Motor, MotorEvent, ResolvedModel, TurnInput } from "@paibot/shared/motor";

/** Belege im Speicher, in der Reihenfolge des Schreibens. */
export interface MemoryReceipts extends ReceiptWriter {
  readonly entries: ReadonlyArray<
    { kind: "decision"; record: DecisionRecord } | { kind: "result"; record: ResultRecord }
  >;
}

export function memoryReceipts(): MemoryReceipts {
  const entries: Array<
    { kind: "decision"; record: DecisionRecord } | { kind: "result"; record: ResultRecord }
  > = [];
  const ref = (): ReceiptRef => ({ receiptId: newId("receipt"), seq: entries.length });
  return {
    entries,
    async appendDecision(record) {
      entries.push({ kind: "decision", record: structuredClone(record) });
      return ref();
    },
    async appendResult(record) {
      entries.push({ kind: "result", record: structuredClone(record) });
      return ref();
    },
  };
}

/** Uhr, die bei jedem Ablesen eine Millisekunde weitergeht. */
export function steppingClock(start = Date.UTC(2026, 10, 20, 10, 0, 0)): Clock {
  let now = start;
  return { now: () => new Date(now++) };
}

/** Tor mit einem Regelstand im Speicher; er muss alle aktiven Standard-Regeln enthalten, sonst lehnt das Tor ihn ab. */
export function gateWith(
  rules: readonly RuleDefinition[],
  receipts: ReceiptWriter,
  clock: Clock = steppingClock(),
): Gate {
  return createGate({ rules: { load: () => ruleSnapshot(rules) }, receipts, clock });
}

/** Eingabe einer Runde ohne Modell-Zugang: den baut erst `execute` des Tors. */
export type TurnRequest = Omit<TurnInput, "model">;

export interface MotorStepOptions {
  /** Abbruch der Runde. */
  signal?: AbortSignal;
  /** Jedes Ereignis, sobald es kommt; `"stop"` beendet die Runde (wie `break` in der Schleife). */
  onEvent?: (event: MotorEvent) => undefined | "stop";
}

/** Alles, was ein Motor-Schritt durch das Tor braucht. */
export interface MotorStep {
  gate: Gate;
  action: ActionRequest<"modell.anfragen">;
  facts: Facts<"modell.anfragen">;
  /** Anbieter und Modell aus demselben Lesestand wie die Fakten. */
  choice: ModelChoice;
  deps: ResolveModelDeps;
  motor: Motor;
  turn: TurnRequest;
}

/**
 * Ein Modell-Schritt so, wie die Lauf-Steuerung ihn ausführt: `modell.anfragen` durch das Tor;
 * erst in `execute` entsteht mit der Berechtigung der Modell-Zugang (`resolveModel`), und die
 * ganze Runde des Motors läuft dort. Nach `execute` ist der Zugang wertlos. Das Ergebnis der Runde
 * (Token-Zahlen, Fehlercode, Abbruch) steht im Beleg „Ergebnis“.
 *
 * Lehnt das Tor ab, wirft es `GateDenied`; der Motor läuft dann gar nicht.
 */
export async function runMotorStep(step: MotorStep, options: MotorStepOptions = {}) {
  const signal = options.signal ?? new AbortController().signal;
  return step.gate.run(step.action, step.facts, async (permit) => {
    const model = resolveModel(permit, step.choice, step.deps);
    const events: MotorEvent[] = [];
    for await (const event of step.motor.runTurn({ ...step.turn, model }, signal)) {
      events.push(event);
      if (options.onEvent?.(event) === "stop") break;
    }
    return { value: events, result: stepResult(events, signal) };
  });
}

/** Was vom Motor-Schritt in den Beleg „Ergebnis“ geht. */
export function stepResult(events: readonly MotorEvent[], signal: AbortSignal): ReceiptResult {
  const last = events.at(-1);
  if (last?.type === "error") return { status: "error", code: last.code };
  if (last?.type === "finish") return { status: "ok", tokens: { ...last.usage } };
  if (signal.aborted) return { status: "cancelled" };
  return { status: "error", code: "unterbrochen" };
}

export interface ModelAccessOptions {
  /** Basis-URL des Anbieters (z. B. des Test-Anbieters), endet auf `/v1`. */
  baseUrl: string;
  apiKey: string;
  /** Name des Modells beim Anbieter. */
  slug?: string;
  /** Vorlage des Anbieters (Standard `eigener`); `eurouter` für Routing-Regeln. */
  templateKey?: ModelChoice["provider"]["templateKey"];
  /** Grund-`fetch` unter der Ausgangs-Liste. */
  baseFetch?: typeof fetch;
  receipts?: MemoryReceipts;
}

/** Ein Bot mit Unterhaltung und Anbieter, dessen Modell-Anfragen durch das echte Tor gehen. */
export interface ModelAccess {
  readonly receipts: MemoryReceipts;
  readonly gate: Gate;
  /**
   * Fragt das Tor (`modell.anfragen`, Standard-Regeln) und baut in `execute` mit der Berechtigung
   * den Modell-Zugang über `resolveModel`. `run` läuft innerhalb von `execute`; der Zugang gilt nur
   * dort.
   */
  request<R>(run: (model: ResolvedModel) => Promise<R>): Promise<R>;
  /** Eine Runde des Motors innerhalb von `execute` (`runMotorStep`); gibt alle Ereignisse zurück. */
  step(motor: Motor, turn: TurnRequest, options?: MotorStepOptions): Promise<MotorEvent[]>;
}

export function modelAccess(options: ModelAccessOptions): ModelAccess {
  const receipts = options.receipts ?? memoryReceipts();
  const gate = gateWith(ACTIVE_STANDARD_RULES, receipts);
  const master = loadMasterSecret({ PAIBOT_SECRET: randomBytes(32).toString("base64") });
  const secretsKey: DerivedKey<"secrets-v1"> = deriveKey(master, "secrets-v1");
  const botId = newId("bot");
  const providerId = newId("provider");
  const modelId = newId("model");
  const conversationId = newId("conversation");
  const choice: ModelChoice = {
    provider: {
      id: providerId,
      templateKey: options.templateKey ?? "eigener",
      baseUrl: options.baseUrl,
      region: "local",
      apiKeyEnc: encryptSecret(options.apiKey, secretsKey, {
        aad: secretAad(providerSecretBinding(providerId, options.baseUrl)),
      }),
    },
    model: { id: modelId, slug: options.slug ?? "fake/test-modell", displayName: "Test-Modell" },
    conversationId,
  };
  const deps: ResolveModelDeps = {
    secretsKey,
    ...(options.baseFetch === undefined ? {} : { baseFetch: options.baseFetch }),
  };
  const facts: Facts<"modell.anfragen"> = {
    botOfConversation: true,
    providerId,
    providerEnabled: true,
    region: "local",
    route: "direct",
    requestedMode: "off",
    schleuseReachable: false,
    inputChars: 100,
    maxInputChars: 32000,
    maxOutputTokens: 1024,
    botMaxOutputTokens: 2048,
    tokensToday: 0,
    killSwitch: false,
    ...providerTargetFacts(providerId, options.baseUrl),
    step: 0,
    maxSteps: 1,
    runTokens: 0,
    stepTokenEstimate: Math.ceil(100 / 4) + 1024,
    maxRunTokens: 500000,
    toolCount: 0,
    untrustedInput: false,
    trigger: "chat",
  };
  const newAction = (): ActionRequest<"modell.anfragen"> => ({
    actionId: newId("action"),
    type: "modell.anfragen",
    actor: botActor(botId),
    target: { conversationId, runId: newId("run"), botId, modelId },
  });

  return {
    receipts,
    gate,
    async request(run) {
      const { value } = await gate.run(newAction(), facts, async (permit) => {
        const model = resolveModel(permit, choice, deps);
        return { value: await run(model), result: { status: "ok" } };
      });
      return value;
    },
    async step(motor, turn, stepOptions) {
      const { value } = await runMotorStep(
        { gate, action: newAction(), facts, choice, deps, motor, turn },
        stepOptions,
      );
      return value;
    },
  };
}
