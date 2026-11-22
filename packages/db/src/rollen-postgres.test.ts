/**
 * PaiBot – Tests der Datenbank-Rollen gegen echtes Postgres (nur mit PAIBOT_TEST_DATABASE_URL):
 * die App-Rolle darf normale Arbeit tun, aber Belege und Regeln weder ändern noch löschen und
 * keine Schutz-Trigger abschalten.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { randomBytes } from "node:crypto";
import { newId, type RuleDefinition } from "@paibot/shared";
import { desc, eq } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "./client";
import { runMigrations } from "./migrate";
import {
  bots,
  conversations,
  events,
  installationKeys as keys,
  messages,
  rules as ruleRepo,
  runs,
  settings,
  toolCalls,
} from "./repo";
import { APP_TABLE_RIGHTS, checkAppRole, checkMigrationState } from "./rollen";
import { prepareDatabase } from "./rollen-start";
import { belege, installationKeys, rules } from "./schema";
import { belegRow, fingerprint, hmacDigest, keyRow, publicKey, sha256Digest } from "./testdaten";
import {
  createPostgresTestDatabase,
  MIGRATIONS_FOLDER,
  type PostgresTestDatabase,
  TEST_DATABASE_URL_ENV,
} from "./testing";

const BASE_URL = process.env[TEST_DATABASE_URL_ENV];
const ZERO_PREV = `sha256:${"0".repeat(64)}`;

/** Adresse mit anderem Benutzer und Passwort. */
function withUser(address: string, user: string, password: string): string {
  const url = new URL(address);
  url.username = user;
  url.password = password;
  return url.toString();
}

async function currentDatabase(sql: postgres.Sql): Promise<string> {
  const [row] = await sql<{ name: string }[]>`select current_database() as name`;
  return row?.name ?? "";
}

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    const e = error as { code?: string; cause?: { code?: string } };
    return e.code ?? e.cause?.code;
  }
}

