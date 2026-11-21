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

import {
  type ChainAnchor,
  type ChainFinding,
  type ChainProblem,
  type ChainVerdict,
  chainTrustLevel,
  type KeyChangeSigner,
  type PublicKeyInfo,
  type ReceiptBody,
  type ReceiptEntry,
  ZERO_PREV,
} from "@paibot/shared/belege";
import type { Sha256Digest } from "@paibot/shared/grundtypen";
import type { KeyId } from "@paibot/shared/ids";
import type { StoredRuleRef } from "@paibot/shared/tor";
import { type CanonicalValue, canonicalize } from "./canonical";
import { digestBytes, hashReceipt } from "./hash";
import {
  type ReevaluationProblem,
  type RuleHistory,
  type RuleVersion,
  reevaluate,
} from "./nachrechnen";

export * from "./build";
export * from "./canonical";
export * from "./hash";
export * from "./jsonl";
export * from "./nachrechnen";

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
  /** Bei `entscheidung`: die Regel, aus der die Entscheidung folgt bzw. die nicht passt. */
  rule?: StoredRuleRef;
  /** Bei `entscheidung`: Regelstand des Nachrechnens (`nicht_festgehalten` bei älteren Belegen). */
  ruleStand?: number | "nicht_festgehalten";
  /** Bei `entscheidung` mit `fehler`: der Grund. */
  problem?: ReevaluationProblem;
}

export interface VerifyOptions {
  /**
   * Regel-Fassungen zum Nachrechnen, am besten das Regel-Protokoll mit `seq`. Fehlen sie, ist die
   * Prüfung `entscheidung` `entfaellt`.
   */
  rules?: readonly RuleVersion[];
}

/** Optionen für die Prüfung einer ganzen Kette. */
export interface ChainVerifyOptions extends VerifyOptions {
  /** Regel-Fassungen aus einer Quelle wie der Datenbank (statt `rules`). */
  ruleHistory?: RuleHistory;
  /**
   * Außerhalb aufbewahrter Anker (`createAnchor`). Nur mit ihm fallen eine am Ende gekürzte und
   * eine ganz ausgetauschte Kette auf.
   */
  anchor?: ChainAnchor;
  /**
   * Öffentliche Schlüssel von anderswo (z. B. aus der Datenbank oder dem Kopf eines Exports). Sie
   * dienen nur dem Vergleich: Geprüft wird mit den Schlüsseln aus der Kette; nennt die Liste unter
   * derselben Kennung einen anderen Schlüssel, ist das `schluessel_nicht_aus_kette`.
   */
  publicKeys?: readonly PublicKeyInfo[];
}

/**
 * Prüft einen einzelnen Eintrag (Prüfungen 1 bis 4) mit den Schlüsseln aus `publicKeys`:
 * - `inhalt`: Prüfsumme des Körpers neu berechnet gleich `entry.hash`.
 * - `signatur`: Ed25519 über die 32 Rohbyte von `entry.hash` mit dem öffentlichen Schlüssel von
 *   `entry.keyId` aus `publicKeys` (Web Crypto). Unbekannter Schlüssel → `fehler`.
 * - `kette`: `body.prev` gleich `prev.hash` und `seq` gleich `prev.seq + 1`; ohne `prev` muss
 *   `seq` 1 und `prev` `ZERO_PREV` sein.
 * - `entscheidung`: nur bei Typ `decision` und mit `options.rules`, sonst `entfaellt` (`reevaluate`).
 *
 * Ein einzelner Eintrag kennt die Kette nicht; ob sein Schlüssel aus der Kette folgt, sagt nur
 * `verifyChain`.
 *
 * Zusagen: liefert immer genau vier Ergebnisse in der Reihenfolge von `CHECK_NAMES` ohne `kontext`;
 * wirft nicht bei manipulierten Daten, sondern meldet `fehler`. Erzeugt keinen Beleg.
 */
