/**
 * PaiBot – Tests gegen echtes Postgres (nur mit PAIBOT_TEST_DATABASE_URL): Migrationen unter der Sperre, auch bei gleichzeitigen Starts.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { readdirSync } from "node:fs";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "./migrate";
import { MIGRATION_LOCK_KEY } from "./sperren";
import {
  createPostgresTestDatabase,
  MIGRATIONS_FOLDER,
  type PostgresTestDatabase,
  TEST_DATABASE_URL_ENV,
} from "./testing";

const BASE_URL = process.env[TEST_DATABASE_URL_ENV];
const MIGRATION_COUNT = readdirSync(MIGRATIONS_FOLDER).filter((f) => f.endsWith(".sql")).length;

describe.skipIf(BASE_URL === undefined)("runMigrations gegen echtes Postgres", () => {
  const open: PostgresTestDatabase[] = [];
  const clients: postgres.Sql[] = [];

  async function fresh(): Promise<{ url: string; sql: postgres.Sql }> {
    const database = await createPostgresTestDatabase(BASE_URL ?? "", { migrate: false });
    open.push(database);
    const sql = postgres(database.url, { max: 2, onnotice: () => undefined });
    clients.push(sql);
    return { url: database.url, sql };
  }

  async function applied(sql: postgres.Sql): Promise<number> {
    const [row] = await sql<{ n: number }[]>`
      select count(*)::int as n from drizzle.__drizzle_migrations`;
    return row?.n ?? 0;
  }

  async function lockHeld(sql: postgres.Sql): Promise<boolean> {
    const rows = await sql`
      select 1 from pg_locks
      where locktype = 'advisory' and objid = ${MIGRATION_LOCK_KEY} and granted
        and database = (select oid from pg_database where datname = current_database())`;
    return rows.length > 0;
  }

  beforeAll(() => {
    expect(MIGRATION_COUNT).toBeGreaterThan(0);
  });

  afterAll(async () => {
    for (const sql of clients) await sql.end({ timeout: 2 });
    for (const database of open) await database.drop();
  });

  it("zwei gleichzeitige Starts wenden jede Migration genau einmal an", async () => {
    const { url, sql } = await fresh();
    const results = await Promise.allSettled([
      runMigrations(url, MIGRATIONS_FOLDER),
      runMigrations(url, MIGRATIONS_FOLDER),
      runMigrations(url, MIGRATIONS_FOLDER),
    ]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled", "fulfilled"]);
    expect(await applied(sql)).toBe(MIGRATION_COUNT);
    expect(await lockHeld(sql)).toBe(false);
    // Ein weiterer Start ändert nichts.
    await runMigrations(url, MIGRATIONS_FOLDER);
    expect(await applied(sql)).toBe(MIGRATION_COUNT);
  });

  it("ein Start wartet, solange ein anderer die Sperre hält, und gibt sie danach frei", async () => {
    const { url, sql } = await fresh();
    const holder = await sql.reserve();
    await holder`select pg_advisory_lock(${MIGRATION_LOCK_KEY}::bigint)`;
    expect(await lockHeld(sql)).toBe(true);
    let finished = false;
    const waiting = runMigrations(url, MIGRATIONS_FOLDER).then(() => {
      finished = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(finished).toBe(false);
    const [row] = await sql<{ exists: boolean }[]>`
      select to_regclass('public.settings') is not null as exists`;
    expect(row?.exists).toBe(false);

    await holder`select pg_advisory_unlock(${MIGRATION_LOCK_KEY}::bigint)`;
    holder.release();
    await waiting;
    expect(finished).toBe(true);
    expect(await applied(sql)).toBe(MIGRATION_COUNT);
    expect(await lockHeld(sql)).toBe(false);
  });
});