describe.skipIf(BASE_URL === undefined)("Rollen der Datenbank gegen echtes Postgres", () => {
  const roleName = `paibot_app_test_${randomBytes(4).toString("hex")}`;
  const password = randomBytes(24).toString("hex");
  let database: PostgresTestDatabase;
  let appUrl: string;
  let app: postgres.Sql;
  let admin: postgres.Sql;

  beforeAll(async () => {
    database = await createPostgresTestDatabase(BASE_URL ?? "");
    appUrl = withUser(database.url, roleName, password);
    const result = await runMigrations(database.url, MIGRATIONS_FOLDER, { appUrl });
    expect(result.appRole).toEqual({ role: roleName, created: true, quarantined: [] });
    app = postgres(appUrl, { max: 2, onnotice: () => undefined });
    admin = postgres(database.url, { max: 1, onnotice: () => undefined });
  });

  afterAll(async () => {
    await app?.end({ timeout: 2 });
    await admin?.end({ timeout: 2 });
    await database?.drop();
    const cleanup = postgres(BASE_URL ?? "", { max: 1, onnotice: () => undefined });
    try {
      await cleanup.unsafe(`drop role if exists ${roleName}`);
    } finally {
      await cleanup.end({ timeout: 2 });
    }
  });

  it("die App-Rolle gilt als eingeschränkt, der Superuser nicht", async () => {
    expect(await checkAppRole(app)).toEqual({
      status: "eingeschraenkt",
      role: roleName,
      issues: [],
    });
    const superuser = await checkAppRole(admin);
    expect(superuser.status).toBe("zu_viele_rechte");
    expect(superuser.issues).toContain("superuser");
    expect(superuser.issues).toContain("besitzer");
  });

  it("die Rolle hat keine Sonderrechte und nur LOGIN", async () => {
    const [row] = await admin`
      select rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls, rolcanlogin, rolinherit
      from pg_roles where rolname = ${roleName}`;
    expect(row).toEqual({
      rolsuper: false,
      rolcreaterole: false,
      rolcreatedb: false,
      rolreplication: false,
      rolbypassrls: false,
      rolcanlogin: true,
      rolinherit: false,
    });
  });

  it("normale Arbeit geht: Einstellungen, Unterhaltung, Nachricht, Lauf, Ereignis, Beleg anhängen und lesen", async () => {
    const { db, sql } = createDb(appUrl);
    try {
      await settings.ensure(db);
      const bot = await bots.create(db, { name: "Pai", avatarShape: "blatt", color: "blau" });
      const conv = await conversations.create(db, { botId: bot.id, title: "Rollen" });
      const message = await messages.insert(db, {
        conversationId: conv.id,
        role: "user",
        content: "Hallo",
      });
      const run = await runs.create(db, {
        conversationId: conv.id,
        triggerMessageId: message.id,
        botId: bot.id,
      });
      await events.append(db, {
        conversationId: conv.id,
        type: "run.queued",
        data: { runId: run.id },
      });
      expect(await events.lastSeq(db, conv.id)).toBe(1);

      const key = keyRow();
      await db.insert(installationKeys).values(key);
      await db.insert(belege).values(belegRow(key.id, { seq: 1, prevHash: ZERO_PREV }));
      expect(await db.select().from(belege)).toHaveLength(1);
      await db
        .update(installationKeys)
        .set({ retiredAt: new Date() })
        .where(eq(installationKeys.id, key.id));
      expect((await db.select().from(rules)).length).toBeGreaterThan(0);

      await conversations.remove(db, conv.id);
    } finally {
      await sql.end({ timeout: 2 });
    }
  });

  it("die Rechte jeder Tabelle stehen in Postgres genau wie in APP_TABLE_RIGHTS", async () => {
    const rows = await admin<{ name: string; rights: string }[]>`
      select c.relname as name, string_agg(p.privilege_type, ', ' order by p.privilege_type) as rights
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      left join information_schema.table_privileges p
        on p.table_schema = 'public' and p.table_name = c.relname and p.grantee = ${roleName}
      where n.nspname = 'public' and c.relkind in ('r', 'p')
      group by c.relname order by c.relname`;
    const tableLevel = (rights: string) =>
      rights
        .replace(/\w+\s*\([^)]*\)/g, "")
        .split(",")
        .map((right) => right.trim())
        .filter((right) => right !== "" && !right.includes("("))
        .map((right) => right.toUpperCase())
        .sort()
        .join(", ");
    expect(Object.fromEntries(rows.map((row) => [row.name, row.rights ?? ""]))).toEqual(
      Object.fromEntries(
        Object.entries(APP_TABLE_RIGHTS)
          .map(([name, rights]) => [name, tableLevel(rights)] as const)
          .sort(([a], [b]) => a.localeCompare(b)),
      ),
    );

    const columns = await admin<{ name: string; columns: string }[]>`
      select table_name as name, string_agg(column_name, ', ' order by column_name) as columns
      from information_schema.column_privileges
      where table_schema = 'public' and grantee = ${roleName} and privilege_type = 'UPDATE'
        and table_name in ('installation_keys', 'messages', 'tool_calls')
      group by table_name order by table_name`;
    const allowed = (name: string) =>
      (/update\s*\(([^)]*)\)/.exec(APP_TABLE_RIGHTS[name] ?? "")?.[1] ?? "")
        .split(",")
        .map((column) => column.trim())
        .sort()
        .join(", ");
    expect(Object.fromEntries(columns.map((row) => [row.name, row.columns]))).toEqual({
      installation_keys: allowed("installation_keys"),
      messages: allowed("messages"),
      tool_calls: allowed("tool_calls"),
    });
  });

  it("die App-Rolle liest Regeln nur, legt Werkzeug-Aufrufe an, schreibt sie fort und wechselt den Schlüssel", async () => {
    const { db, sql } = createDb(appUrl);
    try {
      const rule = {
        id: newId("rule"),
        version: 1,
        action: "nachricht.senden",
        effect: "deny",
        stage: "execute",
        conditions: [],
        priority: 1000,
        source: "owner",
        enabled: false,
        title: "Probe",
        reason: "Probe der Rechte.",
      } satisfies RuleDefinition;
      expect(await codeOf(db.insert(rules).values(rule))).toBe("42501");
      expect((await ruleRepo.loadSnapshot(db)).rules.length).toBeGreaterThan(0);

      const bot = await bots.create(db, { name: "Werkzeug", avatarShape: "blatt", color: "blau" });
      const conv = await conversations.create(db, { botId: bot.id, title: "Werkzeug" });
      const question = await messages.insert(db, {
        conversationId: conv.id,
        role: "user",
        content: "Bitte nachsehen",
      });
      const run = await runs.create(db, {
        conversationId: conv.id,
        triggerMessageId: question.id,
        botId: bot.id,
      });
      const answer = await messages.insert(db, {
        conversationId: conv.id,
        role: "assistant",
        content: "",
      });
      const key = await keys.create(db, {
        publicKey: publicKey(),
        privateKeyEnc: keyRow().privateKeyEnc,
        fingerprint: fingerprint(),
      });
      const [last] = await db.select().from(belege).orderBy(desc(belege.seq)).limit(1);
      const seq = last?.seq ?? 0;
      // Entscheidung und Ergebnis genau dieser Aktion (der Trigger bindet den Aufruf an sie).
      const actionId = newId("action");
      const [decision] = await db
        .insert(belege)
        .values(
          belegRow(key.id, {
            seq: seq + 1,
            prevHash: last?.hash ?? ZERO_PREV,
            conversationId: conv.id,
            type: "decision",
            actionId,
          }),
        )
        .returning();
      const [result] = await db
        .insert(belege)
        .values(
          belegRow(key.id, {
            seq: seq + 2,
            prevHash: decision?.hash ?? "",
            conversationId: conv.id,
            type: "result",
            actionId,
          }),
        )
        .returning();
      await toolCalls.create(db, {
        actionId,
        conversationId: conv.id,
        runId: run.id,
        messageId: answer.id,
        position: 0,
        callId: "aufruf-1",
        name: "suche",
        source: "eingebaut",
        kind: "lesen",
        input: { frage: "Wetter" },
        argsDigest: hmacDigest(),
        toolKey: "eingebaut/suche",
        toolDigest: sha256Digest(),
        reach: "intern",
        foreignContent: false,
        step: 0,
        untrustedInput: false,
      });
      await toolCalls.recordDecision(db, actionId, {
        outcome: "allow",
        decisionReceiptId: decision?.id ?? newId("receipt"),
      });
      const done = await toolCalls.finish(db, actionId, {
        status: "succeeded",
        output: { text: "Sonne" },
        resultReceiptId: result?.id ?? newId("receipt"),
      });
      expect(done.status).toBe("succeeded");

      const rotated = await keys.rotate(db, {
        publicKey: publicKey(),
        privateKeyEnc: keyRow().privateKeyEnc,
        fingerprint: fingerprint(),
      });
      expect((await keys.getActive(db))?.id).toBe(rotated.id);
      expect((await keys.list(db)).find((k) => k.id === key.id)?.retiredAt).toBeDefined();

      // Der Werkzeug-Aufruf verschwindet mit der Unterhaltung, ohne eigenes Löschrecht.
      await conversations.remove(db, conv.id);
      expect(await toolCalls.get(db, actionId)).toBeUndefined();
    } finally {
      await sql.end({ timeout: 2 });
    }
  });

  it("an Werkzeug-Aufrufen und Schlüsseln lässt sich nichts außerhalb der erlaubten Spalten ändern", async () => {
    for (const statement of [
      "update tool_calls set input = '{}'::jsonb",
      "update tool_calls set name = name",
      "update tool_calls set args_digest = args_digest",
      "update tool_calls set conversation_id = conversation_id",
      "delete from tool_calls",
      "truncate tool_calls",
      "update installation_keys set private_key_enc = private_key_enc",
      "update installation_keys set fingerprint = fingerprint",
      "update installation_keys set created_at = now()",
      "truncate installation_keys",
    ]) {
      expect(await codeOf(app.unsafe(statement)), statement).toBe("42501");
    }
    // Die eine erlaubte Spalte: einen ausgemusterten Schlüssel wieder aktiv setzen verbietet der Trigger.
    expect(
      await codeOf(
        app.unsafe("update installation_keys set retired_at = null where retired_at is not null"),
      ),
    ).toBe("23001");
  });

  it("UPDATE, DELETE und TRUNCATE auf Belegen und Regeln scheitern an fehlenden Rechten", async () => {
    for (const statement of [
      "update belege set signature = signature",
      "delete from belege",
      "truncate belege",
      "truncate belege cascade",
      "update rules set enabled = false",
      "update rules set effect = 'allow' where id = 'R-999'",
      "delete from rules",
      "truncate rules",
      "truncate rules cascade",
      "update installation_keys set public_key = public_key",
      "delete from installation_keys",
      "update conversation_events set type = type",
      "truncate conversation_events",
      "truncate conversations cascade",
    ]) {
      expect(await codeOf(app.unsafe(statement)), statement).toBe("42501");
    }
  });

  it("Schutz-Trigger lassen sich nicht abschalten oder löschen", async () => {
    for (const statement of [
      "alter table belege disable trigger all",
      "alter table belege disable trigger belege_kein_update_delete",
      "alter table conversation_events disable trigger user",
      "drop trigger belege_kein_update_delete on belege",
      "alter table rules disable trigger regeln_kein_update_delete",
      "alter table rules disable trigger all",
      "drop trigger regeln_kein_update_delete on rules",
      "drop trigger regeln_kein_truncate on rules",
      "drop function paibot_regeln_unveraenderlich() cascade",
      "alter table installation_keys disable trigger schluessel_nur_anhaengen",
      "drop trigger schluessel_nur_anhaengen on installation_keys",
      "drop function paibot_schluessel_nur_anhaengen() cascade",
      "alter table tool_calls disable trigger all",
      "alter table tool_calls drop constraint tool_calls_entscheidung_nach_dem_tor",
      "alter table belege drop constraint belege_spalten_aus_koerper",
      "create schema fremd",
      "drop function paibot_belege_unveraenderlich() cascade",
      "alter table belege owner to current_user",
      "set session_replication_role = replica",
      "create table public.fremd (id int)",
      "create or replace function public.paibot_belege_unveraenderlich() returns trigger language plpgsql as $$ begin return old; end $$",
    ]) {
      expect(await codeOf(app.unsafe(statement)), statement).toBe("42501");
    }
  });

  it("die App-Rolle liest den Stand der Migrationen", async () => {
    expect((await checkMigrationState(app, MIGRATIONS_FOLDER)).status).toBe("aktuell");
  });

  it("das Schema der Warteschlange gehört der App-Rolle; Schemas in der Datenbank anlegen darf sie nie", async () => {
    const [schema] = await admin`
      select pg_get_userbyid(nspowner) as owner from pg_namespace where nspname = 'pgboss'`;
    expect(schema?.owner).toBe(roleName);
    const createOnDatabase = async () => {
      const [row] = await admin`
        select has_database_privilege(${roleName}, current_database(), 'CREATE') as ok`;
      return row?.ok;
    };
    expect(await createOnDatabase()).toBe(false);
    // Im eigenen Schema richtet die Warteschlange ihre Tabellen ein.
    await app`create table pgboss.version (version int)`;
    await runMigrations(database.url, MIGRATIONS_FOLDER, { appUrl });
    expect(await createOnDatabase()).toBe(false);
    await app`drop table pgboss.version`;
  });

  it("ein früher vergebenes Recht, Schemas anzulegen, wird beim nächsten Start entzogen", async () => {
    await admin.unsafe(`grant create on database ${await currentDatabase(admin)} to ${roleName}`);
    await runMigrations(database.url, MIGRATIONS_FOLDER, { appUrl });
    const [row] = await admin`
      select has_database_privilege(${roleName}, current_database(), 'CREATE') as ok`;
    expect(row?.ok).toBe(false);
  });

  it("ein zweiter Lauf ist wiederholbar und legt die Rolle nicht neu an", async () => {
    const result = await runMigrations(database.url, MIGRATIONS_FOLDER, { appUrl });
    expect(result.appRole).toEqual({ role: roleName, created: false, quarantined: [] });
    expect((await checkAppRole(app)).status).toBe("eingeschraenkt");
  });
});