export async function verifyReceipt(
  entry: ReceiptEntry,
  prev: ReceiptEntry | null,
  publicKeys: readonly PublicKeyInfo[],
  options?: VerifyOptions,
): Promise<CheckResult[]> {
  const seq = seqOf(entry);
  const body = (entry.body ?? undefined) as ReceiptBody | undefined;
  return [
    { check: "inhalt", status: (await contentMatches(entry, body)) ? "ok" : "fehler", seq },
    await listSignature(entry, body, new KeyRing(publicKeys), seq),
    { check: "kette", status: linkMatches(entry, body, prev) ? "ok" : "fehler", seq },
    await checkDecision(entry, body, seq, options?.rules, undefined),
  ];
}

/** Bericht über eine ganze Kette. */
export interface ChainReport {
  /** `true` genau dann, wenn das Urteil `vertrauenswuerdig` ist. */
  ok: boolean;
  /** Anzahl geprüfter Einträge. */
  checked: number;
  /** Kopf der Kette nach dem letzten Eintrag. */
  head?: { seq: number; hash: string };
  /** Erste Stelle, an der eine Prüfung `fehler` meldet, mit allen Ergebnissen dieses Eintrags. */
  firstFailure?: { seq: number; index: number; checks: CheckResult[] };
  /** Urteil über die Kette: Stufe, Probleme, ob ein Anker geprüft wurde. */
  verdict: ChainVerdict;
  /**
   * Ab dieser Nummer sind die Belege nicht vom ursprünglichen Schlüssel beglaubigt (erster
   * Schlüsselwechsel, den nur der neue Schlüssel signiert hat).
   */
  notAttestedFrom?: number;
}

/**
 * Prüft eine Kette von Anfang an (erster Eintrag `seq` 1). Erkennt veränderte, gelöschte,
 * eingeschobene und vertauschte Einträge, fremde Signaturen und umgebogene `prev`.
 *
 * Schlüssel kommen nur aus der Kette selbst: der Start-Beleg nennt den ersten
 * (`facts.publicKey`), ein Schlüsselwechsel den nächsten. Beglaubigt ist ein Wechsel nur, wenn ihn
 * der bisherige Schlüssel signiert hat; signiert ihn nur der neue, meldet der Prüfer
 * `schluesselwechsel_nicht_beglaubigt` (Stufe `vertrauen_gebrochen`), prüft mit dem neuen Schlüssel
 * weiter, und alle Belege ab dort gelten als nicht beglaubigt (`notAttestedFrom`). Ein Beleg mit
 * einem Schlüssel, der nicht so aus der Kette folgt, ist `schluessel_nicht_aus_kette`.
 *
 * Mit `anchor` wird zusätzlich verglichen: gleiche Installation, gleicher Anfang, die Kette reicht
 * mindestens bis `anchor.seq`, und dort stehen dieselbe Prüfsumme und derselbe Schlüssel.
 *
 * Grenze: Ohne Anker lässt sich nicht erkennen, dass am Ende Belege fehlen oder dass jemand die
 * ganze Kette mit einem eigenen Schlüssel neu geschrieben hat.
 *
 * Aufruf auch noch als `verifyChain(entries, publicKeys, options)`; die Liste dient dann ebenfalls
 * nur dem Vergleich.
 */
