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

/**
 * Grenzen für Parameter, die aus einem gespeicherten Hash gelesen werden. Darunter wäre der Hash
 * zu schwach, darüber würde eine einzige Prüfung absichtlich viel Speicher oder Zeit kosten.
 * `N` muss eine Zweierpotenz sein; der Speicherbedarf `128 · N · r` darf `maxMemoryBytes` nicht
 * überschreiten.
 */
export const SCRYPT_LIMITS = {
  minN: 16384,
  maxN: 65536,
  minR: 8,
  maxR: 16,
  minP: 1,
  maxP: 4,
  maxMemoryBytes: 64 * 1024 * 1024,
} as const;

/**
 * Form eines Passwort-Hashes: `scrypt$<N>$<r>$<p>$<salz>$<hash>`, Salz (16 Byte) und Hash (32 Byte)
 * base64url ohne Auffüllung. Neue Hashes haben `scrypt$32768$8$1$…`; ältere oder spätere Parameter
 * werden gelesen, solange sie in `SCRYPT_LIMITS` liegen.
 */
export const PASSWORD_HASH_PATTERN =
  /^scrypt\$([1-9][0-9]{0,6})\$([1-9][0-9]{0,2})\$([1-9][0-9]{0,2})\$([A-Za-z0-9_-]{22})\$([A-Za-z0-9_-]{43})$/;

/** Die Teile eines gespeicherten Passwort-Hashes. */
interface ParsedPasswordHash {
  N: number;
  r: number;
  p: number;
  salt: string;
  hash: string;
}

function parsePasswordHash(stored: unknown): ParsedPasswordHash | undefined {
  if (typeof stored !== "string") return undefined;
  const match = PASSWORD_HASH_PATTERN.exec(stored);
  if (!match) return undefined;
  const [, n = "", r = "", p = "", salt = "", hash = ""] = match;
  return { N: Number(n), r: Number(r), p: Number(p), salt, hash };
}

function paramsAllowed({ N, r, p }: { N: number; r: number; p: number }): boolean {
  const limits = SCRYPT_LIMITS;
  const powerOfTwo = Number.isInteger(N) && N > 1 && (N & (N - 1)) === 0;
  return (
    powerOfTwo &&
    N >= limits.minN &&
    N <= limits.maxN &&
    r >= limits.minR &&
    r <= limits.maxR &&
    p >= limits.minP &&
    p <= limits.maxP &&
    128 * N * r <= limits.maxMemoryBytes
  );
}

/** Typwächter: hat der Text die Form eines Passwort-Hashes mit erlaubten Parametern? */
export function isPasswordHash(value: unknown): value is string {
  const parsed = parsePasswordHash(value);
  return parsed !== undefined && paramsAllowed(parsed);
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
 * (`N`, `r`, `p`) werden aus dem gespeicherten Hash gelesen; so bleiben ältere Hashes gültig,
 * wenn `SCRYPT_PARAMS` später steigt. Nach einer erfolgreichen Prüfung mit `needsRehash`
 * nachsehen, ob der Hash neu berechnet werden sollte.
 *
 * Zusagen: `false` bei falschem Passwort, nie eine Ausnahme dafür.
 *
 * Fehler: `CryptoError("format_ungueltig")`, wenn `stored` kein gültiger `scrypt$…`-Text ist;
 * `CryptoError("parameter_ungueltig")`, wenn die Parameter außerhalb von `SCRYPT_LIMITS` liegen
 * (es wird dann gar nicht erst gerechnet).
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parsePasswordHash(stored);
  if (parsed === undefined) throw new CryptoError("format_ungueltig");
  if (!paramsAllowed(parsed)) throw new CryptoError("parameter_ungueltig");
  const salt = fromBase64Url(parsed.salt);
  const expected = fromBase64Url(parsed.hash);
  const actual = await deriveScrypt(password, salt, parsed.N, parsed.r, parsed.p, expected.length);
  return timingSafeEqual(actual, expected);
}

/**
 * Ob ein gespeicherter Hash mit anderen Parametern als `SCRYPT_PARAMS` gerechnet wurde und nach der
 * nächsten erfolgreichen Anmeldung neu berechnet werden sollte (`hashPassword`). Ein Text, der kein
 * gültiger Hash ist, braucht ebenfalls einen neuen.
 */
export function needsRehash(stored: string): boolean {
  const parsed = parsePasswordHash(stored);
  if (parsed === undefined || !paramsAllowed(parsed)) return true;
  return (
    parsed.N !== SCRYPT_PARAMS.N || parsed.r !== SCRYPT_PARAMS.r || parsed.p !== SCRYPT_PARAMS.p
  );
}
