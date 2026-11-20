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
import { deriveKey, encryptSecret, hashToken, loadMasterSecret } from "@paibot/crypto";
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
import { resolveModel } from "@paibot/llm/modell";
import { type ActionRequest, botActor, type Facts } from "@paibot/shared/aktionen";
import { targetDigestInput, targetOrigin } from "@paibot/shared/bindung";
import { newId } from "@paibot/shared/ids";
import type { ResolvedModel } from "@paibot/shared/motor";

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

export function gateWith(
  rules: readonly RuleDefinition[],
  receipts: ReceiptWriter,
  clock: Clock = steppingClock(),
): Gate {
  return createGate({ rules: { load: () => ruleSnapshot(rules) }, receipts, clock });
}

export interface ModelAccessOptions {
  /** Basis-URL des Anbieters (z. B. des Test-Anbieters), endet auf `/v1`. */
  baseUrl: string;
  apiKey: string;
  /** Name des Modells beim Anbieter. */
  slug?: string;
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
   * den Modell-Zugang über `resolveModel`. `run` läuft innerhalb von `execute`.
   */
  request<R>(run: (model: ResolvedModel) => Promise<R>): Promise<R>;
}

export function modelAccess(options: ModelAccessOptions): ModelAccess {
  const receipts = options.receipts ?? memoryReceipts();
  const gate = gateWith(ACTIVE_STANDARD_RULES, receipts);
  const master = loadMasterSecret({ PAIBOT_SECRET: randomBytes(32).toString("base64") });
  const secretsKey = deriveKey(master, "secrets-v1");
  const botId = newId("bot");
  const providerId = newId("provider");
  const modelId = newId("model");
  const conversationId = newId("conversation");
  const choice = {
    provider: {
      id: providerId,
      templateKey: "lokal",
      baseUrl: options.baseUrl,
      region: "local" as const,
      apiKeyEnc: encryptSecret(options.apiKey, secretsKey),
    },
    model: { id: modelId, slug: options.slug ?? "fake/test-modell", displayName: "Test-Modell" },
    conversationId,
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
    targetOrigin: targetOrigin(options.baseUrl),
    targetDigest: `sha256:${hashToken(targetDigestInput(providerId, options.baseUrl))}`,
  };

  return {
    receipts,
    gate,
    async request(run) {
      const action: ActionRequest<"modell.anfragen"> = {
        actionId: newId("action"),
        type: "modell.anfragen",
        actor: botActor(botId),
        target: { conversationId, runId: newId("run"), botId, modelId },
      };
      const { value } = await gate.run(action, facts, async (permit) => {
        const model = resolveModel(permit, choice, {
          secretsKey,
          ...(options.baseFetch === undefined ? {} : { baseFetch: options.baseFetch }),
        });
        return { value: await run(model), result: { status: "ok" } };
      });
      return value;
    },
  };
}

/** Holt einen Modell-Zugang für Tests, die nur den Motor prüfen. */
export function resolveTestModel(options: ModelAccessOptions): Promise<ResolvedModel> {
  return modelAccess(options).request(async (model) => model);
}
