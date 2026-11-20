/**
 * PaiBot – Kodierungen für Bytes: base64url ohne Auffüllung und Hex in Kleinbuchstaben.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { createHash, timingSafeEqual } from "node:crypto";
import { CryptoError } from "./errors";

/** base64url ohne Auffüllung, beliebige Länge. */
export const BASE64URL_PATTERN = /^[A-Za-z0-9_-]*$/;

/** Hex in Kleinbuchstaben. */
export const HEX_PATTERN = /^(?:[0-9a-f]{2})*$/;

/** Kodiert Bytes als base64url ohne Auffüllung (`=`). */
export function toBase64Url(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64url");
}

/**
 * Dekodiert base64url ohne Auffüllung. Wirft `CryptoError("format_ungueltig")` bei Zeichen
 * außerhalb des Alphabets, bei Auffüllung und bei einer Länge, die kein ganzes Byte ergibt.
 */
export function fromBase64Url(text: string): Uint8Array {
  if (typeof text !== "string" || !BASE64URL_PATTERN.test(text) || text.length % 4 === 1) {
    throw new CryptoError("format_ungueltig");
  }
  const bytes = new Uint8Array(Buffer.from(text, "base64url"));
  // Nur die eine, kanonische Schreibweise zulassen (keine verdeckten Zusatzbits am Ende).
  if (toBase64Url(bytes) !== text) throw new CryptoError("format_ungueltig");
  return bytes;
}

/** Kodiert Bytes als Hex in Kleinbuchstaben. */
export function toHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

/** Dekodiert Hex in Kleinbuchstaben. Wirft `CryptoError("format_ungueltig")` bei anderem Text. */
export function fromHex(text: string): Uint8Array {
  if (typeof text !== "string" || !HEX_PATTERN.test(text))
    throw new CryptoError("format_ungueltig");
  return new Uint8Array(Buffer.from(text, "hex"));
}

/**
 * Vergleicht zwei Texte in konstanter Zeit (bezogen auf die Länge des längeren). Für Tokens,
 * Prüfzeichen und Codes. Unterschiedliche Längen ergeben `false`, ohne früh abzubrechen.
 */
export function safeEqual(a: string, b: string): boolean {
  // Beide Texte werden auf feste Länge (SHA-256) gebracht, so hängt die Vergleichszeit nicht davon ab,
  // wo oder ob sich die Texte unterscheiden.
  const digestA = createHash("sha256").update(a, "utf8").digest();
  const digestB = createHash("sha256").update(b, "utf8").digest();
  const sameDigest = timingSafeEqual(digestA, digestB);
  const sameLength = Buffer.byteLength(a, "utf8") === Buffer.byteLength(b, "utf8");
  return sameDigest && sameLength;
}
