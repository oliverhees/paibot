/**
 * PaiBot – Prüfsumme eines Belegs über seine kanonische Form (SHA-256 über Web Crypto).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { ReceiptBody } from "@paibot/shared/belege";
import type { Sha256Digest } from "@paibot/shared/grundtypen";
import { type CanonicalValue, canonicalize } from "./canonical";

/** Präfix vor der kanonischen Form beim Hashen: `pb-beleg/v1` und ein Zeilenumbruch (12 Byte). */
export const RECEIPT_HASH_PREFIX = "pb-beleg/v1\n";

/**
 * `sha256:<64 Hex klein>` über `utf8(RECEIPT_HASH_PREFIX) ‖ utf8(canonicalize(body))`.
 *
 * Zusagen: nutzt nur `globalThis.crypto.subtle` und läuft damit in Node und im Browser.
 * Fehler: `CanonicalizeError`, wenn der Körper nicht kanonisierbar ist.
 */
export async function hashReceipt(body: ReceiptBody): Promise<Sha256Digest> {
  const canonical = canonicalize(body as unknown as CanonicalValue);
  const encoder = new TextEncoder();
  const prefix = encoder.encode(RECEIPT_HASH_PREFIX);
  const content = encoder.encode(canonical);
  const input = new Uint8Array(prefix.length + content.length);
  input.set(prefix, 0);
  input.set(content, prefix.length);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", input);
  return `sha256:${toHex(new Uint8Array(digest))}`;
}

const DIGEST_PATTERN = /^sha256:([0-9a-f]{64})$/;

function toHex(bytes: Uint8Array): string {
  let text = "";
  for (const byte of bytes) text += byte.toString(16).padStart(2, "0");
  return text;
}

/**
 * Die 32 Rohbyte einer Prüfsumme `sha256:<hex>`; über sie wird signiert.
 * Fehler: `TypeError` bei anderer Form.
 */
export function digestBytes(digest: Sha256Digest): Uint8Array {
  const match = typeof digest === "string" ? DIGEST_PATTERN.exec(digest) : null;
  const hex = match?.[1];
  if (hex === undefined) throw new TypeError("Prüfsumme hat nicht die Form sha256:<64 Hex>.");
  const bytes = new Uint8Array(32);
  for (let index = 0; index < 32; index++) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}
