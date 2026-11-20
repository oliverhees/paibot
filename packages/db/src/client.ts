/**
 * PaiBot – erstellt die Datenbankverbindung mit dem PaiBot-Schema.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-07
 */

import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/** Das PaiBot-Schema, wie Drizzle es für Abfragen kennt. */
export type DatabaseSchema = typeof schema;

/**
 * Gemeinsamer Typ für jede Drizzle-Instanz mit dem PaiBot-Schema, unabhängig vom Treiber:
 * postgres-js im Betrieb (`createDb`), PGlite in Tests (`createTestDb`). Pakete, die die Datenbank
 * nutzen, tippen gegen diesen Typ.
 */
export type Database = PgDatabase<PgQueryResultHKT, DatabaseSchema>;

/** Erstellt eine Datenbankverbindung mit dem PaiBot-Schema. */
export function createDb(url: string) {
  const sql = postgres(url, { max: 5 });
  return { db: drizzle(sql, { schema }), sql };
}

/** Drizzle-Instanz mit postgres-js, wie `createDb` sie liefert. Zuweisbar an `Database`. */
export type Db = ReturnType<typeof createDb>["db"];