export function verifyChain(
  entries: Iterable<ReceiptEntry> | AsyncIterable<ReceiptEntry>,
  options?: ChainVerifyOptions,
): Promise<ChainReport>;
/** @deprecated Schlüssel über `options.publicKeys` übergeben; sie dienen nur dem Vergleich. */
export function verifyChain(
  entries: Iterable<ReceiptEntry> | AsyncIterable<ReceiptEntry>,
  publicKeys: readonly PublicKeyInfo[],
  options?: ChainVerifyOptions,
): Promise<ChainReport>;
export async function verifyChain(
  entries: Iterable<ReceiptEntry> | AsyncIterable<ReceiptEntry>,
  second?: readonly PublicKeyInfo[] | ChainVerifyOptions,
  third?: ChainVerifyOptions,
): Promise<ChainReport> {
  const options: ChainVerifyOptions = Array.isArray(second)
    ? { ...third, publicKeys: second as readonly PublicKeyInfo[] }
    : ((second as ChainVerifyOptions | undefined) ?? {});
  const state: ChainKeys = { keys: new Map(), active: undefined, imported: new Map() };
  const findings: ChainFinding[] = [];
  let start: ReceiptEntry | undefined;
  let atAnchor: ReceiptEntry | undefined;
  let prev: ReceiptEntry | null = null;
  let index = 0;
  let firstFailure: ChainReport["firstFailure"];
  let notAttestedFrom: number | undefined;
  const actions = new ActionLedger();
  let chainFormat = 1;

  for await (const entry of entries) {
    const seq = seqOf(entry);
    const body = (entry.body ?? undefined) as ReceiptBody | undefined;
    if (index === 0) start = entry;
    if (options.anchor !== undefined && seq === options.anchor.seq) atAnchor = entry;

    const signature = await chainSignature(entry, body, state, seq);
    for (const problem of signature.problems) {
      findings.push({
        problem,
        ...(Number.isSafeInteger(seq) && seq > 0 ? { seq } : {}),
        ...(signature.keyId === undefined ? {} : { keyId: signature.keyId }),
      });
      if (problem === "schluesselwechsel_nicht_beglaubigt") notAttestedFrom ??= seq;
    }
    const checks: CheckResult[] = [
      { check: "inhalt", status: (await contentMatches(entry, body)) ? "ok" : "fehler", seq },
      signature.result,
      { check: "kette", status: linkMatches(entry, body, prev) ? "ok" : "fehler", seq },
      await checkDecision(entry, body, seq, options.rules, options.ruleHistory),
    ];
    if (firstFailure === undefined && checks.some((check) => check.status === "fehler")) {
      firstFailure = { seq, index, checks };
    }
    advanceKeys(body, state);
    if (index === 0 && body?.type === "start") chainFormat = body.facts.format ?? 1;
    for (const problem of actions.record(body, chainFormat)) {
      findings.push({ problem, ...(Number.isSafeInteger(seq) && seq > 0 ? { seq } : {}) });
    }
    prev = entry;
    index++;
  }

  compareKeys(state, options.publicKeys, findings);
  if (options.anchor !== undefined) compareAnchor(options.anchor, start, atAnchor, prev, findings);

  const level = chainTrustLevel(findings, firstFailure === undefined);
  const report: ChainReport = {
    ok: level === "vertrauenswuerdig",
    checked: index,
    verdict: {
      level,
      findings,
      anchor: options.anchor === undefined ? "fehlt" : "geprueft",
    },
  };
  if (prev !== null) report.head = { seq: seqOf(prev), hash: String(prev.hash) };
  if (firstFailure !== undefined) report.firstFailure = firstFailure;
  if (notAttestedFrom !== undefined) report.notAttestedFrom = notAttestedFrom;
  return report;
}

/**
 * Anker der Kette aus ihrem ersten Eintrag (Start) und ihrem letzten Eintrag. Als Text zum
 * Aufbewahren: `encodeAnchor(anchor)` aus `@paibot/shared/belege`.
 *
 * Fehler: `TypeError`, wenn `start` kein Start-Beleg mit `seq` 1 ist oder `head` vor ihm liegt.
 */
