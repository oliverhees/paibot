/**
 * PaiBot – Prüfsumme eines Belegs über seine kanonische Form (SHA-256 über Web Crypto).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { ReceiptBody } from "@paibot/shared/belege";
import type { Sha256Digest } from "@paibot/shared/grundtypen";
import { notImplemented } from "@paibot/stub";

/** Präfix vor der kanonischen Form beim Hashen: `pb-beleg/v1` und ein Zeilenumbruch (12 Byte). */
export const RECEIPT_HASH_PREFIX = "pb-beleg/v1\n";

/**
 * `sha256:<64 Hex klein>` über `utf8(RECEIPT_HASH_PREFIX) ‖ utf8(canonicalize(body))`.
 *
 * Zusagen: nutzt nur `globalThis.crypto.subtle` und läuft damit in Node und im Browser.
 * Fehler: `CanonicalizeError`, wenn der Körper nicht kanonisierbar ist.
 */
export function hashReceipt(body: ReceiptBody): Promise<Sha256Digest> {
  return notImplemented("receipts.hashReceipt", body);
}

/**
 * Die 32 Rohbyte einer Prüfsumme `sha256:<hex>`; über sie wird signiert.
 * Fehler: `TypeError` bei anderer Form.
 */
export function digestBytes(digest: Sha256Digest): Uint8Array {
  return notImplemented("receipts.digestBytes", digest);
}
