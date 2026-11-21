/**
 * PaiBot – Hilfen für die Tests des Beleg-Protokolls: Schlüssel und Signaturen aus dem
 * Krypto-Paket, eine Test-Regel, Beispiel-Aktionen und Ketten im Speicher.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { fingerprint, generateSigningKey, sign } from "@paibot/crypto";
import { evaluate } from "@paibot/gate";
import type { ActionRequest } from "@paibot/shared/aktionen";
import type { PublicKeyInfo, ReceiptEntry } from "@paibot/shared/belege";
import { type KeyId, newId } from "@paibot/shared/ids";
import type { Decision, RuleDefinition } from "@paibot/shared/tor";
import { buildReceipt, type ReceiptDraft } from "./build";
import { digestBytes, hashReceipt } from "./hash";
import { hashRule, type RuleVersion } from "./nachrechnen";

export interface TestKey {
  keyId: KeyId;
  publicKey: string;
  privateKey: string;
  fingerprint: string;
}

/** Signiert wie der Server (Ed25519 aus `@paibot/crypto`). */
export function testSign(privateKey: string, bytes: Uint8Array): string {
  return sign(privateKey, bytes);
}

/** Neuer Signaturschlüssel aus `@paibot/crypto` mit Kennung und Kurzform. */
export function testKey(): TestKey {
  const { publicKey, privateKey } = generateSigningKey();
  return { keyId: newId("key"), publicKey, privateKey, fingerprint: fingerprint(publicKey) };
}

export function keyInfo(key: TestKey): PublicKeyInfo {
  return { keyId: key.keyId, publicKey: key.publicKey, fingerprint: key.fingerprint };
}

/** Eine eigene Regel für die Tests: erlaubt dem Besitzer mit Sitzung jede Aktion. */
export const TEST_RULE: RuleDefinition = {
  id: "R-001",
  version: 1,
  action: "*",
  effect: "allow",
  stage: "execute",
  conditions: [
    { fact: "akteur", op: "eq", value: "besitzer" },
    { fact: "credential", op: "in", value: ["sitzung"] },
  ],
  priority: 10,
  source: "owner",
  enabled: true,
  title: "Besitzer mit Sitzung",
  reason: "Der Besitzer handelt selbst.",
};

export const TEST_INSTALLATION = newId("installation");

export function sendAction(): ActionRequest<"nachricht.senden"> {
  return {
    actionId: newId("action"),
    type: "nachricht.senden",
    actor: "besitzer",
    target: { conversationId: newId("conversation"), messageId: newId("message") },
  };
}

export function sendFacts(inputChars = 812) {
  return {
    credential: "sitzung" as const,
    inputChars,
    maxInputChars: 32000,
    conversationExists: true,
    runActive: false,
    killSwitch: false,
  };
}

/** Signiert einen Entwurf als nächsten Eintrag nach `prev`. */
export async function signedEntry(
  draft: ReceiptDraft,
  prev: ReceiptEntry | undefined,
  key: TestKey,
  time = new Date(Date.UTC(2026, 10, 20, 10, 0, 0)),
): Promise<ReceiptEntry> {
  const body = buildReceipt(draft, {
    id: newId("receipt"),
    seq: (prev?.seq ?? 0) + 1,
    time: time.toISOString(),
    prev: prev?.hash ?? `sha256:${"0".repeat(64)}`,
    keyId: key.keyId,
  });
  const hash = await hashReceipt(body);
  return {
    seq: body.seq,
    id: body.id,
    hash,
    signature: testSign(key.privateKey, digestBytes(hash)),
    keyId: key.keyId,
    body,
  };
}

/**
 * Kette im Speicher: Start, danach abwechselnd Entscheidung und Ergebnis, insgesamt `count`
 * Einträge.
 */
export async function buildChain(count: number, key: TestKey): Promise<ReceiptEntry[]> {
  const entries: ReceiptEntry[] = [];
  let prev = await signedEntry(
    {
      type: "start",
      facts: { installationId: TEST_INSTALLATION, publicKey: key.publicKey, software: "0.3.0+dev" },
    },
    undefined,
    key,
  );
  entries.push(prev);
  let action = sendAction();
  while (entries.length < count) {
    const facts = sendFacts(entries.length);
    let draft: ReceiptDraft;
    if (entries.length % 2 === 1) {
      action = sendAction();
      draft = {
        type: "decision",
        action,
        decision: evaluate(action, facts, [TEST_RULE]),
        facts,
      };
    } else {
      draft = { type: "result", action, result: { status: "ok" } };
    }
    prev = await signedEntry(draft, prev, key);
    entries.push(prev);
  }
  return entries;
}

/**
 * Entscheidung wie vom Tor: aus den Regeln nachgerechnet, mit Prüfsumme der angewandten Regel und
 * dem Regelstand `stand`.
 */
export function testDecision(
  action: ActionRequest,
  facts: ReturnType<typeof sendFacts>,
  rules: readonly RuleVersion[] = [TEST_RULE],
  stand = 1,
): Decision {
  const decision = evaluate(action, facts, rules);
  return {
    ...decision,
    matchedRules: decision.matchedRules.map((ref) => {
      const rule = rules.find((r) => r.id === ref.id && r.version === ref.version);
      if (rule === undefined) throw new Error("Regel fehlt");
      return { id: ref.id, version: ref.version, hash: hashRule(rule) };
    }),
    ruleStand: stand,
  };
}

/** Tiefe Kopie, damit Manipulationen das Original nicht berühren. */
export function copy<T>(value: T): T {
  return structuredClone(value);
}
