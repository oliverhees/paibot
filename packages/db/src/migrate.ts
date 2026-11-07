import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** Wendet alle offenen Migrationen an. Wird beim Start der Web-App aufgerufen. */
export async function runMigrations(url: string, migrationsFolder: string) {
  const sql = postgres(url, { max: 1 });
  try {
    await migrate(drizzle(sql), { migrationsFolder });
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
