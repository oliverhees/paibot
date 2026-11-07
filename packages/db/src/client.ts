import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/** Erstellt eine Datenbankverbindung mit dem Paibot-Schema. */
export function createDb(url: string) {
  const sql = postgres(url, { max: 5 });
  return { db: drizzle(sql, { schema }), sql };
}

export type Db = ReturnType<typeof createDb>["db"];
