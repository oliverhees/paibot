/**
 * PaiBot – Abdrücke für Werkzeuge: Aufruf (Fassung 2), Beschreibung und Ergebnis. Rein; der
 * Schlüssel für die Abdrücke mit HMAC kommt nie ins Tor, der Aufrufer rechnet sie über den Text.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import {
  TOOL_CALL_DIGEST_PREFIX,
  TOOL_DEFINITION_DIGEST_PREFIX,
  TOOL_RESULT_DIGEST_PREFIX,
} from "@paibot/shared/bindung";
import type { Sha256Digest } from "@paibot/shared/grundtypen";
import type { ActionId, ConversationId, RunId } from "@paibot/shared/ids";
import type { JsonValue } from "@paibot/shared/motor";
import type { ToolEnvelope, ToolKey } from "@paibot/shared/werkzeug";
import { canonical } from "./regel-hash";

/** Was in den Abdruck eines Werkzeug-Aufrufs eingeht (Fassung 2). */
export interface ToolCallDigestInput {
  actionId: ActionId;
  /** Die bereinigten Argumente. */
  args: JsonValue;
  /** In dieser Fassung immer die `runId` des Laufs. */
  chainRootRunId: RunId;
  conversationId: ConversationId;
  toolDigest: Sha256Digest;
  toolKey: ToolKey;
}

/** Was in den Abdruck einer Werkzeug-Beschreibung eingeht. */
export interface ToolDefinitionDigestInput {
  description: string;
  foreignContent: boolean;
  /** JSON-Schema der Eingabe, wie das Modell es sieht. */
  inputSchema: JsonValue;
  key: ToolKey;
  kind: string;
  modelName: string;
  reach: string;
  source: string;
  version: number;
}

/**
 * Text für den Abdruck eines Werkzeug-Aufrufs: `TOOL_CALL_DIGEST_PREFIX` + kanonisches JSON von
 * `{ actionId, args, chainRootRunId, conversationId, toolDigest, toolKey }`. Den Abdruck
 * (`hmac-sha256:…`) rechnet der Aufrufer mit `contextDigest` aus `@paibot/crypto`. Gleitkommazahlen
 * in den Argumenten werfen einen `TypeError`.
 */
export function toolCallDigestText(input: ToolCallDigestInput): string {
  return `${TOOL_CALL_DIGEST_PREFIX}${canonical({
    actionId: input.actionId,
    args: input.args,
    chainRootRunId: input.chainRootRunId,
    conversationId: input.conversationId,
    toolDigest: input.toolDigest,
    toolKey: input.toolKey,
  })}`;
}

/** Text für den Abdruck einer Werkzeug-Beschreibung (`TOOL_DEFINITION_DIGEST_PREFIX` + kanonisches JSON). */
export function toolDefinitionDigestText(def: ToolDefinitionDigestInput): string {
  return `${TOOL_DEFINITION_DIGEST_PREFIX}${canonical({
    description: def.description,
    foreignContent: def.foreignContent,
    inputSchema: def.inputSchema,
    key: def.key,
    kind: def.kind,
    modelName: def.modelName,
    reach: def.reach,
    source: def.source,
    version: def.version,
  })}`;
}

/**
 * Abdruck einer Werkzeug-Beschreibung: `sha256:` + Hex klein von SHA-256 über die UTF-8-Bytes von
 * `toolDefinitionDigestText`. Asynchron, weil nur Web Crypto rechnet (wie `hashRule`).
 */
export async function toolDefinitionDigest(def: ToolDefinitionDigestInput): Promise<Sha256Digest> {
  const bytes = new TextEncoder().encode(toolDefinitionDigestText(def));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0"));
  return `sha256:${hex.join("")}`;
}

/**
 * Text für den Abdruck eines Werkzeug-Ergebnisses: `TOOL_RESULT_DIGEST_PREFIX` + kanonisches JSON
 * genau der Hülle, die als `role: "tool"` an das Modell ging. Den Abdruck rechnet der Aufrufer mit
 * `contextDigest`.
 */
export function toolResultDigestText(envelope: ToolEnvelope): string {
  return `${TOOL_RESULT_DIGEST_PREFIX}${canonical(envelope)}`;
}