export function createAnchor(
  start: ReceiptEntry,
  head: ReceiptEntry,
  time: Date | string = new Date(),
): ChainAnchor {
  const body = start.body as ReceiptBody | undefined;
  if (body?.type !== "start" || start.seq !== 1) {
    throw new TypeError("Der erste Eintrag ist kein Start-Beleg.");
  }
  if (!Number.isSafeInteger(head.seq) || head.seq < 1) {
    throw new TypeError("Der letzte Eintrag hat keine gültige Nummer.");
  }
  return {
    format: "pb-anker",
    v: 1,
    installationId: body.facts.installationId,
    seq: head.seq,
    hash: head.hash,
    keyId: head.keyId,
    startKeyId: body.keyId,
    startPublicKey: body.facts.publicKey,
    time: typeof time === "string" ? time : time.toISOString(),
  };
}

/**
 * Wer einen Beleg `key_change` signiert hat: der Wert von `facts.signedBy`, also `previous` (der
 * alte Schlüssel, Regelfall) oder `new` (der alte Schlüssel war nicht mehr vorhanden). Geprüft wird,
 * dass der Schlüssel `entry.keyId` in `publicKeys` steht und dazu passt: bei `new` ist sein
 * öffentlicher Schlüssel gleich `facts.publicKey`. `undefined` bei anderen Typen, unbekanntem
 * Schlüssel oder wenn die Angabe nicht passt. Nur `previous` beglaubigt den neuen Schlüssel.
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
// Interne Hilfen.

/**
 * Hält je Aktion fest, was die Kette über sie sagt: Ein Ergebnis braucht vorher genau eine
 * Entscheidung derselben Aktion (gleiche Aktion, gleicher Akteur, gleiches Ziel); „ok“, „error“ und
 * „cancelled“ nur nach „allow“, „denied“ nur nach einer anderen Entscheidung; jede Aktion hat höchstens
 * eine Entscheidung und ein Ergebnis. Ab Fassung 2 der Kette trägt jede Entscheidung Regelstand und
 * Prüfsummen.
 */
class ActionLedger {
  readonly #decisions = new Map<string, { outcome: string; action: string }>();
  readonly #results = new Set<string>();

