/**
 * PaiBot – wendet Migrationen an und prüft, ob die Datenbank erreichbar ist.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-07
 */

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { MIGRATION_LOCK_KEY } from "./sperren";

/**
 * Wendet alle offenen Migrationen an. Wird beim Start der Web-App aufgerufen. Eine Sperre der
 * Datenbank sorgt dafür, dass nie zwei Prozesse gleichzeitig migrieren.
 */
export async function runMigrations(url: string, migrationsFolder: string) {
  const sql = postgres(url, { max: 1 });
  try {
    await sql`select pg_advisory_lock(${MIGRATION_LOCK_KEY}::bigint)`;
    try {
      await migrate(drizzle(sql), { migrationsFolder });
    } finally {
      await sql`select pg_advisory_unlock(${MIGRATION_LOCK_KEY}::bigint)`;
    }
  } finally {
    await sql.end();
  }
}

/** Prüft, ob die Datenbank erreichbar ist. */
export async function pingDatabase(url: string, timeoutSeconds = 3): Promise<boolean> {
  const sql = postgres(url, { max: 1, connect_timeout: timeoutSeconds });
  try {
    await sql`select 1`;
    return true;
  } catch {
    return false;
  } finally {
    await sql.end({ timeout: 1 });
  }
}
