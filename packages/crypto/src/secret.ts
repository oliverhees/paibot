/**
 * PaiBot – Geheimnisse wie Anbieter-Schlüssel verschlüsseln und entschlüsseln (AES-256-GCM).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { notImplemented } from "@paibot/stub";
import type { DerivedKey } from "./master";

/** Formatversion verschlüsselter Geheimnisse; steht vorne im gespeicherten Text. */
export const SECRET_FORMAT_VERSION = "v1";

/** Länge des IV in Byte. */
export const SECRET_IV_BYTES = 12;

/** Länge des Authentifizierungs-Tags in Byte. */
export const SECRET_TAG_BYTES = 16;

/** Form eines gespeicherten Geheimnisses: `v1:<iv>:<tag>:<ct>`, alle Teile base64url ohne Auffüllung. */
export const ENCRYPTED_SECRET_PATTERN = /^v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]*$/;

/** Zwecke, deren Schlüssel zum Verschlüsseln dienen. */
export type EncryptionPurpose = "secrets-v1" | "keys-v1";

/** Typwächter: hat der Text die Form eines verschlüsselten Geheimnisses? Prüft nicht den Inhalt. */
export function isEncryptedSecret(value: unknown): value is string {
  return typeof value === "string" && ENCRYPTED_SECRET_PATTERN.test(value);
}

/**
 * Verschlüsselt `plain` (UTF-8) mit AES-256-GCM und einem frischen, zufälligen IV von 12 Byte.
 *
 * Zusagen: Ergebnis hat die Form `v1:<iv>:<tag>:<ct>`; zwei Aufrufe mit demselben Klartext
 * ergeben verschiedene Texte. Der Klartext erscheint nie in Fehlermeldungen.
 */
export function encryptSecret(plain: string, key: DerivedKey<EncryptionPurpose>): string {
  return notImplemented("crypto.encryptSecret", plain, key);
}

/**
 * Entschlüsselt einen Text aus `encryptSecret`.
 *
 * Fehler: `CryptoError("format_ungueltig")` bei falscher Form; `CryptoError("version_unbekannt")`
 * bei einem anderen Präfix als `v1:`; `CryptoError("entschluesseln_fehlgeschlagen")` bei falschem
 * Schlüssel oder verändertem IV, Tag oder Geheimtext. Gibt nie Teil-Klartext zurück.
 */
export function decryptSecret(encrypted: string, key: DerivedKey<EncryptionPurpose>): string {
  return notImplemented("crypto.decryptSecret", encrypted, key);
}
