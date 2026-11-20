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
import { type AppRoleSetup, prepareAppRole } from "./rollen";
import { MIGRATION_LOCK_KEY } from "./sperren";

export * from "./rollen";
export * from "./rollen-start";
export * from "./rollen-testing";

/** Optionen für `runMigrations`. */
export interface MigrationOptions {
  /**
   * Adresse, mit der App und Worker arbeiten. Ist sie gesetzt und nutzt eine andere Rolle als
   * `url`, richtet `runMigrations` danach unter derselben Sperre die App-Rolle ein
   * (`prepareAppRole`).
   */
  appUrl?: string;
}

/** Ergebnis von `runMigrations`. */
export interface MigrationResult {
  /** Was für die App-Rolle getan wurde; fehlt ohne `appUrl` oder bei derselben Rolle. */
  appRole?: AppRoleSetup;
}

/**
 * Wendet alle offenen Migrationen an. Wird beim Start der Web-App aufgerufen. Eine Sperre der
 * Datenbank sorgt dafür, dass nie zwei Prozesse gleichzeitig migrieren. Der Suchpfad ist fest
 * `public`, damit neue Tabellen immer dort landen.
 */
export async function runMigrations(
  url: string,
  migrationsFolder: string,
  options: MigrationOptions = {},
): Promise<MigrationResult> {
  const sql = postgres(url, {
    max: 1,
    onnotice: () => undefined,
    connection: { search_path: "public", application_name: "paibot-migration" },
  });
  try {
    await sql`select pg_advisory_lock(${MIGRATION_LOCK_KEY}::bigint)`;
    try {
      await migrate(drizzle(sql), { migrationsFolder });
      if (options.appUrl === undefined) return {};
      const appRole = await prepareAppRole(sql, options.appUrl);
      return appRole === undefined ? {} : { appRole };
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
