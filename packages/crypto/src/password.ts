/**
 * PaiBot – Passwörter mit scrypt hashen und prüfen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { fromBase64Url, toBase64Url } from "./encoding";
import { CryptoError } from "./errors";

/** scrypt braucht bei N = 32768 und r = 8 etwa 32 MiB; Node erlaubt standardmäßig genau so viel nicht. */
const SCRYPT_MAX_MEMORY = 128 * 1024 * 1024;

function deriveScrypt(
  password: string,
  salt: Uint8Array,
  N: number,
  r: number,
  p: number,
  keyBytes: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      Buffer.from(password, "utf8"),
      salt,
      keyBytes,
      { N, r, p, maxmem: SCRYPT_MAX_MEMORY },
      (error, key) => {
        if (error) reject(error);
        else resolve(key);
      },
    );
  });
}

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
export async function hashPassword(password: string): Promise<string> {
  const { N, r, p, saltBytes, keyBytes } = SCRYPT_PARAMS;
  const salt = randomBytes(saltBytes);
  const hash = await deriveScrypt(password, salt, N, r, p, keyBytes);
  return ["scrypt", N, r, p, toBase64Url(salt), toBase64Url(hash)].join("$");
}

/**
 * Prüft ein Passwort gegen einen gespeicherten Hash, Vergleich in konstanter Zeit. Die Parameter
 * werden aus dem gespeicherten Hash gelesen.
 *
 * Zusagen: `false` bei falschem Passwort, nie eine Ausnahme dafür.
 *
 * Fehler: `CryptoError("format_ungueltig")`, wenn `stored` kein gültiger `scrypt$…`-Text ist.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!isPasswordHash(stored)) throw new CryptoError("format_ungueltig");
  const [, n, r, p, saltText = "", hashText = ""] = stored.split("$");
  const salt = fromBase64Url(saltText);
  const expected = fromBase64Url(hashText);
  const actual = await deriveScrypt(
    password,
    salt,
    Number(n),
    Number(r),
    Number(p),
    expected.length,
  );
  return timingSafeEqual(actual, expected);
}
