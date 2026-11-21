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
import { checkDatabase, quarantineMessage } from "./rollen-start";
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

      // Der nächste Migrations-Schritt legt sie in der Quarantäne ab; danach startet PaiBot.
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

    it("Sichten mit eigenem Code werden gelöscht, Tabellen nur als Text abgelegt, ohne jeden Code", async () => {
      // Code der App-Rolle, der eine Spur hinterlässt, sobald er läuft (mit den Rechten des Aufrufers).
      await raw.unsafe("create table pgboss.spur (wer text)");
      await raw.unsafe("grant insert on pgboss.spur to public");
      await raw.unsafe("grant usage on schema pgboss to public");
      await raw.unsafe(
        "create function pgboss.zeig() returns text language plpgsql as $$ begin insert into pgboss.spur values (current_user); return 'x'; end $$",
      );
      await raw.unsafe("grant execute on function pgboss.zeig() to public");
      // Für Index und berechnete Spalte muss die Funktion als unveränderlich gelten; eine solche
      // Funktion darf nichts schreiben, zählt aber eine Sequenz hoch.
      await raw.unsafe("create sequence pgboss.spur_zaehler");
      await raw.unsafe("grant usage on sequence pgboss.spur_zaehler to public");
      await raw.unsafe(
        "create function pgboss.zeig_wahr(x int) returns boolean language plpgsql immutable as $$ begin perform pg_catalog.nextval('pgboss.spur_zaehler'); return true; end $$",
      );
      await raw.unsafe("grant execute on function pgboss.zeig_wahr(int) to public");
      await raw.unsafe("create domain pgboss.zahl as int check (pgboss.zeig_wahr(value))");
      await raw.unsafe("create type pgboss.farbe as enum ('rot', 'gruen')");
      await raw.unsafe(
        "create function pgboss.farbe_text(pgboss.farbe) returns text language plpgsql as $$ begin perform pgboss.zeig(); return 'x'; end $$",
      );
      await raw.unsafe(
        "create cast (pgboss.farbe as text) with function pgboss.farbe_text(pgboss.farbe)",
      );
      await raw.unsafe("create view pgboss.settings as select pgboss.zeig() as wert");
      await raw.unsafe("create materialized view pgboss.bots as select 1 as a");
      await raw.unsafe(
        `create table pgboss.messages (
           a text default pgboss.zeig(),
           b int generated always as (1) stored,
           c int check (pgboss.zeig_wahr(c)),
           d pgboss.zahl,
           e pgboss.farbe,
           f int generated always as (case when pgboss.zeig_wahr(c) then 1 end) stored)`,
      );
      await raw.unsafe("create index on pgboss.messages ((pgboss.zeig_wahr(c)))");
      await raw.unsafe("insert into pgboss.messages (a, c, d, e) values ('vorher', 1, 2, 'rot')");
      await raw.unsafe(
        "create function pgboss.ausloeser() returns trigger language plpgsql as $$ begin perform pgboss.zeig(); return new; end $$",
      );
      await raw.unsafe(
        "create trigger t before insert or update or delete on pgboss.messages for each row execute function pgboss.ausloeser()",
      );
      await raw.unsafe(
        "create rule r as on update to pgboss.messages do also select pgboss.zeig()",
      );
      await raw.unsafe("alter table pgboss.messages enable row level security");
      await raw.unsafe("alter table pgboss.messages force row level security");
      await raw.unsafe("create policy p on pgboss.messages using (pgboss.zeig() = 'x')");
      await raw.unsafe("delete from pgboss.spur");

      const admin = postgres(database.url, { max: 1, onnotice: () => undefined });
      cleanup.push(() => admin.end({ timeout: 2 }));
      const spuren = async () => {
        const [zeile] = await admin<{ n: number }[]>`
          select (select count(*)::int from pgboss.spur)
            + (select last_value::int from pgboss.spur_zaehler) as n`;
        return zeile?.n ?? -1;
      };
      const spurVorher = await spuren();
      const lauf = await runMigrations(database.url, MIGRATIONS_FOLDER, { appUrl });
      const eintraege = lauf.appRole?.quarantined ?? [];
      expect(eintraege).toContain("pgboss.settings (gelöscht)");
      expect(eintraege).toContain("pgboss.bots (gelöscht)");
      const abgelegt = eintraege.find((e) => e.startsWith("pgboss.messages -> "));
      expect(abgelegt).toMatch(/^pgboss\.messages -> paibot_quarantaene\.messages_\d{14}$/);
      const ziel = (abgelegt ?? "").split(" -> ")[1] ?? "";

      // Sichten und die alte Tabelle sind weg; die neue Tabelle hat genau eine Text-Spalte.
      const [reste] = await admin<{ n: number }[]>`
        select count(*)::int as n from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where (n.nspname in ('pgboss', 'paibot_quarantaene') and c.relkind in ('v', 'm'))
           or (n.nspname = 'pgboss' and c.relname = 'messages')`;
      expect(reste?.n).toBe(0);
      const spalten = await admin<{ name: string; typ: string }[]>`
        select attname as name, pg_catalog.format_type(atttypid, atttypmod) as typ
        from pg_attribute where attrelid = ${ziel}::regclass and attnum > 0 and not attisdropped`;
      expect(spalten).toEqual([{ name: "zeile", typ: "text" }]);
      const [code] = await admin<
        {
          trigger: number;
          regeln: number;
          policies: number;
          ausdruecke: number;
          regeln_pruef: number;
          indizes: number;
          rls: boolean;
        }[]
      >`
        select
          (select count(*)::int from pg_trigger where tgrelid = ${ziel}::regclass) as trigger,
          (select count(*)::int from pg_rewrite where ev_class = ${ziel}::regclass) as regeln,
          (select count(*)::int from pg_policy where polrelid = ${ziel}::regclass) as policies,
          (select count(*)::int from pg_attrdef where adrelid = ${ziel}::regclass) as ausdruecke,
          (select count(*)::int from pg_constraint where conrelid = ${ziel}::regclass) as regeln_pruef,
          (select count(*)::int from pg_index where indrelid = ${ziel}::regclass) as indizes,
          (select relrowsecurity or relforcerowsecurity from pg_class where oid = ${ziel}::regclass) as rls`;
      expect(code).toEqual({
        trigger: 0,
        regeln: 0,
        policies: 0,
        ausdruecke: 0,
        regeln_pruef: 0,
        indizes: 0,
        rls: false,
      });
      // Kopieren und Löschen haben keinen Code der App-Rolle ausgeführt.
      expect(await spuren()).toBe(spurVorher);

      // Die Daten sind als Text da; Lesen, Schreiben und Löschen führen nichts aus.
      expect(await admin.unsafe(`select zeile from ${ziel}`)).toEqual([
        { zeile: "(vorher,1,1,2,rot,1)" },
      ]);
      await admin.unsafe(`insert into ${ziel} (zeile) values ('neu')`);
      await admin.unsafe(`update ${ziel} set zeile = 'anders'`);
      await admin.unsafe(`drop table ${ziel} cascade`);
      expect(await spuren()).toBe(spurVorher);

      const nachher = postgres(appUrl, { max: 1, onnotice: () => undefined });
      cleanup.push(() => nachher.end({ timeout: 2 }));
      expect(await checkAppRole(nachher)).toMatchObject({ status: "eingeschraenkt", issues: [] });
    });

    it("die Meldung zur Quarantäne rät zum Löschen, nicht zum Ansehen", () => {
      const tabelle = quarantineMessage(
        "pgboss.belege -> paibot_quarantaene.belege_20261121000000",
      );
      expect(tabelle).toContain('drop table "paibot_quarantaene"."belege_20261121000000" cascade;');
      expect(tabelle).toContain("Öffne und lies sie nicht");
      expect(tabelle).not.toMatch(/sieh .* an|ansehen/i);
      expect(quarantineMessage("pgboss.settings (gelöscht)")).toContain(
        "Sicht außerhalb von public gelöscht: pgboss.settings.",
      );
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
