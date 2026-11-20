/**
 * PaiBot – Test-Datenbank: PGlite im Speicher, auf den aktuellen Stand migriert.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import postgres from "postgres";
import type { Database } from "./client";
import { runMigrations } from "./migrate";
import * as schema from "./schema";

/** Ordner mit den Migrationen des Pakets. */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL("../drizzle", import.meta.url));

/** Test-Datenbank: Drizzle-Instanz (gemeinsamer Typ `Database`) und der PGlite-Client. */
export interface TestDb {
  db: Database;
  client: PGlite;
}

/** Legt eine frische Datenbank im Speicher an und wendet alle Migrationen an. */
export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return { db, client };
}

/** Umgebungsvariable mit der Adresse eines Wegwerf-Postgres für die Tests gegen echtes Postgres. */
export const TEST_DATABASE_URL_ENV = "PAIBOT_TEST_DATABASE_URL";

/** Eine eigene, frisch angelegte Datenbank auf dem Test-Server. */
export interface PostgresTestDatabase {
  /** Adresse der neuen Datenbank. */
  url: string;
  /** Löscht die Datenbank wieder (auch mit noch offenen Verbindungen). */
  drop(): Promise<void>;
}

/**
 * Legt auf dem Server hinter `baseUrl` eine neue Datenbank mit eindeutigem Namen an und wendet
 * (außer mit `migrate: false`) alle Migrationen an. So stören sich parallel laufende Tests nicht.
 */
export async function createPostgresTestDatabase(
  baseUrl: string,
  options: { migrate?: boolean } = {},
): Promise<PostgresTestDatabase> {
  const name = `paibot_test_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
  const admin = postgres(baseUrl, { max: 1, onnotice: () => undefined });
  try {
    await admin.unsafe(`create database ${name}`);
  } finally {
    await admin.end({ timeout: 2 });
  }
  const url = new URL(baseUrl);
  url.pathname = `/${name}`;
  const address = url.toString();
  if (options.migrate !== false) await runMigrations(address, MIGRATIONS_FOLDER);
  return {
    url: address,
    async drop() {
      const cleanup = postgres(baseUrl, { max: 1, onnotice: () => undefined });
      try {
        await cleanup.unsafe(`drop database if exists ${name} with (force)`);
      } finally {
        await cleanup.end({ timeout: 2 });
      }
    },
  };
}
