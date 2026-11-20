/**
 * PaiBot – Signaturschlüssel der Installation (Ed25519): erzeugen, signieren, prüfen, Kurzform.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { notImplemented } from "@paibot/stub";

/** Länge eines öffentlichen bzw. privaten Ed25519-Schlüssels in Rohbyte. */
export const SIGNING_KEY_BYTES = 32;

/** Länge einer Ed25519-Signatur in Rohbyte (86 Zeichen base64url). */
export const SIGNATURE_BYTES = 64;

/**
 * Schlüsselpaar der Installation. Beide Teile sind die 32 Rohbyte, kodiert als base64url ohne
 * Auffüllung (43 Zeichen). `privateKey` ist der Ed25519-Seed; er wird nur verschlüsselt
 * gespeichert (`encryptSecret` mit `keys-v1`).
 */
export interface SigningKeyPair {
  publicKey: string;
  privateKey: string;
}

/** Erzeugt ein neues, zufälliges Ed25519-Schlüsselpaar. */
export function generateSigningKey(): SigningKeyPair {
  return notImplemented("crypto.generateSigningKey");
}

/**
 * Leitet den öffentlichen Schlüssel aus dem privaten ab (beide base64url).
 *
 * Fehler: `CryptoError("format_ungueltig")`, wenn `privateKey` nicht 32 Rohbyte ergibt.
 */
export function publicKeyOf(privateKey: string): string {
  return notImplemented("crypto.publicKeyOf", privateKey);
}

/**
 * Signiert `bytes` mit Ed25519. Ergebnis: 64 Rohbyte als base64url ohne Auffüllung (86 Zeichen).
 *
 * Fehler: `CryptoError("format_ungueltig")` bei ungültigem privaten Schlüssel.
 */
export function sign(privateKey: string, bytes: Uint8Array): string {
  return notImplemented("crypto.sign", privateKey, bytes);
}

/**
 * Prüft eine Ed25519-Signatur.
 *
 * Zusagen: `true` nur bei gültiger Signatur; `false` bei falscher Signatur, falschem Schlüssel und
 * bei Schlüssel oder Signatur in falschem Format. Wirft nie.
 */
export function verify(publicKey: string, bytes: Uint8Array, signature: string): boolean {
  return notImplemented("crypto.verify", publicKey, bytes, signature);
}

/**
 * Kurzform eines öffentlichen Schlüssels zum Vergleichen: die ersten 8 Byte von SHA-256 über die 32 Rohbyte,
 * Hex klein, in vier Vierergruppen mit `-`, z. B. `3f9c-2ab1-77d0-e4c5`.
 *
 * Fehler: `CryptoError("format_ungueltig")`, wenn `publicKey` nicht 32 Rohbyte ergibt.
 */
export function fingerprint(publicKey: string): string {
  return notImplemented("crypto.fingerprint", publicKey);
}
