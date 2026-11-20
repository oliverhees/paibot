/**
 * PaiBot – unabhängiger Prüfer für Belege und die ganze Kette; läuft ohne Datenbank und ohne
 * Node-APIs, also auch im Browser.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { evaluate } from "@paibot/gate";
import type { ActionRequest, Facts } from "@paibot/shared/aktionen";
import {
  type KeyChangeSigner,
  type PublicKeyInfo,
  type ReceiptBody,
  type ReceiptEntry,
  ZERO_PREV,
} from "@paibot/shared/belege";
import type { Sha256Digest } from "@paibot/shared/grundtypen";
import type { Decision, RuleDefinition, RuleRef } from "@paibot/shared/tor";
import { type CanonicalValue, canonicalize } from "./canonical";
import { digestBytes, hashReceipt } from "./hash";

export * from "./build";
export * from "./canonical";
export * from "./hash";
export * from "./jsonl";

/**
 * Einzelne Prüfungen, in dieser Reihenfolge. `kontext` braucht den Kontext-Schlüssel und läuft
 * nur auf dem Server (`checkContext`).
 */
export const CHECK_NAMES = ["inhalt", "signatur", "kette", "entscheidung", "kontext"] as const;
export type CheckName = (typeof CHECK_NAMES)[number];

/** `entfaellt`: die Prüfung trifft auf diesen Eintrag nicht zu oder es fehlen Daten dafür. */
export type CheckStatus = "ok" | "fehler" | "entfaellt";

export interface CheckResult {
  check: CheckName;
  status: CheckStatus;
  /** Laufende Nummer des geprüften Eintrags. */
  seq: number;
  /** Bei `signatur`: Kurzform des Schlüssels (`fingerprint`). */
  fingerprint?: string;
  /** Bei `entscheidung`: die Regel, aus der die Entscheidung folgt. */
  rule?: RuleRef;
}

export interface VerifyOptions {
  /**
   * Regel-Fassungen, die zum Zeitpunkt der Entscheidungen galten. Fehlen sie, ist die Prüfung
   * `entscheidung` `entfaellt`.
   */
  rules?: readonly RuleDefinition[];
}

/**
 * Prüft einen Eintrag (Prüfungen 1 bis 4):
 * - `inhalt`: Prüfsumme des Körpers neu berechnet gleich `entry.hash`.
 * - `signatur`: Ed25519 über die 32 Rohbyte von `entry.hash` mit dem öffentlichen Schlüssel von
 *   `entry.keyId` aus `publicKeys` (Web Crypto). Unbekannter Schlüssel → `fehler`.
 * - `kette`: `body.prev` gleich `prev.hash` und `seq` gleich `prev.seq + 1`; ohne `prev` muss
 *   `seq` 1 und `prev` `ZERO_PREV` sein.
 * - `entscheidung`: nur bei Typ `decision` und mit `options.rules`, sonst `entfaellt` (`reevaluate`).
 *
 * Zusagen: liefert immer genau vier Ergebnisse in der Reihenfolge von `CHECK_NAMES` ohne `kontext`;
 * wirft nicht bei manipulierten Daten, sondern meldet `fehler`. Erzeugt keinen Beleg.
 */
export function verifyReceipt(
  entry: ReceiptEntry,
  prev: ReceiptEntry | null,
  publicKeys: readonly PublicKeyInfo[],
  options?: VerifyOptions,
): Promise<CheckResult[]> {
  return checkEntry(entry, prev, new KeyRing(publicKeys), undefined, options);
}

/** Bericht über eine ganze Kette. */
export interface ChainReport {
  ok: boolean;
  /** Anzahl geprüfter Einträge. */
  checked: number;
  /** Kopf der Kette nach dem letzten Eintrag. */
  head?: { seq: number; hash: string };
  /** Erste Stelle, an der eine Prüfung `fehler` meldet, mit allen Ergebnissen dieses Eintrags. */
  firstFailure?: { seq: number; index: number; checks: CheckResult[] };
}

/**
 * Prüft eine Kette von Anfang an (erster Eintrag `seq` 1). Erkennt veränderte, gelöschte,
 * eingeschobene und vertauschte Einträge, fremde Signaturen und umgebogene `prev`.
 *
 * Zusagen: `ok` genau dann, wenn kein Eintrag `fehler` meldet; `firstFailure` nennt die erste
 * betroffene Stelle. Einträge des Typs `key_change` machen den neuen Schlüssel für die folgenden
 * Einträge gültig, sofern er in `publicKeys` steht.
 */
