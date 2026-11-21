/**
 * PaiBot – Tests gegen echtes Postgres (nur mit PAIBOT_TEST_DATABASE_URL): Die App-Rolle kann
 * Abfragen der App nicht auf eigene Tabellen umlenken, keine Regeln schreiben, und was Postgres ihr
 * nicht verbieten kann, setzt der Migrations-Schritt zurück oder die Start-Prüfung meldet es.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { randomBytes } from "node:crypto";
import { ZERO_PREV } from "@paibot/shared";
import postgres from "postgres";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDb } from "./client";
import { runMigrations } from "./migrate";
import { rules as ruleRepo, settings as settingsRepo } from "./repo";
import { checkAppRole } from "./rollen";
import { checkDatabase } from "./rollen-start";
import { belege, installationKeys } from "./schema";
import { MIGRATION_LOCK_KEY } from "./sperren";
import { belegRow, keyRow } from "./testdaten";
import {
  createPostgresTestDatabase,
  MIGRATIONS_FOLDER,
  type PostgresTestDatabase,
  TEST_DATABASE_URL_ENV,
} from "./testing";

const BASE_URL = process.env[TEST_DATABASE_URL_ENV];
const silent = { info: () => undefined, warn: () => undefined, error: () => undefined };

function withUser(address: string, user: string, password: string): string {
  const url = new URL(address);
  url.username = user;
  url.password = password;
  return url.toString();
}

async function codeOf(promise: PromiseLike<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    const e = error as { code?: string; cause?: { code?: string } };
    return e.code ?? e.cause?.code;
  }
}

describe.skipIf(BASE_URL === undefined)(
  "Suchpfad, Schatten-Tabellen und Regeln gegen echtes Postgres",
  () => {
    const cleanup: (() => Promise<void>)[] = [];
    let database: PostgresTestDatabase;
    let roleName: string;
    let password: string;
    let appUrl: string;
    /** Verbindung der App-Rolle ohne eigene Verbindungs-Optionen (wie ein Angreifer sie hätte). */
    let raw: postgres.Sql;

    beforeEach(async () => {
      roleName = `paibot_app_test_${randomBytes(4).toString("hex")}`;
      password = randomBytes(24).toString("hex");
      database = await createPostgresTestDatabase(BASE_URL ?? "");
      appUrl = withUser(database.url, roleName, password);
      await runMigrations(database.url, MIGRATIONS_FOLDER, { appUrl });
      raw = postgres(appUrl, { max: 1, onnotice: () => undefined });
    });

    afterEach(async () => {
      for (const step of cleanup.splice(0).reverse()) await step();
      await raw.end({ timeout: 2 });
      await database.drop();
      const admin = postgres(BASE_URL ?? "", { max: 1, onnotice: () => undefined });
      try {
        await admin.unsafe(`drop role if exists ${roleName}`);
      } finally {
        await admin.end({ timeout: 2 });
      }
    });

    afterAll(() => undefined);

    function appDb() {
      const connection = createDb(appUrl);
      cleanup.push(() => connection.sql.end({ timeout: 2 }));
      return connection;
    }

    it("ein an der Rolle gesetzter Suchpfad wirkt nicht auf Verbindungen der App, fällt beim Start auf und verschwindet mit dem nächsten Migrations-Schritt", async () => {
      // Postgres lässt jede Rolle ihre eigenen Einstellungen ändern; das lässt sich nicht entziehen.
      await raw.unsafe(`alter role ${roleName} set search_path = pgboss, public`);
      await raw.unsafe(
        `alter role ${roleName} in database ${new URL(database.url).pathname.slice(1)} set work_mem = '8MB'`,
      );

      const fresh = postgres(appUrl, { max: 1, onnotice: () => undefined });
      cleanup.push(() => fresh.end({ timeout: 2 }));
      const [ohne] = await fresh<
        { path: string[] }[]
      >`select current_schemas(true)::text[] as path`;
      expect(ohne?.path).toEqual(["pg_catalog", "pgboss", "public"]);
      expect((await checkAppRole(fresh)).issues).toEqual(
        expect.arrayContaining(["rolleneinstellungen", "suchpfad"]),
      );

      const { sql } = appDb();
      const [mit] = await sql<{ path: string[] }[]>`select current_schemas(true)::text[] as path`;
      expect(mit?.path).toEqual(["pg_catalog", "public"]);
      expect(await checkAppRole(sql)).toMatchObject({
        status: "zu_viele_rechte",
        issues: ["rolleneinstellungen"],
      });
      const start = await checkDatabase({
        env: { DATABASE_URL: appUrl },
        migrationsFolder: MIGRATIONS_FOLDER,
        production: true,
        attempts: 1,
        log: silent,
      });
      expect(start).toMatchObject({ ok: false, reason: "zu_viele_rechte" });
      // Behebt der Migrations-Schritt selbst: kein Rat, die Prüfung abzuschalten.
      expect(start.ok ? "" : start.message).not.toContain("PAIBOT_ALLOW_PRIVILEGED_DB");

      await runMigrations(database.url, MIGRATIONS_FOLDER, { appUrl });
      const after = postgres(appUrl, { max: 1, onnotice: () => undefined });
      cleanup.push(() => after.end({ timeout: 2 }));
      expect(await checkAppRole(after)).toMatchObject({ status: "eingeschraenkt", issues: [] });
    });

    it("Schatten-Tabellen im Schema der Warteschlange: Abfragen der App treffen sie nie, die Start-Prüfung meldet sie", async () => {
      await raw.unsafe("create table pgboss.rules as select * from public.rules");
      await raw.unsafe(
        "insert into pgboss.rules (seq, id, version, action, effect, stage, conditions, priority, source, enabled, title, reason) values (999, 'R-500', 1, '*', 'allow', 'execute', '[]'::jsonb, 0, 'owner', true, 'still', 'still')",
      );
      await raw.unsafe("create table pgboss.belege (like public.belege including defaults)");

      const { db, sql } = appDb();
      // Selbst wenn eine Sitzung ihren Suchpfad umstellt: Die App nennt das Schema ausdrücklich.
      await sql.unsafe("set search_path = pgboss, public");
      const snapshot = await ruleRepo.loadSnapshot(db);
      expect(snapshot.rules.map((rule) => rule.id)).not.toContain("R-500");

      const key = keyRow();
      await db.insert(installationKeys).values(key);
      await db.insert(belege).values(belegRow(key.id, { seq: 1, prevHash: ZERO_PREV }));
      const [inPublic] = await raw<{ n: number }[]>`select count(*)::int as n from public.belege`;
      const [inShadow] = await raw<{ n: number }[]>`select count(*)::int as n from pgboss.belege`;
      expect({ public: inPublic?.n, schatten: inShadow?.n }).toEqual({ public: 1, schatten: 0 });

      const check = postgres(appUrl, { max: 1, onnotice: () => undefined });
      cleanup.push(() => check.end({ timeout: 2 }));
      const pruefung = await checkAppRole(check);
      expect(pruefung.issues).toContain("schatten_tabellen");
      expect(pruefung.shadowTables).toEqual(["pgboss.belege", "pgboss.rules"]);

      // Die Meldung beim Start nennt die Tabellen und den Ausweg, ohne die Prüfung abzuschalten.
      const start = await checkDatabase({
        env: { DATABASE_URL: appUrl },
        migrationsFolder: MIGRATIONS_FOLDER,
        production: true,
        attempts: 1,
        log: silent,
      });
      const meldung = start.ok ? "" : start.message;
      expect(meldung).toContain("pgboss.belege, pgboss.rules");
      expect(meldung).toContain("drop table");
      expect(meldung).not.toContain("PAIBOT_ALLOW_PRIVILEGED_DB");

      // Der nächste Migrations-Schritt verschiebt sie in die Quarantäne; danach startet PaiBot.
      const lauf = await runMigrations(database.url, MIGRATIONS_FOLDER, { appUrl });
      expect(lauf.appRole?.quarantined).toHaveLength(2);
      expect(lauf.appRole?.quarantined[0]).toMatch(
        /^pgboss\.belege -> paibot_quarantaene\.belege_\d{14}$/,
      );
      const nachher = postgres(appUrl, { max: 1, onnotice: () => undefined });
      cleanup.push(() => nachher.end({ timeout: 2 }));
      expect(await checkAppRole(nachher)).toMatchObject({ status: "eingeschraenkt", issues: [] });
      const name = (lauf.appRole?.quarantined[1] ?? "").split(" -> ")[1] ?? "";
      expect(await codeOf(nachher.unsafe(`select count(*) from ${name}`))).toBe("42501");
      expect(await codeOf(nachher.unsafe(`drop table ${name}`))).toBe("42501");
    });

    it("die App-Rolle schreibt keine Regeln, auch nicht mit eigener Nummer", async () => {
      const values =
        "('R-777', 1, '*', 'allow', 'execute', '[]', 1000, 'standard', true, 'x', 'x')";
      const columns =
        "(id, version, action, effect, stage, conditions, priority, source, enabled, title, reason)";
      expect(await codeOf(raw.unsafe(`insert into rules ${columns} values ${values}`))).toBe(
        "42501",
      );
      expect(
        await codeOf(
          raw.unsafe(
            `insert into rules (seq, ${columns.slice(1)} overriding system value values (-5, ${values.slice(1)}`,
          ),
        ),
      ).toBe("42501");
      expect(await codeOf(raw.unsafe("select nextval('public.rules_seq_seq')"))).toBe("42501");
    });

    it("entzogen: temporäre Tabellen, große Objekte, fremde Verbindungen beenden", async () => {
      expect(await codeOf(raw.unsafe("create temp table t (a int)"))).toBe("42501");
      expect(await codeOf(raw.unsafe("select lo_create(0)"))).toBe("42501");
      const other = postgres(appUrl, { max: 1, onnotice: () => undefined });
      cleanup.push(() => other.end({ timeout: 2 }));
      const [pid] = await other<{ pid: number }[]>`select pg_backend_pid() as pid`;
      expect(await codeOf(raw`select pg_terminate_backend(${pid?.pid ?? 0})`)).toBe("42501");
    });

    it("ein geändertes Passwort der App-Rolle setzt der nächste Migrations-Schritt zurück", async () => {
      await raw.unsafe(
        `alter role ${roleName} password 'anders-${randomBytes(8).toString("hex")}'`,
      );
      const blocked = postgres(appUrl, { max: 1, onnotice: () => undefined, connect_timeout: 3 });
      expect(await codeOf(blocked`select 1`)).toBe("28P01");
      await blocked.end({ timeout: 1 });
      // Der Start erkennt das und nennt den Ausweg.
      const start = await checkDatabase({
        env: { DATABASE_URL: appUrl },
        migrationsFolder: MIGRATIONS_FOLDER,
        production: true,
        attempts: 1,
        log: silent,
      });
      const meldung = start.ok ? "" : start.message;
      expect(meldung).toContain("kann sich nicht anmelden");
      expect(meldung).toContain("Migrations-Schritt");
      expect(meldung).not.toContain(password);

      await runMigrations(database.url, MIGRATIONS_FOLDER, { appUrl });
      const again = postgres(appUrl, { max: 1, onnotice: () => undefined });
      cleanup.push(() => again.end({ timeout: 2 }));
      const [row] = await again<{ ok: number }[]>`select 1 as ok`;
      expect(row?.ok).toBe(1);
    });

    it("hält jemand die Sperre der Migration, bricht der Migrations-Schritt nach der Frist mit Namen der Rolle ab", async () => {
      const holder = await raw.reserve();
      await holder`select pg_advisory_lock(${MIGRATION_LOCK_KEY}::bigint)`;
      try {
        await expect(
          runMigrations(database.url, MIGRATIONS_FOLDER, { appUrl, lockWaitMs: 500 }),
        ).rejects.toThrow(new RegExp(`Rolle ${roleName}`));
      } finally {
        await holder`select pg_advisory_unlock(${MIGRATION_LOCK_KEY}::bigint)`;
        holder.release();
      }
    });

    it("die App-Rolle setzt, liest und löscht den Prüfwert des Einrichtungs-Codes", async () => {
      const { db } = appDb();
      const hash = `sha256:${"d".repeat(64)}` as const;
      expect(await settingsRepo.setSetupCode(db, { hash })).toBe(true);
      expect((await settingsRepo.getSetupCode(db))?.hash).toBe(hash);
      await settingsRepo.clearSetupCode(db);
      expect(await settingsRepo.getSetupCode(db)).toBeUndefined();
    });

    it("eine Rolle, die eine Nur-Anhängen-Tabelle leeren darf, gilt als zu mächtig", async () => {
      const admin = postgres(database.url, { max: 1, onnotice: () => undefined });
      cleanup.push(() => admin.end({ timeout: 2 }));
      await admin.unsafe(`grant truncate on table public.belege to ${roleName}`);
      expect(await checkAppRole(raw)).toMatchObject({
        status: "zu_viele_rechte",
        issues: ["belege_aenderbar"],
      });
    });

    it("eine Rolle, die ein Objekt in public besitzt, gilt als zu mächtig (auch eine Funktion)", async () => {
      const admin = postgres(database.url, { max: 1, onnotice: () => undefined });
      cleanup.push(() => admin.end({ timeout: 2 }));
      await admin.unsafe("create function public.probe() returns int language sql as 'select 1'");
      await admin.unsafe(`alter function public.probe() owner to ${roleName}`);
      expect(await checkAppRole(raw)).toMatchObject({
        status: "zu_viele_rechte",
        issues: ["besitzer"],
      });
    });
  },
);
