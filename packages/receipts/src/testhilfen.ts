/**
 * PaiBot – Hilfen für die Tests des Beleg-Protokolls: Schlüssel, Signaturen und Kontext-Prüfsummen
 * mit `node:crypto`, eine einfache Regel-Auswertung und Ketten im Speicher.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import {
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  sign as nodeSign,
  verify as nodeVerify,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { ActionRequest } from "@paibot/shared/aktionen";
import type { PublicKeyInfo, ReceiptEntry } from "@paibot/shared/belege";
import { type KeyId, newId } from "@paibot/shared/ids";
import type { Decision, RuleDefinition } from "@paibot/shared/tor";
import { buildReceipt, type ReceiptDraft } from "./build";
import { digestBytes, hashReceipt } from "./hash";

const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");

export interface TestKey {
  keyId: KeyId;
  publicKey: string;
  privateKey: string;
  fingerprint: string;
}

function privateKeyObject(privateKey: string) {
  const seed = Buffer.from(privateKey, "base64url");
  if (seed.length !== 32) throw new Error("format_ungueltig");
  return createPrivateKey({
    key: Buffer.concat([PKCS8_ED25519_PREFIX, seed]),
    format: "der",
    type: "pkcs8",
  });
}

export function testPublicKeyOf(privateKey: string): string {
  const jwk = createPublicKey(privateKeyObject(privateKey)).export({ format: "jwk" });
  return String(jwk.x);
}

export function testFingerprint(publicKey: string): string {
  const hex = createHash("sha256").update(Buffer.from(publicKey, "base64url")).digest("hex");
  return [0, 4, 8, 12].map((i) => hex.slice(i, i + 4)).join("-");
}

export function testSign(privateKey: string, bytes: Uint8Array): string {
  return nodeSign(null, bytes, privateKeyObject(privateKey)).toString("base64url");
}

export function testKey(): TestKey {
  const privateKey = randomBytes(32).toString("base64url");
  const publicKey = testPublicKeyOf(privateKey);
  return { keyId: newId("key"), publicKey, privateKey, fingerprint: testFingerprint(publicKey) };
}

export function keyInfo(key: TestKey): PublicKeyInfo {
  return { keyId: key.keyId, publicKey: key.publicKey, fingerprint: key.fingerprint };
}

/** Ersatz für die Funktionen aus `@paibot/crypto`, die das Beleg-Paket aufruft. */
export const cryptoFake = {
  sign: testSign,
  publicKeyOf: testPublicKeyOf,
  fingerprint: testFingerprint,
  verify(publicKey: string, bytes: Uint8Array, signature: string): boolean {
    try {
      const key = createPublicKey({
        key: { kty: "OKP", crv: "Ed25519", x: publicKey },
        format: "jwk",
      });
      return nodeVerify(null, bytes, key, Buffer.from(signature, "base64url"));
    } catch {
      return false;
    }
  },
  contextDigest(key: Uint8Array, data: string | Uint8Array): string {
    return `hmac-sha256:${createHmac("sha256", key).update(data).digest("hex")}`;
  },
  safeEqual(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && timingSafeEqual(left, right);
  },
};

/**
 * Einfache Regel-Auswertung für die Tests: erste passende Regel nach Priorität, Bedingungen nur
 * mit `eq` und `in`; keine Grenzen.
 */
export function fakeEvaluate(
  action: ActionRequest,
  facts: Readonly<Record<string, unknown>>,
  rules: readonly RuleDefinition[],
): Decision {
  const values: Record<string, unknown> = {
    ...facts,
    akteur: action.actor === "besitzer" ? "besitzer" : "bot",
  };
  const rule = [...rules]
    .filter((r) => r.enabled && (r.action === "*" || r.action === action.type))
    .sort((a, b) => a.priority - b.priority)
    .find((r) =>
      r.conditions.every((c) =>
        c.op === "in"
          ? Array.isArray(c.value) && (c.value as unknown[]).includes(values[c.fact])
          : c.op === "eq" && values[c.fact] === c.value,
      ),
    );
  if (rule === undefined) {
    return { outcome: "ask", stage: "ask", matchedRules: [], limits: [], reason: "keine Regel" };
  }
  const outcome = rule.effect === "allow" ? "allow" : rule.effect;
  return {
    outcome,
    stage: rule.stage,
    matchedRules: [{ id: rule.id, version: rule.version }],
    limits: [],
    reason: rule.reason,
  };
}

/** Eine Regel für die Tests: erlaubt `nachricht.senden` mit Sitzung. */
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
  source: "standard",
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
        decision: fakeEvaluate(action, facts, [TEST_RULE]),
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

/** Tiefe Kopie, damit Manipulationen das Original nicht berühren. */
export function copy<T>(value: T): T {
  return structuredClone(value);
}
