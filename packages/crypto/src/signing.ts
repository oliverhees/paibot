/**
 * PaiBot – Signaturschlüssel der Installation (Ed25519): erzeugen, signieren, prüfen, Kurzform.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as edSign,
  verify as edVerify,
  generateKeyPairSync,
  type KeyObject,
} from "node:crypto";
import { fromBase64Url, toBase64Url, toHex } from "./encoding";
import { CryptoError } from "./errors";

/** Feste Kopfbytes (ASN.1/DER), mit denen Node Ed25519-Rohschlüssel als PKCS#8 bzw. SPKI liest. */
const PKCS8_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
const SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function rawKey(text: string): Uint8Array {
  const bytes = fromBase64Url(text);
  if (bytes.length !== SIGNING_KEY_BYTES) throw new CryptoError("format_ungueltig");
  return bytes;
}

function privateKeyObject(privateKey: string): KeyObject {
  const seed = rawKey(privateKey);
  return createPrivateKey({
    key: Buffer.concat([PKCS8_PREFIX, seed]),
    format: "der",
    type: "pkcs8",
  });
}

function publicKeyObject(publicKey: string): KeyObject {
  const raw = rawKey(publicKey);
  return createPublicKey({ key: Buffer.concat([SPKI_PREFIX, raw]), format: "der", type: "spki" });
}

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
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pub = publicKey.export({ format: "jwk" }).x;
  const priv = privateKey.export({ format: "jwk" }).d;
  if (pub === undefined || priv === undefined)
    throw new Error("Schlüsselpaar konnte nicht erzeugt werden");
  return { publicKey: pub, privateKey: priv };
}

/**
 * Leitet den öffentlichen Schlüssel aus dem privaten ab (beide base64url).
 *
 * Fehler: `CryptoError("format_ungueltig")`, wenn `privateKey` nicht 32 Rohbyte ergibt.
 */
export function publicKeyOf(privateKey: string): string {
  const x = createPublicKey(privateKeyObject(privateKey)).export({ format: "jwk" }).x;
  if (x === undefined) throw new CryptoError("format_ungueltig");
  return x;
}

/**
 * Signiert `bytes` mit Ed25519. Ergebnis: 64 Rohbyte als base64url ohne Auffüllung (86 Zeichen).
 *
 * Fehler: `CryptoError("format_ungueltig")` bei ungültigem privaten Schlüssel.
 */
export function sign(privateKey: string, bytes: Uint8Array): string {
  return toBase64Url(edSign(null, bytes, privateKeyObject(privateKey)));
}

/**
 * Prüft eine Ed25519-Signatur.
 *
 * Zusagen: `true` nur bei gültiger Signatur; `false` bei falscher Signatur, falschem Schlüssel und
 * bei Schlüssel oder Signatur in falschem Format. Wirft nie.
 */
export function verify(publicKey: string, bytes: Uint8Array, signature: string): boolean {
  try {
    const raw = fromBase64Url(signature);
    if (raw.length !== SIGNATURE_BYTES) return false;
    return edVerify(null, bytes, publicKeyObject(publicKey), raw);
  } catch {
    return false;
  }
}

/**
 * Kurzform eines öffentlichen Schlüssels zum Vergleichen: die ersten 8 Byte von SHA-256 über die 32 Rohbyte,
 * Hex klein, in vier Vierergruppen mit `-`, z. B. `3f9c-2ab1-77d0-e4c5`.
 *
 * Fehler: `CryptoError("format_ungueltig")`, wenn `publicKey` nicht 32 Rohbyte ergibt.
 */
export function fingerprint(publicKey: string): string {
  const digest = createHash("sha256").update(rawKey(publicKey)).digest().subarray(0, 8);
  return toHex(digest).replace(/(.{4})(?=.)/g, "$1-");
}
