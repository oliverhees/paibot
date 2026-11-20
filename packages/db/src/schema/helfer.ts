/**
 * PaiBot – Hilfen für das Datenbankschema: CHECK-Bedingungen für IDs, Aufzählungen und Formate.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { ID_PREFIX, type IdKind } from "@paibot/shared";
import { sql } from "drizzle-orm";
import { type AnyPgColumn, check } from "drizzle-orm/pg-core";

/** Muster einer ID dieser Art, wie es die Datenbank prüft. */
export function idPattern(kind: IdKind): string {
  return `^${ID_PREFIX[kind]}_[0-7][0-9a-hjkmnp-tv-z]{25}$`;
}

/** Ein Wert in Anführungszeichen für SQL; die Werte stammen aus festen Listen. */
function literal(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/** Spalte passt auf ein Textmuster (POSIX-Ausdruck). */
export function matches(column: AnyPgColumn, pattern: string) {
  return sql`${column} ~ ${sql.raw(literal(pattern))}`;
}

/** CHECK: die Spalte ist eine ID dieser Art. */
export function idCheck(name: string, column: AnyPgColumn, kind: IdKind) {
  return check(name, matches(column, idPattern(kind)));
}

/** CHECK: die Spalte ist null oder eine ID dieser Art. */
export function optionalIdCheck(name: string, column: AnyPgColumn, kind: IdKind) {
  return check(name, sql`${column} is null or ${matches(column, idPattern(kind))}`);
}

/** Liste von Werten als SQL, z. B. `'a', 'b'`. */
export function valueList(values: readonly string[]) {
  return sql.raw(values.map(literal).join(", "));
}

/** CHECK: der Wert der Spalte steht in der Liste. */
export function inListCheck(name: string, column: AnyPgColumn, values: readonly string[]) {
  return check(name, sql`${column} in (${valueList(values)})`);
}

/** Muster für base64url ohne Auffüllung (Schlüssel, Signaturen, verschlüsselte Werte). */
export const PATTERNS = {
  sha256Digest: "^sha256:[0-9a-f]{64}$",
  publicKey: "^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$",
  signature: "^[A-Za-z0-9_-]{85}[AQgw]$",
  fingerprint: "^[0-9a-f]{4}(-[0-9a-f]{4}){3}$",
  encrypted: "^v1:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$",
  sessionId: "^[0-9a-f]{64}$",
  errorCode: "^[a-z]+(_[a-z]+)*$",
  actor: `^(besitzer|bot:${ID_PREFIX.bot}_[0-7][0-9a-hjkmnp-tv-z]{25})$`,
  ruleId: `^(R-[0-9]{3}|${ID_PREFIX.rule}_[0-7][0-9a-hjkmnp-tv-z]{25})$`,
} as const;