describe.skipIf(BASE_URL === undefined)("Start der Datenbank gegen echtes Postgres", () => {
  const opened: PostgresTestDatabase[] = [];
  const roles: string[] = [];
  const silent = { info: () => undefined, warn: () => undefined, error: () => undefined };

  afterAll(async () => {
    for (const db of opened) await db.drop();
    const cleanup = postgres(BASE_URL ?? "", { max: 1, onnotice: () => undefined });
    try {
      for (const role of roles) await cleanup.unsafe(`drop role if exists ${role}`);
    } finally {
      await cleanup.end({ timeout: 2 });
    }
  });

  it("getrennte Rollen: migriert, richtet die App-Rolle ein, meldet ok", async () => {
    const db = await createPostgresTestDatabase(BASE_URL ?? "", { migrate: false });
    opened.push(db);
    const role = `paibot_app_test_${randomBytes(4).toString("hex")}`;
    roles.push(role);
    const appUrl = withUser(db.url, role, randomBytes(24).toString("hex"));
    const result = await prepareDatabase({
      env: { DATABASE_URL: appUrl, DATABASE_MIGRATION_URL: db.url },
      migrationsFolder: MIGRATIONS_FOLDER,
      production: true,
      log: silent,
    });
    expect(result).toMatchObject({
      ok: true,
      separateRoles: true,
      role: { status: "eingeschraenkt" },
      state: { status: "aktuell" },
    });
  });

  it("bestehende Installation mit einer Rolle: in Produktion Abbruch, mit Erlaubnis Start mit Warnung", async () => {
    const db = await createPostgresTestDatabase(BASE_URL ?? "", { migrate: false });
    opened.push(db);
    const blocked = await prepareDatabase({
      env: { DATABASE_URL: db.url },
      migrationsFolder: MIGRATIONS_FOLDER,
      production: true,
      log: silent,
    });
    expect(blocked).toMatchObject({ ok: false, reason: "zu_viele_rechte" });

    const warnings: string[] = [];
    const allowed = await prepareDatabase({
      env: { DATABASE_URL: db.url, PAIBOT_ALLOW_PRIVILEGED_DB: "1" },
      migrationsFolder: MIGRATIONS_FOLDER,
      production: true,
      log: { ...silent, warn: (m) => warnings.push(m) },
    });
    expect(allowed).toMatchObject({ ok: true, role: { status: "zu_viele_rechte" } });
    expect(warnings.join("\n")).toContain("zu vielen Rechten");

    const development = await prepareDatabase({
      env: { DATABASE_URL: db.url },
      migrationsFolder: MIGRATIONS_FOLDER,
      production: false,
      log: silent,
    });
    expect(development.ok).toBe(true);

    // Mit nur einer Rolle legt der Start das Schema der Warteschlange an.
    const sql = postgres(db.url, { max: 1, onnotice: () => undefined });
    try {
      const [row] = await sql`select to_regnamespace('pgboss') is not null as ok`;
      expect(row?.ok).toBe(true);
    } finally {
      await sql.end({ timeout: 2 });
    }
  });

  it("Umstellung einer bestehenden Installation: Daten bleiben, danach eingeschränkt", async () => {
    const db = await createPostgresTestDatabase(BASE_URL ?? "");
    opened.push(db);
    const before = createDb(db.url);
    const bot = await bots.create(before.db, { name: "Alt", avatarShape: "blatt", color: "blau" });
    await before.sql.end({ timeout: 2 });

    const role = `paibot_app_test_${randomBytes(4).toString("hex")}`;
    roles.push(role);
    const appUrl = withUser(db.url, role, randomBytes(24).toString("hex"));
    const result = await prepareDatabase({
      env: { DATABASE_URL: appUrl, DATABASE_MIGRATION_URL: db.url },
      migrationsFolder: MIGRATIONS_FOLDER,
      production: true,
      log: silent,
    });
    expect(result).toMatchObject({ ok: true, role: { status: "eingeschraenkt" } });
    const after = createDb(appUrl);
    try {
      expect((await bots.get(after.db, bot.id))?.name).toBe("Alt");
    } finally {
      await after.sql.end({ timeout: 2 });
    }
  });

  it("nicht migrierte Datenbank: „Datenbank nicht auf Stand“", async () => {
    const db = await createPostgresTestDatabase(BASE_URL ?? "", { migrate: false });
    opened.push(db);
    const result = await prepareDatabase({
      env: { DATABASE_URL: db.url, DATABASE_MIGRATION_URL: db.url },
      migrationsFolder: `${MIGRATIONS_FOLDER}-gibt-es-nicht`,
      production: true,
      attempts: 1,
      delayMs: 0,
      log: silent,
    });
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.message).toContain("Datenbank nicht auf Stand");
  });

  it("veraltete Datenbank wird erkannt", async () => {
    const db = await createPostgresTestDatabase(BASE_URL ?? "");
    opened.push(db);
    const sql = postgres(db.url, { max: 1, onnotice: () => undefined });
    try {
      await sql`delete from drizzle.__drizzle_migrations
        where id = (select max(id) from drizzle.__drizzle_migrations)`;
      expect((await checkMigrationState(sql, MIGRATIONS_FOLDER)).status).toBe("veraltet");
      await sql`insert into drizzle.__drizzle_migrations (hash, created_at) values ('x', ${String(Date.now() * 10)})`;
      expect((await checkMigrationState(sql, MIGRATIONS_FOLDER)).status).toBe("neuer");
    } finally {
      await sql.end({ timeout: 2 });
    }
  });
});
