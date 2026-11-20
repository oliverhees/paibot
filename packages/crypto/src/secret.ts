/**
 * PaiBot – Geheimnisse wie Anbieter-Schlüssel verschlüsseln und entschlüsseln (AES-256-GCM).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { fromBase64Url, toBase64Url } from "./encoding";
import { CryptoError } from "./errors";
import type { DerivedKey } from "./master";

/** Formatversion, in der neue Geheimnisse geschrieben werden: gebunden an Zusatzdaten. */
export const SECRET_FORMAT_VERSION = "v2";

/** Älteres Format ohne Zusatzdaten. Bleibt lesbar (`allowV1`), wird aber nicht mehr geschrieben. */
export const LEGACY_SECRET_FORMAT_VERSION = "v1";

/** Formatversionen, die dieses Paket kennt. */
export type SecretFormatVersion = "v1" | "v2";

/** Länge des IV in Byte. */
export const SECRET_IV_BYTES = 12;

/** Länge des Authentifizierungs-Tags in Byte. */
export const SECRET_TAG_BYTES = 16;

/** Form eines Geheimnisses im Format `v1`: `v1:<iv>:<tag>:<ct>`, alle Teile base64url ohne Auffüllung. */
export const ENCRYPTED_SECRET_V1_PATTERN =
  /^v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]*$/;

/**
 * Form eines Geheimnisses im Format `v2`: `v2:<iv>:<tag>:<ct>`, alle Teile base64url ohne
 * Auffüllung, Geheimtext nie leer. Der Inhalt ist an Zusatzdaten (AAD) gebunden.
 */
export const ENCRYPTED_SECRET_V2_PATTERN =
  /^v2:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]+$/;

/** Form eines gespeicherten Geheimnisses in einem der bekannten Formate (`v1` oder `v2`). */
export const ENCRYPTED_SECRET_PATTERN =
  /^(?:v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]*|v2:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]+)$/;

/** Zwecke, deren Schlüssel zum Verschlüsseln dienen. */
export type EncryptionPurpose = "secrets-v1" | "keys-v1";

/**
 * Zusatzdaten (AAD), an die ein Geheimnis im Format `v2` gebunden ist. Der Text wird als UTF-8
 * mitgerechnet, aber nicht gespeichert: Wer entschlüsseln will, muss genau denselben Text angeben.
 * Er beschreibt, wohin das Geheimnis gehört (Tabelle, Datensatz, Zweck, Ziel); bauen lässt er sich
 * mit `secretAad(...)` aus `@paibot/shared`.
 */
export interface SecretBindingOptions {
  aad: string;
}

/** Wie `decryptSecret` entschlüsselt. */
export interface DecryptSecretOptions {
  /** Zusatzdaten, an die ein `v2`-Geheimnis gebunden ist. Pflicht für `v2`. */
  aad?: string;
  /** Erlaubt das ältere Format `v1` ohne Bindung. Ohne diese Angabe wird `v1` abgelehnt. */
  allowV1?: boolean;
}

/** Typwächter: hat der Text die Form eines verschlüsselten Geheimnisses (`v1` oder `v2`)? Prüft nicht den Inhalt. */
export function isEncryptedSecret(value: unknown): value is string {
  return typeof value === "string" && ENCRYPTED_SECRET_PATTERN.test(value);
}

/** Formatversion eines gespeicherten Geheimnisses oder `undefined`, wenn die Form nicht stimmt. */
export function secretFormatOf(value: unknown): SecretFormatVersion | undefined {
  if (typeof value !== "string") return undefined;
  if (ENCRYPTED_SECRET_V2_PATTERN.test(value)) return "v2";
  if (ENCRYPTED_SECRET_V1_PATTERN.test(value)) return "v1";
  return undefined;
}

/**
 * Verschlüsselt `plain` (UTF-8) mit AES-256-GCM, einem frischen, zufälligen IV von 12 Byte und den
 * Zusatzdaten `options.aad`. Ergebnis im Format `v2:<iv>:<tag>:<ct>`.
 *
 * Zusagen: Zwei Aufrufe mit demselben Klartext ergeben verschiedene Texte. Entschlüsseln gelingt
 * nur mit genau denselben Zusatzdaten. Der Klartext erscheint nie in Fehlermeldungen.
 *
 * Fehler: `TypeError`, wenn die Zusatzdaten fehlen oder leer sind oder der Klartext leer ist (ein
 * leeres Geheimnis wird nicht gespeichert).
 */
export function encryptSecret(
  plain: string,
  key: DerivedKey<EncryptionPurpose>,
  options: SecretBindingOptions,
): string {
  assertKey(key);
  const aad = checkedAad(options?.aad);
  if (typeof plain !== "string" || plain.length === 0) {
    throw new TypeError("Ein leeres Geheimnis wird nicht verschlüsselt");
  }
  return seal(SECRET_FORMAT_VERSION, plain, key, aad);
}

/**
 * Entschlüsselt einen Text aus `encryptSecret`.
 *
 * - `v2`: nur mit genau den Zusatzdaten, mit denen verschlüsselt wurde (`options.aad`).
 * - `v1`: nur mit `options.allowV1: true`; die Zusatzdaten spielen dann keine Rolle. Solche Werte
 *   beim nächsten Schreiben mit `upgradeSecret` ins Format `v2` bringen.
 *
 * Fehler: `CryptoError("format_ungueltig")` bei falscher Form; `CryptoError("version_unbekannt")`
 * bei einem unbekannten Präfix; `CryptoError("version_veraltet")` bei `v1` ohne `allowV1`;
 * `CryptoError("bindung_fehlt")` bei `v2` ohne Zusatzdaten; `CryptoError("entschluesseln_fehlgeschlagen")`
 * bei falschem Schlüssel, anderen Zusatzdaten oder verändertem IV, Tag oder Geheimtext. Gibt nie
 * Teil-Klartext zurück.
 */
