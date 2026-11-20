/**
 * PaiBot – Wurzel-Geheimnis aus der Umgebung laden und Unterschlüssel daraus ableiten.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { notImplemented } from "@paibot/stub";

/** Name der Umgebungsvariable mit dem Wurzel-Geheimnis. */
export const MASTER_SECRET_ENV = "PAIBOT_SECRET";

/** Länge des Wurzel-Geheimnisses in Byte. */
export const MASTER_SECRET_BYTES = 32;

/** Salz der Schlüsselableitung (als UTF-8-Bytes). */
export const HKDF_SALT = "pb/wurzel/1";

/** Länge jedes abgeleiteten Schlüssels in Byte. */
export const DERIVED_KEY_BYTES = 32;

/**
 * Zwecke, für die Unterschlüssel abgeleitet werden. Der Zweck ist die HKDF-Info.
 *
 * - `secrets-v1`: Verschlüsseln der Anbieter-Schlüssel
 * - `session-v1`: Prüfzeichen gegen untergeschobene Anfragen
 * - `context-v1`: Kontext-Prüfsummen in Belegen
 * - `keys-v1`: Verschlüsseln des privaten Signaturschlüssels
 */
export const KEY_PURPOSES = ["secrets-v1", "session-v1", "context-v1", "keys-v1"] as const;
export type KeyPurpose = (typeof KEY_PURPOSES)[number];

declare const masterBrand: unique symbol;
declare const derivedBrand: unique symbol;

/** Wurzel-Geheimnis: genau 32 Byte. Liegt nur im Speicher, nie in der Datenbank oder im Log. */
export type MasterSecret = Uint8Array & { readonly [masterBrand]: true };

/**
 * Unterschlüssel für genau einen Zweck. Der Typ verhindert, dass ein Schlüssel für einen anderen
 * Zweck benutzt wird (z. B. der Kontext-Schlüssel zum Verschlüsseln).
 */
export type DerivedKey<P extends KeyPurpose = KeyPurpose> = Uint8Array & {
  readonly [derivedBrand]: P;
};

/** Umgebung, aus der gelesen wird, z. B. `process.env`. */
export type Env = Readonly<Record<string, string | undefined>>;

/** Typwächter für die Zwecke der Schlüsselableitung. */
export function isKeyPurpose(value: unknown): value is KeyPurpose {
  return typeof value === "string" && (KEY_PURPOSES as readonly string[]).includes(value);
}

/**
 * Liest `PAIBOT_SECRET` aus `env` und dekodiert es (Base64, wie von `openssl rand -base64 32`
 * erzeugt; base64url wird ebenfalls angenommen).
 *
 * Zusagen: Das Ergebnis ist genau 32 Byte lang. Der Wert erscheint in keiner Fehlermeldung.
 *
 * Fehler: `CryptoError("geheimnis_fehlt")`, wenn die Variable fehlt oder leer ist;
 * `CryptoError("geheimnis_ungueltig")`, wenn sie kein Base64 ist oder nicht 32 Byte ergibt.
 */
export function loadMasterSecret(env: Env): MasterSecret {
  return notImplemented("crypto.loadMasterSecret", env);
}

/**
 * Leitet einen Unterschlüssel ab: HKDF-SHA-256 mit Salz `pb/wurzel/1` (UTF-8), Info = Zweck
 * (UTF-8), Länge 32 Byte.
 *
 * Zusagen: deterministisch; gleiche Eingaben ergeben dieselben Bytes, verschiedene Zwecke
 * verschiedene Schlüssel. Wirft `TypeError` bei unbekanntem Zweck.
 */
export function deriveKey<P extends KeyPurpose>(master: MasterSecret, purpose: P): DerivedKey<P> {
  return notImplemented("crypto.deriveKey", master, purpose);
}
