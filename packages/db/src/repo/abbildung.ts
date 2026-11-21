/**
 * PaiBot – Wandelt Datenbankzeilen in die Objekte der Verträge: Zeiten als ISO-Text, leere Felder weggelassen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import {
  type Bot,
  type Conversation,
  type ConversationEvent,
  type ConversationEventType,
  type ErrorCode,
  errorCodeSchema,
  type Message,
  type Model,
  type Provider,
  type ReceiptEntry,
  type Rule,
  type Run,
  type Session,
  type Settings,
  toIsoTime,
} from "@paibot/shared";
import type {
  BelegRow,
  Bot as BotRow,
  ConversationEventRow,
  Conversation as ConversationRow,
  Message as MessageRow,
  Model as ModelRow,
  Provider as ProviderRow,
  RuleRow,
  Run as RunRow,
  Session as SessionRow,
  Settings as SettingsRow,
} from "../schema";

/** `{ [schluessel]: wert }`, oder nichts, wenn der Wert fehlt. */
function wennGesetzt<K extends string, V>(
  schluessel: K,
  wert: V | null | undefined,
): { [P in K]?: V } {
  return wert === null || wert === undefined ? {} : ({ [schluessel]: wert } as { [P in K]?: V });
}

const zeit = (datum: Date | null) => (datum === null ? undefined : toIsoTime(datum));

function alsFehlercode(text: string | null): ErrorCode | undefined {
  if (text === null) return undefined;
  const geprueft = errorCodeSchema.safeParse(text);
  return geprueft.success ? geprueft.data : "intern";
}

export function toConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    botId: row.botId,
    title: row.title,
    ...wennGesetzt("schleuseMode", row.schleuseMode),
    ...wennGesetzt("lastMessageAt", zeit(row.lastMessageAt)),
    createdAt: toIsoTime(row.createdAt),
    updatedAt: toIsoTime(row.updatedAt),
  };
}

export function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    conversationId: row.conversationId,
    role: row.role,
    content: row.content,
    status: row.status,
    ...wennGesetzt("runId", row.runId),
    ...wennGesetzt("modelId", row.modelId),
    ...wennGesetzt("providerId", row.providerId),
    ...wennGesetzt("route", row.route),
    ...wennGesetzt("tokensIn", row.tokensIn),
    ...wennGesetzt("tokensOut", row.tokensOut),
    ...wennGesetzt("errorCode", alsFehlercode(row.errorCode)),
    ...(row.servedProvider === null && row.servedModel === null
      ? {}
      : {
          servedBy: {
            ...wennGesetzt("provider", row.servedProvider),
            ...wennGesetzt("model", row.servedModel),
          },
        }),
    createdAt: toIsoTime(row.createdAt),
  };
}

export function toRun(row: RunRow): Run {
  return {
    id: row.id,
    conversationId: row.conversationId,
    triggerMessageId: row.triggerMessageId,
    botId: row.botId,
    status: row.status,
    ...wennGesetzt("resumesRunId", row.resumesRunId),
    ...wennGesetzt("cancelRequestedAt", zeit(row.cancelRequestedAt)),
    ...wennGesetzt("heartbeatAt", zeit(row.heartbeatAt)),
    ...wennGesetzt("startedAt", zeit(row.startedAt)),
    ...wennGesetzt("finishedAt", zeit(row.finishedAt)),
    ...wennGesetzt("errorCode", alsFehlercode(row.errorCode)),
    createdAt: toIsoTime(row.createdAt),
  };
}

export function toBot(row: BotRow): Bot {
  return {
    id: row.id,
    name: row.name,
    instructions: row.instructions,
    ...wennGesetzt("modelId", row.modelId),
    avatarShape: row.avatarShape,
    color: row.color,
    maxOutputTokens: row.maxOutputTokens,
    createdAt: toIsoTime(row.createdAt),
    updatedAt: toIsoTime(row.updatedAt),
  };
}

export function toProvider(row: ProviderRow): Provider {
  return {
    id: row.id,
    kind: row.kind,
    templateKey: row.templateKey,
    name: row.name,
    baseUrl: row.baseUrl,
    keySet: row.apiKeyEnc !== null,
    ...(row.managementKeyEnc === null ? {} : { managementKeySet: true }),
    region: row.region,
    ...wennGesetzt("country", row.country),
    enabled: row.enabled,
    ...wennGesetzt("lastCheckedAt", zeit(row.lastCheckedAt)),
    ...wennGesetzt("lastCheckOk", row.lastCheckOk),
    createdAt: toIsoTime(row.createdAt),
    updatedAt: toIsoTime(row.updatedAt),
  };
}

export function toModel(row: ModelRow): Model {
  return {
    id: row.id,
    providerId: row.providerId,
    slug: row.slug,
    displayName: row.displayName,
    ...wennGesetzt("contextWindow", row.contextWindow),
    enabled: row.enabled,
    createdAt: toIsoTime(row.createdAt),
  };
}

export function toSettings(row: SettingsRow): Settings {
  return {
    locale: row.locale as Settings["locale"],
    timezone: row.timezone,
    schleuseModeDefault: row.schleuseModeDefault,
    maxHops: row.maxHops,
    ...wennGesetzt("dailyTokenBudget", row.dailyTokenBudget),
    ...wennGesetzt("historyTokenLimit", row.historyTokenLimit),
    ...wennGesetzt("setupCompletedAt", zeit(row.setupCompletedAt)),
    ...wennGesetzt("installationId", row.installationId),
    ...wennGesetzt("defaultBotId", row.defaultBotId),
    killSwitch: row.killSwitch,
    createdAt: toIsoTime(row.createdAt),
    updatedAt: toIsoTime(row.updatedAt),
  };
}

export function toSession(row: SessionRow, current: boolean): Session {
  return {
    id: row.id,
    ownerId: row.ownerId,
    authLevel: row.authLevel,
    method: row.method,
    ...wennGesetzt("userAgent", row.userAgent),
    createdAt: toIsoTime(row.createdAt),
    lastSeenAt: toIsoTime(row.lastSeenAt),
    expiresAt: toIsoTime(row.expiresAt),
    current,
  };
}

export function toRule(row: RuleRow): Rule {
  return {
    id: row.id as Rule["id"],
    version: row.version,
    action: row.action as Rule["action"],
    effect: row.effect,
    stage: row.stage,
    conditions: row.conditions,
    priority: row.priority,
    source: row.source,
    enabled: row.enabled,
    title: row.title,
    reason: row.reason,
    createdAt: toIsoTime(row.createdAt),
    seq: row.seq,
  };
}

export function toReceiptEntry(row: BelegRow): ReceiptEntry {
  return {
    seq: row.seq,
    id: row.id,
    hash: row.hash,
    signature: row.signature,
    keyId: row.keyId,
    body: row.body,
  };
}

export function toEvent(row: ConversationEventRow): ConversationEvent {
  return {
    conversationId: row.conversationId,
    seq: row.seq,
    time: toIsoTime(row.createdAt),
    ...wennGesetzt("runId", row.runId),
    type: row.type as ConversationEventType,
    data: row.payload,
  } as ConversationEvent;
}
