/**
 * PaiBot – Hilfen für das Datenbankschema: CHECK-Bedingungen für IDs, Aufzählungen und Formate.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import {
  ACTOR_PATTERN_SOURCE,
  ID_BODY_PATTERN,
  ID_PREFIX,
  type IdKind,
  idPatternSource,
  PATTERN_SOURCES,
} from "@paibot/shared";
import { sql } from "drizzle-orm";
import { type AnyPgColumn, check } from "drizzle-orm/pg-core";

/** Muster einer ID dieser Art, wie es die Datenbank prüft. */
export function idPattern(kind: IdKind): string {
  return idPatternSource(kind);
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

/** Textmuster der CHECK-Bedingungen; alle aus den gemeinsamen Verträgen. */
export const PATTERNS = {
  sha256Digest: PATTERN_SOURCES.sha256Digest,
  hmacDigest: PATTERN_SOURCES.hmacDigest,
  publicKey: PATTERN_SOURCES.publicKey,
  signature: PATTERN_SOURCES.signature,
  fingerprint: PATTERN_SOURCES.fingerprint,
  /** `v1:…` (ohne Zusatzdaten) oder `v2:…` (gebunden an Datensatz und Zweck). */
  encrypted: PATTERN_SOURCES.encrypted,
  sessionId: "^[0-9a-f]{64}$",
  errorCode: PATTERN_SOURCES.errorCode,
  actor: ACTOR_PATTERN_SOURCE,
  ruleId: `^(R-[0-9]{3}|${ID_PREFIX.rule}_${ID_BODY_PATTERN})$`,
} as const;
