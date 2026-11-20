/**
 * PaiBot – Kodierungen für Bytes: base64url ohne Auffüllung und Hex in Kleinbuchstaben.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { notImplemented } from "@paibot/stub";

/** base64url ohne Auffüllung, beliebige Länge. */
export const BASE64URL_PATTERN = /^[A-Za-z0-9_-]*$/;

/** Hex in Kleinbuchstaben. */
export const HEX_PATTERN = /^(?:[0-9a-f]{2})*$/;

/** Kodiert Bytes als base64url ohne Auffüllung (`=`). */
export function toBase64Url(bytes: Uint8Array): string {
  return notImplemented("crypto.toBase64Url", bytes);
}

/**
 * Dekodiert base64url ohne Auffüllung. Wirft `CryptoError("format_ungueltig")` bei Zeichen
 * außerhalb des Alphabets, bei Auffüllung und bei einer Länge, die kein ganzes Byte ergibt.
 */
export function fromBase64Url(text: string): Uint8Array {
  return notImplemented("crypto.fromBase64Url", text);
}

/** Kodiert Bytes als Hex in Kleinbuchstaben. */
export function toHex(bytes: Uint8Array): string {
  return notImplemented("crypto.toHex", bytes);
}

/** Dekodiert Hex in Kleinbuchstaben. Wirft `CryptoError("format_ungueltig")` bei anderem Text. */
export function fromHex(text: string): Uint8Array {
  return notImplemented("crypto.fromHex", text);
}

/**
 * Vergleicht zwei Texte in konstanter Zeit (bezogen auf die Länge des längeren). Für Tokens,
 * Prüfzeichen und Codes. Unterschiedliche Längen ergeben `false`, ohne früh abzubrechen.
 */
export function safeEqual(a: string, b: string): boolean {
  return notImplemented("crypto.safeEqual", a, b);
}