export async function verifyChain(
  entries: Iterable<ReceiptEntry> | AsyncIterable<ReceiptEntry>,
  publicKeys: readonly PublicKeyInfo[],
  options?: VerifyOptions,
): Promise<ChainReport> {
  const ring = new KeyRing(publicKeys);
  const state: ChainState = { activeKeyId: undefined };
  let prev: ReceiptEntry | null = null;
  let index = 0;
  let firstFailure: ChainReport["firstFailure"];

  for await (const entry of entries) {
    const checks = await checkEntry(entry, prev, ring, state, options);
    if (firstFailure === undefined && checks.some((check) => check.status === "fehler")) {
      firstFailure = { seq: seqOf(entry), index, checks };
    }
    advanceKeys(entry, state);
    prev = entry;
    index++;
  }

  const report: ChainReport = { ok: firstFailure === undefined, checked: index };
  if (prev !== null) report.head = { seq: seqOf(prev), hash: String(prev.hash) };
  if (firstFailure !== undefined) report.firstFailure = firstFailure;
  return report;
}

/** Ergebnis des Nachrechnens einer Entscheidung. */
export interface Reevaluation {
  status: CheckStatus;
  /** Was das Tor mit den gespeicherten Fakten und Regeln heute entscheidet. */
  expected?: Decision;
}

/**
 * Rechnet die Entscheidung eines Belegs `decision` aus den gespeicherten Fakten und den
 * Regel-Fassungen nach (`evaluate` des Tors, ohne KI). `ok`, wenn `outcome`, `stage`, `rules` und
 * `limits` übereinstimmen; `fehler` bei Abweichung; `entfaellt` bei anderen Typen.
 */
export function reevaluate(entry: ReceiptEntry, rules: readonly RuleDefinition[]): Reevaluation {
  const body = entry.body as ReceiptBody | undefined;
  if (body?.type !== "decision") return { status: "entfaellt" };

  let expected: Decision;
  try {
    expected = evaluate(body.action as ActionRequest, body.facts as unknown as Facts, rules);
  } catch {
    return { status: "fehler" };
  }

  const recorded = body.decision;
  const same =
    expected.outcome === recorded.outcome &&
    expected.stage === recorded.stage &&
    sameValue(expected.matchedRules.map(ruleRef), recorded.rules.map(ruleRef)) &&
    sameValue(expected.limits, recorded.limits);
  return { status: same ? "ok" : "fehler", expected };
}

/**
 * Wer einen Beleg `key_change` signiert hat: der Wert von `facts.signedBy`, also `previous` (der
 * alte Schlüssel, Regelfall) oder `new` (der alte Schlüssel war nicht mehr vorhanden). Geprüft wird,
 * dass der Schlüssel `entry.keyId` in `publicKeys` steht und dazu passt: bei `new` ist sein
 * öffentlicher Schlüssel gleich `facts.publicKey`. `undefined` bei anderen Typen, unbekanntem
 * Schlüssel oder wenn die Angabe nicht passt.
 */
export function keyChangeSigner(
  entry: ReceiptEntry,
  publicKeys: readonly PublicKeyInfo[],
): KeyChangeSigner | undefined {
  const body = entry.body as ReceiptBody | undefined;
  if (body?.type !== "key_change") return undefined;
  const { facts } = body;
  const key = publicKeys.find((info) => info.keyId === entry.keyId);
  if (key === undefined || entry.keyId !== body.keyId) return undefined;
  if (facts.signedBy === "new") {
    return entry.keyId === facts.newKeyId && key.publicKey === facts.publicKey ? "new" : undefined;
  }
  if (facts.signedBy === "previous") {
    return facts.previousKeyId !== undefined && entry.keyId === facts.previousKeyId
      ? "previous"
      : undefined;
  }
  return undefined;
}

// ---------------------------------------------------------------------------------------------
// Interne Hilfen. Alles hier läuft nur mit Web Crypto (`globalThis.crypto.subtle`).

