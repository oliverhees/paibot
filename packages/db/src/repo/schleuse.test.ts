/**
 * PaiBot – Tests: Zustand der Datenschleuse (Meldung des Workers, Lesen der Web-App), in PGlite und
 * gegen echtes Postgres mit der App-Rolle.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDb, type Database } from "../client";
import { runMigrations } from "../migrate";
import { APP_TABLE_RIGHTS } from "../rollen";
import {
  createPostgresTestDatabase,
  createTestDb,
  MIGRATIONS_FOLDER,
  newPostgresTestRole,
  type PostgresTestDatabase,
  type PostgresTestRole,
  TEST_DATABASE_URL_ENV,
} from "../testing";
import { schleuse } from "./index";

const zeit = (s: string) => new Date(`2026-11-21T08:00:${s}.000Z`);

describe("schleuse (PGlite)", () => {
  let db: Database;
  beforeEach(async () => {
    db = (await createTestDb()).db;
  });

  it("ohne Meldung gibt es keinen Zustand", async () => {
    expect(await schleuse.get(db)).toBeUndefined();
  });

  it("jede Meldung überschreibt die vorige; es bleibt genau eine Zeile", async () => {
    await schleuse.report(db, { state: "nicht_erreichbar", now: zeit("01") });
    await schleuse.report(db, { state: "bereit", now: zeit("02") });
    expect(await schleuse.get(db)).toEqual({ state: "bereit", checkedAt: zeit("02") });
  });

  it("eine ältere Meldung überschreibt keine neuere", async () => {
    await schleuse.report(db, { state: "schluessel_falsch", now: zeit("05") });
    await schleuse.report(db, { state: "bereit", now: zeit("03") });
    expect(await schleuse.get(db)).toEqual({ state: "schluessel_falsch", checkedAt: zeit("05") });
  });

  it("unbekannte Zustände werden abgewiesen, im Code und in der Datenbank", async () => {
    await expect(schleuse.report(db, { state: "kaputt" as never })).rejects.toThrow(TypeError);
    await expect(
      db.execute(
        sql`insert into schleuse_zustand (id, state, checked_at) values ('singleton', 'kaputt', now())`,
      ),
    ).rejects.toThrow();
    await expect(
      db.execute(
        sql`insert into schleuse_zustand (id, state, checked_at) values ('zwei', 'bereit', now())`,
      ),
    ).rejects.toThrow();
    expect(await schleuse.get(db)).toBeUndefined();
  });

  it("die App-Rolle darf lesen und melden, aber nicht löschen", () => {
    expect(APP_TABLE_RIGHTS.schleuse_zustand).toBe("select, insert, update");
  });
});

const BASE_URL = process.env[TEST_DATABASE_URL_ENV];

describe.skipIf(BASE_URL === undefined)("schleuse gegen echtes Postgres mit der App-Rolle", () => {
  let database: PostgresTestDatabase;
  let rolle: PostgresTestRole;
  let app: ReturnType<typeof createDb>;

  beforeAll(async () => {
    database = await createPostgresTestDatabase(BASE_URL ?? "", { migrate: false });
    rolle = newPostgresTestRole(database.url);
    await runMigrations(database.url, MIGRATIONS_FOLDER, { appUrl: rolle.url });
    app = createDb(rolle.url);
  });

  afterAll(async () => {
    await app?.sql.end({ timeout: 2 });
    await database?.drop();
    await rolle?.drop(BASE_URL ?? "");
  });

  it("melden und lesen gehen mit der App-Rolle", async () => {
    await schleuse.report(app.db, { state: "aus", now: zeit("10") });
    await schleuse.report(app.db, { state: "bereit", now: zeit("11") });
    expect(await schleuse.get(app.db)).toEqual({ state: "bereit", checkedAt: zeit("11") });
  });

  it("parallele Meldungen hinterlassen genau eine Zeile mit der jüngsten Zeit", async () => {
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        schleuse.report(app.db, {
          state: i % 2 === 0 ? "bereit" : "nicht_erreichbar",
          now: new Date(Date.UTC(2026, 10, 21, 9, 0, i)),
        }),
      ),
    );
    const zeilen = await app.sql`select state, checked_at from schleuse_zustand`;
    expect(zeilen).toHaveLength(1);
    expect(await schleuse.get(app.db)).toEqual({
      state: "nicht_erreichbar",
      checkedAt: new Date(Date.UTC(2026, 10, 21, 9, 0, 19)),
    });
  });

  it("die App-Rolle darf die Zeile nicht löschen oder die Tabelle leeren", async () => {
    await expect(app.sql`delete from schleuse_zustand`).rejects.toMatchObject({ code: "42501" });
    await expect(app.sql`truncate schleuse_zustand`).rejects.toMatchObject({ code: "42501" });
  });
});
