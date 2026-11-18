/**
 * PaiBot – erstellt die Datenbankverbindung mit dem PaiBot-Schema.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-07
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/** Erstellt eine Datenbankverbindung mit dem PaiBot-Schema. */
export function createDb(url: string) {
  const sql = postgres(url, { max: 5 });
  return { db: drizzle(sql, { schema }), sql };
}

export type Db = ReturnType<typeof createDb>["db"];
