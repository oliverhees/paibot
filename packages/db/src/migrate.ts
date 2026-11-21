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
  /**
   * Wie lange auf die Sperre der Migration gewartet wird (Millisekunden, Standard 120 000). Hält
   * sie jemand länger, bricht der Lauf mit einer Meldung ab, die die haltende Rolle nennt.
   */
  lockWaitMs?: number;
}

/** Ergebnis von `runMigrations`. */
export interface MigrationResult {
  /** Was für die App-Rolle getan wurde; fehlt ohne `appUrl` oder bei derselben Rolle. */
  appRole?: AppRoleSetup;
}

/**
 * Wendet alle offenen Migrationen an (Dienst `migrate`; in der Entwicklung beim Start der Web-App).
 * Eine Sperre der
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
    await acquireMigrationLock(sql, options.lockWaitMs ?? 120_000);
    try {
      await migrate(drizzle(sql), { migrationsFolder });
      if (options.appUrl === undefined) return {};
      const appRole = await prepareAppRole(sql, options.appUrl);
      return appRole === undefined ? {} : { appRole };
    } finally {
      await sql`select pg_catalog.pg_advisory_unlock(${MIGRATION_LOCK_KEY}::bigint)`;
    }
  } finally {
    await sql.end();
  }
}

/**
 * Nimmt die Sperre der Migration mit Frist. Ohne Frist würde jeder, der die Sperre hält (auch die
 * App-Rolle), den Start beliebig lange aufhalten.
 */
async function acquireMigrationLock(sql: postgres.Sql, waitMs: number): Promise<void> {
  await sql.unsafe(`set lock_timeout = ${Math.max(1, Math.floor(waitMs))}`);
  try {
    await sql`select pg_catalog.pg_advisory_lock(${MIGRATION_LOCK_KEY}::bigint)`;
  } catch (error) {
    if ((error as { code?: string }).code !== "55P03") throw error;
    const holders = await sql<{ role: string | null; pid: number }[]>`
      select a.usename::text as role, l.pid from pg_catalog.pg_locks l
      left join pg_catalog.pg_stat_activity a on a.pid = l.pid
      where l.locktype = 'advisory' and l.granted and l.objid = ${MIGRATION_LOCK_KEY}
        and l.database = (select oid from pg_catalog.pg_database
          where datname = pg_catalog.current_database())`;
    const wer = holders.map((h) => `Rolle ${h.role ?? "unbekannt"}, Prozess ${h.pid}`).join("; ");
    throw new Error(
      `Die Sperre der Migration ist seit ${Math.round(waitMs / 1000)} s belegt (${wer || "unbekannt"}). Beende diese Verbindung und starte den Migrations-Schritt erneut.`,
    );
  } finally {
    await sql.unsafe("set lock_timeout = 0");
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