/** Welcher Schlüssel in der Kette gerade neue Einträge signieren darf. */
interface ChainState {
  activeKeyId: string | undefined;
}

/** Öffentliche Schlüssel mit importiertem Web-Crypto-Schlüssel und Kurzform, je einmal berechnet. */
class KeyRing {
  readonly infos: readonly PublicKeyInfo[];
  readonly #imported = new Map<string, Promise<ImportedKey | undefined>>();

  constructor(infos: readonly PublicKeyInfo[]) {
    this.infos = infos;
  }

  info(keyId: string): PublicKeyInfo | undefined {
    return this.infos.find((info) => info.keyId === keyId);
  }

  imported(publicKey: string): Promise<ImportedKey | undefined> {
    let cached = this.#imported.get(publicKey);
    if (cached === undefined) {
      cached = importPublicKey(publicKey);
      this.#imported.set(publicKey, cached);
    }
    return cached;
  }
}

interface ImportedKey {
  key: CryptoKey;
  fingerprint: string;
}

async function importPublicKey(publicKey: string): Promise<ImportedKey | undefined> {
  const raw = fromBase64Url(publicKey);
  if (raw === undefined || raw.length !== 32) return undefined;
  try {
    const key = await globalThis.crypto.subtle.importKey("raw", raw, { name: "Ed25519" }, false, [
      "verify",
    ]);
    const digest = new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", raw));
    const hex = Array.from(digest.subarray(0, 8), (byte) => byte.toString(16).padStart(2, "0"));
    const fingerprint = [0, 2, 4, 6].map((i) => `${hex[i]}${hex[i + 1]}`).join("-");
    return { key, fingerprint };
  } catch {
    return undefined;
  }
}

const BASE64URL_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

