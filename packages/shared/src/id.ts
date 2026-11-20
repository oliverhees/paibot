/**
 * PaiBot – IDs mit Präfix pro Objektart: erzeugen, prüfen und als Zod-Schema validieren.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { z } from "zod";

/** Präfix jeder Objektart. Eine ID sieht so aus: `<präfix>_<26 Zeichen>`. */
export const ID_PREFIX = {
  conversation: "unt",
  message: "nac",
  run: "lau",
  bot: "bot",
  provider: "anb",
  model: "mod",
  owner: "bes",
  receipt: "blg",
  action: "akt",
  key: "sch",
  installation: "ins",
  rule: "reg",
} as const;

export type IdKind = keyof typeof ID_PREFIX;
export const ID_KINDS = Object.keys(ID_PREFIX) as IdKind[];

/** ID einer bestimmten Objektart. Eine Unterhaltungs-ID passt nicht dort, wo eine Bot-ID verlangt ist. */
export type Id<K extends IdKind> = string & z.$brand<K>;

export type ConversationId = Id<"conversation">;
export type MessageId = Id<"message">;
export type RunId = Id<"run">;
export type BotId = Id<"bot">;
export type ProviderId = Id<"provider">;
export type ModelId = Id<"model">;
export type OwnerId = Id<"owner">;
export type ReceiptId = Id<"receipt">;
export type ActionId = Id<"action">;
export type KeyId = Id<"key">;
export type InstallationId = Id<"installation">;
export type RuleRecordId = Id<"rule">;

/** Gesamtlänge einer ID: drei Zeichen Präfix, Unterstrich, 26 Zeichen. */
export const ID_LENGTH = 30;

const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";
const BODY = "[0-7][0-9a-hjkmnp-tv-z]{25}";

/** Muster für jede gültige ID, gleich welcher Art. */
export const ID_PATTERN = new RegExp(`^(${Object.values(ID_PREFIX).join("|")})_${BODY}$`);

const KIND_PATTERN = Object.fromEntries(
  ID_KINDS.map((kind) => [kind, new RegExp(`^${ID_PREFIX[kind]}_${BODY}$`)]),
) as Record<IdKind, RegExp>;

/** Kodiert eine Zahl bis 2^48 als `length` Zeichen Crockford-Base32, höchstwertiges Zeichen zuerst. */
function encodeTime(ms: number, length: number): string {
  let out = "";
  let rest = ms;
  for (let i = 0; i < length; i++) {
    out = ALPHABET.charAt(rest % 32) + out;
    rest = Math.floor(rest / 32);
  }
  return out;
}

/** Kodiert 80 Bit (10 Byte) als 16 Zeichen Crockford-Base32. */
function encodeRandom(bytes: Uint8Array): string {
  let out = "";
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += ALPHABET.charAt((buffer >> bits) & 31);
    }
    buffer &= (1 << bits) - 1;
  }
  return out;
}

const MAX_TIME = 2 ** 48 - 1;

/**
 * Erzeugt eine neue ID: 48 Bit Zeit in Millisekunden, danach 80 Bit Zufall aus Web Crypto.
 * IDs sortieren sich dadurch als Text nach ihrer Entstehungszeit (innerhalb derselben
 * Millisekunde zufällig).
 */
export function newId<K extends IdKind>(kind: K): Id<K> {
  const now = Date.now();
  if (now < 0 || now > MAX_TIME) throw new RangeError("Zeit außerhalb des ID-Bereichs");
  const random = new Uint8Array(10);
  globalThis.crypto.getRandomValues(random);
  return `${ID_PREFIX[kind]}_${encodeTime(now, 10)}${encodeRandom(random)}` as Id<K>;
}

/** Prüft, ob `value` eine ID genau dieser Art ist. */
export function isId<K extends IdKind>(kind: K, value: unknown): value is Id<K> {
  return typeof value === "string" && KIND_PATTERN[kind].test(value);
}

/** Zod-Schema, das genau IDs dieser Art annimmt. */
export function idSchema<K extends IdKind>(kind: K) {
  return z.string().regex(KIND_PATTERN[kind]).brand<K>();
}

/** Liest eine ID dieser Art; wirft einen `TypeError`, wenn der Wert nicht passt. */
export function parseId<K extends IdKind>(kind: K, value: unknown): Id<K> {
  if (!isId(kind, value)) throw new TypeError(`Keine gültige ID der Art ${kind}`);
  return value;
}
