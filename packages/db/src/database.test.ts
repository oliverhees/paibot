/**
 * PaiBot – Test: postgres-js- und PGlite-Instanz passen beide zum gemeinsamen Typ Database.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { PGlite } from "@electric-sql/pglite";
import { STANDARD_RULE_IDS } from "@paibot/shared";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { describe, expect, expectTypeOf, it } from "vitest";
import { createDb, type Database, type DatabaseSchema, type Db } from "./client";
import * as schema from "./schema";
import { createTestDb, type TestDb } from "./testing";

/** Nimmt nur den gemeinsamen Typ an; jeder Aufruf unten ist eine Prüfung beim Typecheck. */
function nutzt(db: Database): Database {
  return db;
}

describe("gemeinsamer Datenbank-Typ", () => {
  it("die Treiber-Typen sind an Database zuweisbar", () => {
    expectTypeOf<Db>().toExtend<Database>();
    expectTypeOf<PostgresJsDatabase<DatabaseSchema>>().toExtend<Database>();
    expectTypeOf<PgliteDatabase<DatabaseSchema>>().toExtend<Database>();
    expectTypeOf<TestDb["db"]>().toEqualTypeOf<Database>();
  });

  it("die postgres-js-Instanz aus createDb passt", async () => {
    const { db, sql } = createDb("postgres://paibot:paibot@127.0.0.1:1/paibot");
    expect(nutzt(db)).toBe(db);
    await sql.end();
  });

  it("eine PGlite-Instanz und createTestDb passen und lassen sich abfragen", async () => {
    const roh = drizzle(new PGlite(), { schema });
    expect(nutzt(roh)).toBe(roh);

    const { db } = await createTestDb();
    const regeln = await nutzt(db).select({ id: schema.rules.id }).from(schema.rules);
    expect(regeln.map((r) => r.id).sort()).toEqual([...STANDARD_RULE_IDS].sort());
  });
});