/** base64url ohne Auffüllung in Rohbyte; `undefined` bei anderer Form. */
function fromBase64Url(text: unknown): Uint8Array<ArrayBuffer> | undefined {
  if (typeof text !== "string" || !/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) {
    return undefined;
  }
  const bytes = new Uint8Array(Math.floor((text.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let position = 0;
  for (const char of text) {
    buffer = (buffer << 6) | BASE64URL_ALPHABET.indexOf(char);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[position++] = (buffer >> bits) & 0xff;
    }
  }
  // Übrige Bits müssen null sein, sonst gäbe es mehrere Schreibweisen für dieselben Bytes.
  if ((buffer & ((1 << bits) - 1)) !== 0) return undefined;
  return bytes;
}

function seqOf(entry: ReceiptEntry): number {
  return typeof entry.seq === "number" ? entry.seq : Number.NaN;
}

function ruleRef(rule: RuleRef): RuleRef {
  return { id: rule.id, version: rule.version };
}

function sameValue(a: unknown, b: unknown): boolean {
  try {
    return canonicalize(a as CanonicalValue) === canonicalize(b as CanonicalValue);
  } catch {
    return false;
  }
}

/** Nach einem Eintrag: Start und Schlüsselwechsel legen fest, wer als Nächstes signiert. */
function advanceKeys(entry: ReceiptEntry, state: ChainState): void {
  const body = entry.body as ReceiptBody | undefined;
  if (body?.type === "start") state.activeKeyId = body.keyId;
  if (body?.type === "key_change") state.activeKeyId = body.facts.newKeyId;
}

async function checkEntry(
  entry: ReceiptEntry,
  prev: ReceiptEntry | null,
  ring: KeyRing,
  chain: ChainState | undefined,
  options: VerifyOptions | undefined,
): Promise<CheckResult[]> {
  const seq = seqOf(entry);
  const body = (entry.body ?? undefined) as ReceiptBody | undefined;
  const result = (check: CheckName, ok: boolean, extra?: Partial<CheckResult>): CheckResult => ({
    check,
    status: ok ? "ok" : "fehler",
    seq,
    ...extra,
  });

  const inhalt = result("inhalt", await contentMatches(entry, body));
  const signatur = await checkSignature(entry, body, ring, chain, seq);
  const kette = result("kette", linkMatches(entry, body, prev));
  const entscheidung = checkDecision(entry, body, seq, options);
  return [inhalt, signatur, kette, entscheidung];
}

async function contentMatches(
  entry: ReceiptEntry,
  body: ReceiptBody | undefined,
): Promise<boolean> {
  if (body === undefined || typeof body !== "object" || entry.id !== body.id) return false;
  try {
    return (await hashReceipt(body)) === entry.hash;
  } catch {
    return false;
  }
}

function linkMatches(
  entry: ReceiptEntry,
  body: ReceiptBody | undefined,
  prev: ReceiptEntry | null,
): boolean {
  if (body === undefined || typeof body !== "object") return false;
  if (entry.seq !== body.seq || !Number.isSafeInteger(body.seq)) return false;
  // Nur der erste Eintrag ist ein Start, und der erste Eintrag ist immer ein Start.
  if ((body.seq === 1) !== (body.type === "start")) return false;
  if (prev === null) return body.seq === 1 && body.prev === ZERO_PREV;
  return body.prev === prev.hash && body.seq === seqOf(prev) + 1;
}

async function checkSignature(
  entry: ReceiptEntry,
  body: ReceiptBody | undefined,
  ring: KeyRing,
  chain: ChainState | undefined,
  seq: number,
): Promise<CheckResult> {
  const fail: CheckResult = { check: "signatur", status: "fehler", seq };
  if (body === undefined || typeof body !== "object" || entry.keyId !== body.keyId) return fail;
  const info = ring.info(entry.keyId);
  if (info === undefined) return fail;
  const imported = await ring.imported(info.publicKey);
  if (imported === undefined) return fail;

  if (!(await signatureMatches(imported.key, entry.hash, entry.signature))) {
    return { ...fail, fingerprint: imported.fingerprint };
  }
  if (!signerAllowed(entry, body, info, ring, chain)) {
    return { ...fail, fingerprint: imported.fingerprint };
  }
  return { check: "signatur", status: "ok", seq, fingerprint: imported.fingerprint };
}

async function signatureMatches(
  key: CryptoKey,
  hash: Sha256Digest,
  signature: string,
): Promise<boolean> {
  const signatureBytes = fromBase64Url(signature);
  if (signatureBytes === undefined || signatureBytes.length !== 64) return false;
  let digest: Uint8Array;
  try {
    digest = digestBytes(hash);
  } catch {
    return false;
  }
  try {
    return await globalThis.crypto.subtle.verify(
      { name: "Ed25519" },
      key,
      signatureBytes,
      new Uint8Array(digest),
    );
  } catch {
    return false;
  }
}

/**
 * Darf dieser Schlüssel den Eintrag signieren? Der Start nennt den eigenen öffentlichen Schlüssel;
 * ein Schlüsselwechsel muss zu `signedBy` passen; alle anderen Einträge signiert der Schlüssel, der
 * in der Kette gerade gilt (nur bei der Prüfung einer ganzen Kette bekannt).
 */
function signerAllowed(
  entry: ReceiptEntry,
  body: ReceiptBody,
  info: PublicKeyInfo,
  ring: KeyRing,
  chain: ChainState | undefined,
): boolean {
  const active = chain?.activeKeyId;
  switch (body.type) {
    case "start":
      return (
        body.facts.publicKey === info.publicKey && (chain === undefined || active === undefined)
      );
    case "key_change": {
      const signer = keyChangeSigner(entry, ring.infos);
      if (signer === undefined) return false;
      // Steht der neue Schlüssel in der Liste, muss er derselbe sein wie im Beleg.
      const next = ring.info(body.facts.newKeyId);
      if (next !== undefined && next.publicKey !== body.facts.publicKey) return false;
      if (chain === undefined) return true;
      if (signer === "previous") return active !== undefined && entry.keyId === active;
      return body.facts.previousKeyId === undefined || body.facts.previousKeyId === active;
    }
    default:
      return chain === undefined || entry.keyId === active;
  }
}

function checkDecision(
  entry: ReceiptEntry,
  body: ReceiptBody | undefined,
  seq: number,
  options: VerifyOptions | undefined,
): CheckResult {
  if (body?.type !== "decision" || options?.rules === undefined) {
    return { check: "entscheidung", status: "entfaellt", seq };
  }
  const { status } = reevaluate(entry, options.rules);
  const rule = body.decision.rules[0];
  if (status === "ok" && rule !== undefined) {
    return { check: "entscheidung", status, seq, rule: ruleRef(rule) };
  }
  return { check: "entscheidung", status, seq };
}