export function decryptSecret(
  encrypted: string,
  key: DerivedKey<EncryptionPurpose>,
  options: DecryptSecretOptions = {},
): string {
  assertKey(key);
  if (typeof encrypted !== "string") throw new CryptoError("format_ungueltig");
  const parts = encrypted.split(":");
  const version = parts[0] ?? "";
  if (parts.length === 4 && version !== "v1" && version !== "v2" && /^v[0-9]+$/.test(version)) {
    throw new CryptoError("version_unbekannt");
  }
  const format = secretFormatOf(encrypted);
  if (format === undefined) throw new CryptoError("format_ungueltig");
  let aad: string | undefined;
  if (format === "v1") {
    if (options.allowV1 !== true) throw new CryptoError("version_veraltet");
  } else {
    if (options.aad === undefined || options.aad === "") throw new CryptoError("bindung_fehlt");
    aad = checkedAad(options.aad);
  }
  const [, ivText = "", tagText = "", ctText = ""] = parts;
  try {
    const iv = fromBase64Url(ivText);
    const tag = fromBase64Url(tagText);
    const ciphertext = fromBase64Url(ctText);
    const decipher = createDecipheriv("aes-256-gcm", key, iv, { authTagLength: SECRET_TAG_BYTES });
    if (aad !== undefined) decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return new TextDecoder("utf-8", { fatal: true }).decode(plain);
  } catch {
    // Absichtlich ohne Ursache: weder Schlüssel noch Teile des Texts sollen in einer Meldung landen.
    throw new CryptoError("entschluesseln_fehlgeschlagen");
  }
}

/** Ergebnis von `upgradeSecret`. */
export interface UpgradedSecret {
  /** Wert im Format `v2`, gebunden an die übergebenen Zusatzdaten. */
  value: string;
  /** `true`, wenn der Wert neu verschlüsselt wurde und gespeichert werden sollte. */
  changed: boolean;
}

/**
 * Bringt ein gespeichertes Geheimnis ins aktuelle Format, z. B. beim nächsten Schreiben des
 * Datensatzes: Ein `v1`-Wert wird entschlüsselt und mit `options.aad` als `v2` neu verschlüsselt
 * (`changed: true`). Ein `v2`-Wert bleibt unverändert, muss sich aber mit genau diesen
 * Zusatzdaten entschlüsseln lassen (`changed: false`).
 *
 * Fehler wie `decryptSecret`; der Klartext verlässt die Funktion nicht.
 */
export function upgradeSecret(
  encrypted: string,
  key: DerivedKey<EncryptionPurpose>,
  options: SecretBindingOptions,
): UpgradedSecret {
  const aad = checkedAad(options.aad);
  const plain = decryptSecret(encrypted, key, { aad, allowV1: true });
  if (secretFormatOf(encrypted) === "v2") return { value: encrypted, changed: false };
  return { value: encryptSecret(plain, key, { aad }), changed: true };
}

/**
 * Bindet ein gespeichertes Geheimnis an neue Zusatzdaten, z. B. wenn sich das Ziel eines
 * Anbieters auf legitimem Weg ändert: entschlüsseln mit `from` (bei `v1` ohne Bindung), neu
 * verschlüsseln mit `to`. Ergebnis immer im Format `v2`.
 *
 * Fehler wie `decryptSecret`; der Klartext verlässt die Funktion nicht.
 */
export function rebindSecret(
  encrypted: string,
  key: DerivedKey<EncryptionPurpose>,
  options: { from: string; to: string },
): string {
  const from = checkedAad(options.from);
  const to = checkedAad(options.to);
  const plain = decryptSecret(encrypted, key, { aad: from, allowV1: true });
  return encryptSecret(plain, key, { aad: to });
}

/**
 * Schreibt im älteren Format `v1` ohne Bindung. Nur für Tests, die Altbestand nachstellen
 * (`@paibot/crypto/testing`); nicht über den Haupteinstieg erreichbar.
 */
export function encryptLegacySecret(plain: string, key: DerivedKey<EncryptionPurpose>): string {
  assertKey(key);
  return seal(LEGACY_SECRET_FORMAT_VERSION, plain, key, undefined);
}

function seal(
  version: SecretFormatVersion,
  plain: string,
  key: DerivedKey<EncryptionPurpose>,
  aad: string | undefined,
): string {
  const iv = randomBytes(SECRET_IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv, { authTagLength: SECRET_TAG_BYTES });
  if (aad !== undefined) cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [version, toBase64Url(iv), toBase64Url(tag), toBase64Url(ciphertext)].join(":");
}

function checkedAad(aad: unknown): string {
  if (typeof aad !== "string" || aad.length === 0) {
    throw new TypeError("Die Zusatzdaten (aad) fehlen");
  }
  return aad;
}

function assertKey(key: Uint8Array): void {
  if (!(key instanceof Uint8Array) || key.length !== 32) {
    throw new TypeError("Der Schlüssel muss 32 Byte lang sein");
  }
}
