/**
 * PaiBot – Beispiel-Zeilen für die Tests: gültige Datensätze mit frischen IDs.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { randomBytes } from "node:crypto";
import {
  type ActionId,
  type BotId,
  type ConversationId,
  type KeyId,
  newId,
  type ReceiptBody,
  type ReceiptId,
  ZERO_PREV,
} from "@paibot/shared";
import type {
  belege,
  bots,
  conversations,
  installationKeys,
  messages,
  models,
  providers,
  runs,
} from "./schema";

let counter = 0;
const next = () => ++counter;

const b64 = (bytes: number) => randomBytes(bytes).toString("base64url");
const hex = (bytes: number) => randomBytes(bytes).toString("hex");

export const sha256Digest = () => `sha256:${hex(32)}`;
export const publicKey = () => b64(32);
export const signature = () => b64(64);
export const fingerprint = () => `${hex(2)}-${hex(2)}-${hex(2)}-${hex(2)}`;
export const encrypted = () => `v1:${b64(12)}:${b64(16)}:${b64(48)}`;

export function providerRow(overrides: Partial<typeof providers.$inferInsert> = {}) {
  return {
    id: newId("provider"),
    kind: "openai_compatible",
    name: `Anbieter ${next()}`,
    baseUrl: `https://api${next()}.beispiel.test/v1`,
    apiKeyEnc: encrypted(),
    region: "eu",
    country: "DE",
    ...overrides,
  } satisfies typeof providers.$inferInsert;
}

export function modelRow(
  providerId: typeof providers.$inferInsert.id,
  overrides: Partial<typeof models.$inferInsert> = {},
) {
  return {
    id: newId("model"),
    providerId,
    slug: `modell-${next()}`,
    displayName: `Modell ${next()}`,
    contextWindow: 128000,
    ...overrides,
  } satisfies typeof models.$inferInsert;
}

export function botRow(overrides: Partial<typeof bots.$inferInsert> = {}) {
  return {
    id: newId("bot"),
    name: `Bot ${next()}`,
    instructions: "Antworte freundlich.",
    avatarShape: "blatt",
    color: "limette",
    ...overrides,
  } satisfies typeof bots.$inferInsert;
}

export function conversationRow(
  botId: BotId,
  overrides: Partial<typeof conversations.$inferInsert> = {},
) {
  return {
    id: newId("conversation"),
    botId,
    title: `Unterhaltung ${next()}`,
    ...overrides,
  } satisfies typeof conversations.$inferInsert;
}

export function messageRow(
  conversationId: ConversationId,
  overrides: Partial<typeof messages.$inferInsert> = {},
) {
  return {
    id: newId("message"),
    conversationId,
    role: "user",
    content: "Hallo",
    ...overrides,
  } satisfies typeof messages.$inferInsert;
}

export function runRow(
  ids: {
    conversationId: ConversationId;
    triggerMessageId: typeof messages.$inferInsert.id;
    botId: BotId;
  },
  overrides: Partial<typeof runs.$inferInsert> = {},
) {
  return { id: newId("run"), ...ids, ...overrides } satisfies typeof runs.$inferInsert;
}

export function keyRow(overrides: Partial<typeof installationKeys.$inferInsert> = {}) {
  return {
    id: newId("key"),
    purpose: "receipts",
    publicKey: publicKey(),
    privateKeyEnc: encrypted(),
    fingerprint: fingerprint(),
    ...overrides,
  } satisfies typeof installationKeys.$inferInsert;
}

/** Beleg „start“ (Kettenanfang) bzw. „Entscheidung“ mit passendem Körper. */
export function belegRow(
  keyId: KeyId,
  options: { seq: number; prevHash: string; type?: "start" | "decision" } = {
    seq: 1,
    prevHash: ZERO_PREV,
  },
) {
  const id: ReceiptId = newId("receipt");
  const type = options.type ?? (options.seq === 1 ? "start" : "decision");
  const common = {
    v: 1,
    id,
    seq: options.seq,
    time: new Date().toISOString(),
    prev: options.prevHash,
    keyId,
  } as const;
  const actionId: ActionId = newId("action");
  const body = (
    type === "start"
      ? {
          ...common,
          type,
          facts: {
            installationId: newId("installation"),
            publicKey: publicKey(),
            software: "0.0.0+test",
          },
        }
      : {
          ...common,
          type,
          action: {
            actionId,
            type: "unterhaltung.loeschen",
            actor: "besitzer",
            target: { conversationId: newId("conversation") },
          },
          decision: {
            outcome: "allow",
            stage: "execute",
            rules: [{ id: "R-001", version: 1 }],
            limits: [],
            reason: "Erlaubt.",
          },
          facts: { credential: "sitzung" },
        }
  ) as ReceiptBody;
  return {
    seq: options.seq,
    id,
    entryType: type,
    ...(type === "start" ? {} : { actionId, action: "unterhaltung.loeschen", actor: "besitzer" }),
    body,
    prevHash: options.prevHash,
    hash: sha256Digest(),
    keyId,
    signature: signature(),
  } satisfies typeof belege.$inferInsert;
}