  record(body: ReceiptBody | undefined, format: number): ChainProblem[] {
    if (body?.type === "decision") {
      const problems: ChainProblem[] = [];
      const id = String(body.action?.actionId);
      if (this.#decisions.has(id)) problems.push("aktion_doppelt");
      else this.#decisions.set(id, { outcome: body.decision?.outcome, action: actionKey(body) });
      const decision = body.decision;
      if (
        format >= 2 &&
        (decision?.ruleStand === undefined ||
          (decision.rules ?? []).some((rule) => rule.hash === undefined))
      ) {
        problems.push("regelstand_fehlt");
      }
      return problems;
    }
    if (body?.type === "result") {
      const id = String(body.action?.actionId);
      if (this.#results.has(id)) return ["aktion_doppelt"];
      this.#results.add(id);
      const decision = this.#decisions.get(id);
      if (decision === undefined) return ["ergebnis_ohne_entscheidung"];
      const allowed = decision.outcome === "allow";
      const denied = body.result?.status === "denied";
      if (decision.action !== actionKey(body) || allowed === denied) {
        return ["ergebnis_passt_nicht_zur_entscheidung"];
      }
    }
    return [];
  }
}

function actionKey(body: Extract<ReceiptBody, { type: "decision" | "result" }>): string {
  try {
    return canonicalize(body.action as unknown as CanonicalValue);
  } catch {
    return "";
  }
}

// Die Hilfen ab hier laufen nur mit Web Crypto (`globalThis.crypto.subtle`).

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

/** Schlüssel, die aus der Kette folgen, und der gerade aktive. */
interface ChainKeys {
  /** Jede Kennung mit dem öffentlichen Schlüssel, den die Kette für sie nennt. */
  keys: Map<string, string>;
  active: { keyId: string; publicKey: string } | undefined;
  imported: Map<string, Promise<ImportedKey | undefined>>;
}

function importOnce(state: ChainKeys, publicKey: string): Promise<ImportedKey | undefined> {
  let cached = state.imported.get(publicKey);
  if (cached === undefined) {
    cached = importPublicKey(publicKey);
    state.imported.set(publicKey, cached);
  }
  return cached;
}

interface ChainSignature {
  result: CheckResult;
  problems: ("schluessel_nicht_aus_kette" | "schluesselwechsel_nicht_beglaubigt")[];
  keyId?: KeyId;
}

/**
 * Signatur eines Eintrags mit dem Schlüssel, der an dieser Stelle aus der Kette folgt:
 * - Start: der eigene `facts.publicKey`, nur solange noch kein Schlüssel aktiv ist.
 * - Schlüsselwechsel mit `previous`: der aktive Schlüssel. Mit `new`: der neue Schlüssel, dazu das
 *   Problem `schluesselwechsel_nicht_beglaubigt`. `previousKeyId` muss der aktive Schlüssel sein.
 * - alle anderen: der aktive Schlüssel; eine andere Kennung ist `schluessel_nicht_aus_kette`.
 */
async function chainSignature(
  entry: ReceiptEntry,
  body: ReceiptBody | undefined,
  state: ChainKeys,
  seq: number,
): Promise<ChainSignature> {
  const fail = (
    problems: ChainSignature["problems"] = [],
    fingerprint?: string,
  ): ChainSignature => ({
    result: { check: "signatur", status: "fehler", seq, ...(fingerprint ? { fingerprint } : {}) },
    problems,
    ...(typeof entry.keyId === "string" ? { keyId: entry.keyId as KeyId } : {}),
  });
  if (body === undefined || typeof body !== "object" || entry.keyId !== body.keyId) return fail();

  let publicKey: string;
  const problems: ChainSignature["problems"] = [];
  const active = state.active;
  switch (body.type) {
    case "start":
      if (active !== undefined) return fail();
      publicKey = body.facts.publicKey;
      break;
    case "key_change": {
      const { facts } = body;
      if (active === undefined) return fail();
      if (facts.previousKeyId !== undefined && facts.previousKeyId !== active.keyId) return fail();
      if (facts.signedBy === "previous" && entry.keyId === active.keyId) {
        publicKey = active.publicKey;
      } else if (facts.signedBy === "new" && entry.keyId === facts.newKeyId) {
        publicKey = facts.publicKey;
        problems.push("schluesselwechsel_nicht_beglaubigt");
      } else {
        return fail(["schluessel_nicht_aus_kette"]);
      }
      // Eine Kennung, die die Kette schon kennt, darf nicht für einen anderen Schlüssel stehen.
      const known = state.keys.get(facts.newKeyId);
      if (known !== undefined && known !== facts.publicKey)
        return fail(["schluessel_nicht_aus_kette"]);
      break;
    }
    default:
      if (active === undefined) return fail();
      if (entry.keyId !== active.keyId) return fail(["schluessel_nicht_aus_kette"]);
      publicKey = active.publicKey;
  }

  const imported = await importOnce(state, publicKey);
  if (imported === undefined) return fail();
  if (!(await signatureMatches(imported.key, entry.hash, entry.signature))) {
    return fail([], imported.fingerprint);
  }
  return {
    result: { check: "signatur", status: "ok", seq, fingerprint: imported.fingerprint },
    problems,
    keyId: entry.keyId,
  };
}

/** Nach einem Eintrag: Start und Schlüsselwechsel legen fest, wer als Nächstes signiert. */
function advanceKeys(body: ReceiptBody | undefined, state: ChainKeys): void {
  if (body === undefined || typeof body !== "object") return;
  if (body.type === "start" && state.active === undefined) {
    state.active = { keyId: body.keyId, publicKey: body.facts.publicKey };
    state.keys.set(body.keyId, body.facts.publicKey);
  }
  if (body.type === "key_change" && state.active !== undefined) {
    state.active = { keyId: body.facts.newKeyId, publicKey: body.facts.publicKey };
    if (!state.keys.has(body.facts.newKeyId)) {
      state.keys.set(body.facts.newKeyId, body.facts.publicKey);
    }
  }
}

/** Nennt eine Liste von außen unter einer Kennung der Kette einen anderen Schlüssel? */
function compareKeys(
  state: ChainKeys,
  publicKeys: readonly PublicKeyInfo[] | undefined,
  findings: ChainFinding[],
): void {
  for (const info of publicKeys ?? []) {
    const fromChain = state.keys.get(info.keyId);
    if (fromChain !== undefined && fromChain !== info.publicKey) {
      findings.push({ problem: "schluessel_nicht_aus_kette", keyId: info.keyId as KeyId });
    }
  }
}

/** Vergleicht die Kette mit einem außerhalb aufbewahrten Anker. */
function compareAnchor(
  anchor: ChainAnchor,
  start: ReceiptEntry | undefined,
  atAnchor: ReceiptEntry | undefined,
  last: ReceiptEntry | null,
  findings: ChainFinding[],
): void {
  const startBody = start?.body as ReceiptBody | undefined;
  if (startBody?.type === "start") {
    if (startBody.facts.installationId !== anchor.installationId) {
      findings.push({ problem: "andere_installation", seq: 1 });
    }
    if (
      startBody.keyId !== anchor.startKeyId ||
      startBody.facts.publicKey !== anchor.startPublicKey
    ) {
      findings.push({ problem: "anderer_anfang_als_anker", seq: 1, keyId: startBody.keyId });
    }
  } else {
    findings.push({ problem: "anderer_anfang_als_anker" });
  }

  if (last === null || seqOf(last) < anchor.seq || atAnchor === undefined) {
    findings.push({ problem: "kette_kuerzer_als_anker", seq: anchor.seq });
    return;
  }
  if (atAnchor.hash !== anchor.hash) {
    findings.push({ problem: "kopf_abweichend", seq: anchor.seq });
  } else if (atAnchor.keyId !== anchor.keyId) {
    findings.push({ problem: "schluessel_nicht_aus_kette", seq: anchor.seq, keyId: anchor.keyId });
  }
}

/**
 * Signatur eines einzelnen Eintrags mit einer Liste von Schlüsseln (ohne Kette): Der Start nennt
 * den eigenen öffentlichen Schlüssel; ein Schlüsselwechsel muss zu `signedBy` passen.
 */
async function listSignature(
  entry: ReceiptEntry,
  body: ReceiptBody | undefined,
  ring: KeyRing,
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
  let allowed = true;
  if (body.type === "start") allowed = body.facts.publicKey === info.publicKey;
  if (body.type === "key_change") {
    const next = ring.info(body.facts.newKeyId);
    allowed =
      keyChangeSigner(entry, ring.infos) !== undefined &&
      (next === undefined || next.publicKey === body.facts.publicKey);
  }
  if (!allowed) return { ...fail, fingerprint: imported.fingerprint };
  return { check: "signatur", status: "ok", seq, fingerprint: imported.fingerprint };
}

async function checkDecision(
  entry: ReceiptEntry,
  body: ReceiptBody | undefined,
  seq: number,
  rules: readonly RuleVersion[] | undefined,
  history: RuleHistory | undefined,
): Promise<CheckResult> {
  const source = rules ?? history;
  if (body?.type !== "decision" || source === undefined) {
    return { check: "entscheidung", status: "entfaellt", seq };
  }
  const result = Array.isArray(source)
    ? reevaluate(entry, source as readonly RuleVersion[])
    : await reevaluate(entry, source as RuleHistory);
  const check: CheckResult = { check: "entscheidung", status: result.status, seq };
  if (result.ruleStand !== undefined) check.ruleStand = result.ruleStand;
  if (result.status === "ok") {
    const rule = body.decision.rules[0];
    if (rule !== undefined) check.rule = { id: rule.id, version: rule.version };
  } else {
    if (result.problem !== undefined) check.problem = result.problem;
    if (result.rule !== undefined) check.rule = result.rule;
  }
  return check;
}
