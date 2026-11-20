/**
 * PaiBot – Passwörter mit scrypt hashen und prüfen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { notImplemented } from "@paibot/stub";

/** Parameter von scrypt für neue Passwort-Hashes. */
export const SCRYPT_PARAMS = { N: 32768, r: 8, p: 1, saltBytes: 16, keyBytes: 32 } as const;

/** Form eines Passwort-Hashes: `scrypt$32768$8$1$<salz>$<hash>`, Salz und Hash base64url ohne Auffüllung. */
export const PASSWORD_HASH_PATTERN = /^scrypt\$32768\$8\$1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{43}$/;

/** Typwächter: hat der Text die Form eines Passwort-Hashes? */
export function isPasswordHash(value: unknown): value is string {
  return typeof value === "string" && PASSWORD_HASH_PATTERN.test(value);
}

/**
 * Hasht ein Passwort mit scrypt (N = 32768, r = 8, p = 1, Salz 16 Byte zufällig, Ergebnis 32 Byte).
 *
 * Zusagen: Ergebnis passt zu `PASSWORD_HASH_PATTERN`; zwei Aufrufe ergeben wegen des Salzes
 * verschiedene Texte. Prüft keine Mindestlänge (das tun die Eingabe-Schemas).
 */
export function hashPassword(password: string): Promise<string> {
  return notImplemented("crypto.hashPassword", password);
}

/**
 * Prüft ein Passwort gegen einen gespeicherten Hash, Vergleich in konstanter Zeit. Die Parameter
 * werden aus dem gespeicherten Hash gelesen.
 *
 * Zusagen: `false` bei falschem Passwort, nie eine Ausnahme dafür.
 *
 * Fehler: `CryptoError("format_ungueltig")`, wenn `stored` kein gültiger `scrypt$…`-Text ist.
 */
export function verifyPassword(password: string, stored: string): Promise<boolean> {
  return notImplemented("crypto.verifyPassword", password, stored);
}
