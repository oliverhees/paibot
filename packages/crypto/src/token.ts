/**
 * PaiBot – zufällige Tokens, ihre Prüfsumme und HMAC.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { notImplemented } from "@paibot/stub";
import type { DerivedKey, KeyPurpose } from "./master";

/** Standardlänge eines Tokens in Byte (ergibt 43 Zeichen base64url). */
export const TOKEN_BYTES = 32;

/**
 * Erzeugt ein zufälliges Token aus `bytes` Byte, kodiert als base64url ohne Auffüllung.
 *
 * Zusagen: Zufall aus dem kryptografischen Zufallsgenerator; bei 32 Byte genau 43 Zeichen.
 * Wirft `RangeError`, wenn `bytes` keine Ganzzahl ab 16 ist.
 */
export function newToken(bytes: number = TOKEN_BYTES): string {
  return notImplemented("crypto.newToken", bytes);
}

/**
 * SHA-256 über die UTF-8-Bytes des Token-Textes, als 64 Hex-Zeichen klein. So wird ein Token
 * gespeichert (z. B. als ID der Sitzung); das Token selbst nie.
 */
export function hashToken(token: string): string {
  return notImplemented("crypto.hashToken", token);
}

/**
 * HMAC-SHA-256 mit einem abgeleiteten Schlüssel. Text wird als UTF-8 gelesen.
 *
 * Zusagen: Ergebnis sind genau 32 Rohbyte; deterministisch.
 */
export function hmac(key: DerivedKey<KeyPurpose>, data: string | Uint8Array): Uint8Array {
  return notImplemented("crypto.hmac", key, data);
}

/**
 * Kontext-Prüfsumme für Belege: HMAC-SHA-256 mit dem Schlüssel `context-v1`, Ergebnis als
 * `hmac-sha256:<64 Hex-Zeichen klein>`.
 */
export function contextDigest(key: DerivedKey<"context-v1">, data: string | Uint8Array): string {
  return notImplemented("crypto.contextDigest", key, data);
}
