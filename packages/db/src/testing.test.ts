/**
 * PaiBot – Tests der Test-Datenbank: unabhängige Instanzen, Schließen, Zähler wie nach frischer Migration.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb, MIGRATIONS_FOLDER, type TestDb } from "./testing";

async function zaehler(client: PGlite): Promise<unknown[]> {
  const res = await client.query<{ name: string; wert: string }>(
    `select sequencename as name, last_value::text as wert from pg_sequences order by 1`,
  );
  return res.rows;
}

describe("createTestDb", () => {
  it("liefert unabhängige Instanzen", async () => {
    const a = await createTestDb();
    const b = await createTestDb();
    await a.client.exec("create table probe (x int)");
    const res = await b.client.query("select to_regclass('probe') as t");
    expect(res.rows[0]).toEqual({ t: null });
  });

  it("darf doppelt geschlossen werden", async () => {
    const { client } = await createTestDb();
    await client.close();
    await expect(client.close()).resolves.toBeUndefined();
  });

  it("hat dieselben Zähler wie eine frisch migrierte Datenbank", async () => {
    const frisch = new PGlite();
    await migrate(drizzle(frisch), { migrationsFolder: MIGRATIONS_FOLDER });
    const { client } = await createTestDb();
    expect(await zaehler(client)).toEqual(await zaehler(frisch));
    await frisch.close();
  });
});

describe("createTestDb in beforeAll", () => {
  let ctx: TestDb;
  beforeAll(async () => {
    ctx = await createTestDb();
  });
  afterAll(async () => {
    await ctx.client.close();
  });

  it("bleibt über mehrere Tests offen (1)", async () => {
    await ctx.client.query("select 1");
  });

  it("bleibt über mehrere Tests offen (2)", async () => {
    await expect(ctx.client.query("select 1")).resolves.toBeDefined();
  });
});
