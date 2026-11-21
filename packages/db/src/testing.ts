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
import { afterAll, onTestFinished } from "vitest";
import type { Database } from "./client";
import { runMigrations } from "./migrate";
import * as schema from "./schema";

export * from "./rollen-testing";

/** Ordner mit den Migrationen des Pakets. */
export const MIGRATIONS_FOLDER = fileURLToPath(new URL("../drizzle", import.meta.url));

/** Test-Datenbank: Drizzle-Instanz (gemeinsamer Typ `Database`) und der PGlite-Client. */
export interface TestDb {
  db: Database;
  client: PGlite;
}

/** Fertig migrierter Abzug der Datenbank, je Prozess einmal erzeugt (dabei laufen die Migrationen wirklich). */
let abzug: Promise<Blob | File> | undefined;

function abzugErzeugen(): Promise<Blob | File> {
  abzug ??= (async () => {
    const client = new PGlite();
    try {
      await migrate(drizzle(client, { schema }), { migrationsFolder: MIGRATIONS_FOLDER });
      await client.exec("CHECKPOINT");
      return await client.dumpDataDir("none");
    } finally {
      await client.close();
    }
  })();
  return abzug;
}

/** Macht `close()` mehrfach aufrufbar: nur der erste Aufruf schließt wirklich. */
function mitSicheremSchliessen(client: PGlite): void {
  const schliessen = client.close.bind(client);
  let geschlossen: Promise<void> | undefined;
  client.close = () => {
    geschlossen ??= schliessen();
    return geschlossen;
  };
}

/**
 * Meldet die Instanz zum Schließen an: nach dem Test (auch in `beforeEach`), im Kopf einer
 * Testdatei nach der Datei. Eine in `beforeAll` angelegte Datenbank wird nicht nach dem ersten
 * Test geschlossen.
 */
function schliessenAnmelden(client: PGlite): void {
  const schliessen = () => client.close().catch(() => undefined);
  try {
    onTestFinished(schliessen);
  } catch {
    try {
      afterAll(schliessen);
    } catch {
      // Außerhalb von Vitest: die Instanz räumt der Aufrufer selbst weg.
    }
  }
}

/**
 * Legt eine frische Datenbank im Speicher an, auf den aktuellen Stand migriert. Die Instanz wird
 * automatisch geschlossen; ein eigenes `client.close()` bleibt möglich und darf doppelt vorkommen.
 * Die Migrationen laufen je Prozess einmal, jede Instanz wird aus dem fertigen Abzug geladen.
 */
export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite({ loadDataDir: await abzugErzeugen() });
  mitSicheremSchliessen(client);
  schliessenAnmelden(client);
  return { db: drizzle(client, { schema }), client };
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
