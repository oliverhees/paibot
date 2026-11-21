/**
 * PaiBot – Rollen der Datenbank: App-Rolle anlegen, Rechte vergeben und prüfen, ob die App
 * mit zu vielen Rechten verbunden ist; Stand der Migrationen prüfen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import { readMigrationFiles } from "drizzle-orm/migrator";
import postgres from "postgres";
import { APP_SEARCH_PATH } from "./client";

/**
 * Schema der Warteschlange (pg-boss). Gehört der App-Rolle: Die Bibliothek legt darin zur Laufzeit
 * Tabellen an (je Warteschlange eine Teil-Tabelle, für die Statistik täglich eine neue) und muss
 * dafür Besitzer der Eltern-Tabellen sein. Deshalb sprechen alle Abfragen der App ihre Tabellen mit
 * Schema an, jede Verbindung setzt einen festen Suchpfad, und `checkAppRole` meldet gleichnamige
 * Tabellen in anderen Schemas.
 */
export const QUEUE_SCHEMA_NAME = "pgboss";

/** Rechte der App-Rolle auf Tabellen ohne besonderen Schutz (kein TRUNCATE). */
export const APP_DEFAULT_TABLE_RIGHTS = "select, insert, update, delete";

/**
 * Rechte der App-Rolle je Tabelle im Schema `public`. Jede Tabelle des Schemas steht hier (ein Test
 * prüft das), damit eine neue Tabelle bewusst ihre Rechte bekommt.
 *
 * - `belege`: nur lesen und anhängen.
 * - `rules`: nur lesen. Die Standard-Regeln legen allein die Migrationen an.
 * - `installation_keys`: lesen, anhängen und nur `retired_at` setzen (Ausmustern).
 * - `conversation_events`: lesen, anhängen, alte Ereignisse löschen; nie ändern.
 * - `geraete`: lesen, anlegen, „zuletzt gesehen“, Ablauf, Widerruf samt Grund und „Hinweis bestätigt bis“ setzen,
 *   alte Einträge löschen; Art, Rechte, Schlüssel und Prüfsumme des Cookies ändert die App nie.
 * - `tool_calls`: lesen, anlegen und nur Zustand und Ergebnis fortschreiben; gelöscht wird nur mit
 *   der Unterhaltung.
 */
export const APP_TABLE_RIGHTS: Readonly<Record<string, string>> = {
  belege: "select, insert",
  bots: APP_DEFAULT_TABLE_RIGHTS,
  conversation_events: "select, insert, delete",
  conversations: APP_DEFAULT_TABLE_RIGHTS,
  geraete:
    "select, insert, update (last_seen_at, expires_at, revoked_at, revoke_reason, notice_seen_at), delete",
  installation_keys: "select, insert, update (retired_at)",
  messages: APP_DEFAULT_TABLE_RIGHTS,
  models: APP_DEFAULT_TABLE_RIGHTS,
  owner: APP_DEFAULT_TABLE_RIGHTS,
  providers: APP_DEFAULT_TABLE_RIGHTS,
  rate_limits: APP_DEFAULT_TABLE_RIGHTS,
  runs: APP_DEFAULT_TABLE_RIGHTS,
  sessions: APP_DEFAULT_TABLE_RIGHTS,
  settings: APP_DEFAULT_TABLE_RIGHTS,
  rules: "select",
  schleuse_zustand: "select, insert, update",
  tool_calls:
    "select, insert, update (status, decision_receipt_id, result_receipt_id, result_status, output, error_code, updated_at, finished_at)",
};

/** Tabellen, auf denen die App-Rolle weder ändern noch löschen noch leeren darf. */
const APPEND_ONLY_TABLES = ["belege", "rules", "installation_keys"] as const;

/** Gründe, aus denen eine Verbindung zu viele Rechte hat. */
export type RoleIssue =
  | "superuser"
  | "bypassrls"
  | "createrole"
  | "replication"
  | "besitzer"
  | "schema_create"
  | "belege_aenderbar"
  | "replikationsmodus"
  | "rolleneinstellungen"
  | "schatten_tabellen"
  | "suchpfad";

/** Ergebnis der Rechte-Prüfung einer Verbindung. */
export interface RoleCheck {
  status: "eingeschraenkt" | "zu_viele_rechte";
  /** Name der Rolle, mit der die Verbindung arbeitet. */
  role: string;
  issues: RoleIssue[];
  /** Bei `schatten_tabellen`: die gefundenen Tabellen als `schema.name`. */
  shadowTables?: string[];
}

/** Kurze deutsche Beschreibung der Gründe für das Log. */
export const ROLE_ISSUE_TEXT: Readonly<Record<RoleIssue, string>> = {
  superuser: "ist Superuser",
  bypassrls: "darf Zeilen-Regeln umgehen (BYPASSRLS)",
  createrole: "darf Rollen anlegen (CREATEROLE)",
  replication: "hat Replikationsrechte",
  besitzer: "ist Besitzer von Objekten im Schema public (kann z. B. Trigger abschalten)",
  schema_create: "darf im Schema public Objekte anlegen",
  belege_aenderbar: "darf Belege, Regeln oder Schlüssel ändern, löschen oder leeren",
  replikationsmodus: "darf session_replication_role setzen",
  rolleneinstellungen:
    "trägt eigene Einstellungen an der Rolle (ALTER ROLE … SET), z. B. einen anderen Suchpfad",
  schatten_tabellen: "in einem anderen Schema liegen Tabellen mit dem Namen einer Tabelle der App",
  suchpfad: "die Verbindung sucht Tabellen nicht nur in pg_catalog und public",
};

/**
 * Prüft, mit welchen Rechten die Verbindung arbeitet. `eingeschraenkt` heißt: kein Superuser,
 * nicht Besitzer der Tabellen, keine Änderungsrechte auf Belegen, Regeln und Schlüsseln (nur das
 * Ausmustern eines Schlüssels über die Spalte `retired_at`).
 */
export async function checkAppRole(sql: postgres.Sql): Promise<RoleCheck> {
  const [row] = await sql<
    {
      role: string;
      superuser: boolean;
      bypassrls: boolean;
      createrole: boolean;
      replication: boolean;
      besitzer: boolean;
      schema_create: boolean;
      belege_aenderbar: boolean;
      rolleneinstellungen: boolean;
      schatten_tabellen: boolean;
      schatten_namen: string[];
      suchpfad: boolean;
    }[]
  >`
    select
      current_user as role,
      r.rolsuper as superuser,
      r.rolbypassrls as bypassrls,
      r.rolcreaterole as createrole,
      r.rolreplication as replication,
      (
        exists (
          select 1 from pg_catalog.pg_namespace n
          where n.nspname = 'public' and pg_catalog.pg_has_role(current_user, n.nspowner, 'USAGE')
        )
        or exists (
          select 1 from pg_catalog.pg_class c
          join pg_catalog.pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public'
            and pg_catalog.pg_has_role(current_user, c.relowner, 'USAGE')
        )
        or exists (
          select 1 from pg_catalog.pg_proc p
          join pg_catalog.pg_namespace n on n.oid = p.pronamespace
          where n.nspname = 'public'
            and pg_catalog.pg_has_role(current_user, p.proowner, 'USAGE')
        )
        or exists (
          select 1 from pg_catalog.pg_type t
          join pg_catalog.pg_namespace n on n.oid = t.typnamespace
          where n.nspname = 'public'
            and pg_catalog.pg_has_role(current_user, t.typowner, 'USAGE')
        )
      ) as besitzer,
      pg_catalog.has_schema_privilege('public', 'CREATE') as schema_create,
      coalesce((
        select bool_or(
          pg_catalog.has_table_privilege(c.oid, 'UPDATE')
          or pg_catalog.has_table_privilege(c.oid, 'DELETE')
          or pg_catalog.has_table_privilege(c.oid, 'TRUNCATE')
          or pg_catalog.has_table_privilege(c.oid, 'TRIGGER')
        )
        from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname in ${sql(APPEND_ONLY_TABLES as unknown as string[])}
      ), false) as belege_aenderbar,
      exists (
        select 1 from pg_catalog.pg_db_role_setting s
        where s.setrole = r.oid
          and s.setdatabase in (0, (
            select d.oid from pg_catalog.pg_database d
            where d.datname = pg_catalog.current_database()))
      ) as rolleneinstellungen,
      exists (
        select 1 from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where n.nspname not in ('public', 'pg_catalog', 'information_schema')
          and n.nspname not like 'pg\_toast%'
          and c.relkind in ('r', 'p', 'v', 'm', 'f')
          and c.relname in (
            select a.relname from pg_catalog.pg_class a
            join pg_catalog.pg_namespace an on an.oid = a.relnamespace
            where an.nspname = 'public' and a.relkind in ('r', 'p')
          )
      ) as schatten_tabellen,
      coalesce((
        select pg_catalog.array_agg(n.nspname || '.' || c.relname order by n.nspname, c.relname)
        from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        where n.nspname not in ('public', 'pg_catalog', 'information_schema')
          and n.nspname not like 'pg\_toast%'
          and c.relkind in ('r', 'p', 'v', 'm', 'f')
          and c.relname in (
            select a.relname from pg_catalog.pg_class a
            join pg_catalog.pg_namespace an on an.oid = a.relnamespace
            where an.nspname = 'public' and a.relkind in ('r', 'p')
          )
      ), '{}') as schatten_namen,
      pg_catalog.current_schemas(true) <> array['pg_catalog', 'public']::name[] as suchpfad
    from pg_catalog.pg_roles r
    where r.rolname = current_user`;
  if (row === undefined) throw new Error("Die eigene Rolle ist in pg_roles nicht zu finden.");

  const issues: RoleIssue[] = [];
  for (const key of [
    "superuser",
    "bypassrls",
    "createrole",
    "replication",
    "besitzer",
    "schema_create",
    "belege_aenderbar",
    "rolleneinstellungen",
    "schatten_tabellen",
    "suchpfad",
  ] as const) {
    if (row[key]) issues.push(key);
  }
  if (!row.superuser && (await maySetReplicationRole(sql))) issues.push("replikationsmodus");
  return {
    status: issues.length === 0 ? "eingeschraenkt" : "zu_viele_rechte",
    role: row.role,
    issues,
    ...(row.schatten_tabellen ? { shadowTables: row.schatten_namen } : {}),
  };
}

/** Ab Postgres 15 lässt sich das Setzen einzelner Parameter erlauben; das prüfen wir mit. */
async function maySetReplicationRole(sql: postgres.Sql): Promise<boolean> {
  const [version] = await sql<{ n: number }[]>`
    select pg_catalog.current_setting('server_version_num')::int as n`;
  if ((version?.n ?? 0) < 150000) return false;
  const [row] = await sql<{ ok: boolean }[]>`
    select pg_catalog.has_parameter_privilege('session_replication_role', 'SET') as ok`;
  return row?.ok === true;
}

/** Stand der Datenbank gegenüber den Migrationen im Ordner. */
export interface MigrationState {
  /** `aktuell`: alles angewendet; `veraltet`: Migrationen fehlen; `leer`: noch nie migriert; `neuer`: die Datenbank kennt Migrationen, die diese Version nicht hat. */
  status: "aktuell" | "veraltet" | "leer" | "neuer";
  /** Anzahl der Migrationen im Ordner. */
  expected: number;
  /** Anzahl der angewendeten Migrationen in der Datenbank. */
  applied: number;
}

/**
 * Vergleicht die angewendeten Migrationen (`drizzle.__drizzle_migrations`) mit dem Ordner. Die
 * Verbindung braucht nur Leserechte auf diese Tabelle.
 */
export async function checkMigrationState(
  sql: postgres.Sql,
  migrationsFolder: string,
): Promise<MigrationState> {
  const files = readMigrationFiles({ migrationsFolder });
  const expected = files.length;
  const last = files.at(-1)?.folderMillis ?? 0;
  const [exists] = await sql<{ ok: boolean }[]>`
    select pg_catalog.to_regclass('drizzle.__drizzle_migrations') is not null as ok`;
  if (exists?.ok !== true) return { status: "leer", expected, applied: 0 };
  const [row] = await sql<{ applied: number; newest: string | null }[]>`
    select count(*)::int as applied, max(created_at)::text as newest
    from drizzle.__drizzle_migrations`;
  const applied = row?.applied ?? 0;
  const newest = row?.newest === null || row?.newest === undefined ? 0 : Number(row.newest);
  if (applied === 0) return { status: "leer", expected, applied };
  if (newest < last) return { status: "veraltet", expected, applied };
  if (newest > last) return { status: "neuer", expected, applied };
  return { status: "aktuell", expected, applied };
}

/** Benutzer und Passwort aus einer Postgres-Adresse. */
export function credentialsOf(url: string): { user: string; password: string } {
  const parsed = new URL(url);
  return {
    user: decodeURIComponent(parsed.username),
    password: decodeURIComponent(parsed.password),
  };
}

/**
 * SCRAM-SHA-256-Prüfwert eines Passworts im Format, das Postgres bei `PASSWORD '…'` annimmt. So
 * steht das Passwort nie im Klartext in einer Anweisung (und damit nie im Log der Datenbank).
 */
export function scramVerifier(password: string, salt = randomBytes(16), iterations = 4096): string {
  const salted = pbkdf2Sync(password.normalize("NFKC"), salt, iterations, 32, "sha256");
  const clientKey = createHmac("sha256", salted).update("Client Key").digest();
  const storedKey = createHash("sha256").update(clientKey).digest();
  const serverKey = createHmac("sha256", salted).update("Server Key").digest();
  return `SCRAM-SHA-256$${iterations}:${salt.toString("base64")}$${storedKey.toString("base64")}:${serverKey.toString("base64")}`;
}

/** Was `prepareAppRole` getan hat. */
export interface AppRoleSetup {
  role: string;
  /** `true`, wenn die Rolle bei diesem Aufruf neu angelegt wurde. */
  created: boolean;
  /** Gleichnamige Objekte außerhalb von `public`: als Text abgelegte Tabellen (`alt -> neu`) und gelöschte Sichten (`alt (gelöscht)`). */
  quarantined: string[];
}

/**
 * Schema für gleichnamige Tabellen, die außerhalb von `public` gefunden werden (siehe
 * `checkAppRole`). Gehört der Migrations-Rolle; die App-Rolle hat darauf keine Rechte. Die Tabellen
 * darin enthalten nur Text (eine Spalte `zeile`). Sicherungen nehmen das Schema nicht mit.
 */
export const QUARANTINE_SCHEMA_NAME = "paibot_quarantaene";

/**
 * Richtet die App-Rolle aus `appUrl` ein. Läuft mit der Migrations-Verbindung `sql` (Besitzer
 * der Tabellen) direkt nach den Migrationen und ist beliebig oft wiederholbar:
 *
 * 1. Rolle anlegen, falls sie fehlt (Login, keine Sonderrechte, Passwort aus `appUrl`).
 * 2. Schema `public`: nur benutzen, nichts anlegen.
 * 3. Jede Tabelle in `public`: Rechte genau nach `APP_TABLE_RIGHTS`, sonst
 *    `APP_DEFAULT_TABLE_RIGHTS`; nie TRUNCATE, TRIGGER oder REFERENCES. Standard-Rechte für
 *    künftige Tabellen des Besitzers.
 * 4. Lesen des Migrations-Stands (`drizzle.__drizzle_migrations`).
 * 5. Schema der Warteschlange: wird hier angelegt und gehört der App-Rolle; die Warteschlange
 *    richtet darin ihre Tabellen ein, legt aber kein Schema an. Schemas in der Datenbank anlegen
 *    darf die App-Rolle nie.
 * 6. Einstellungen an der Rolle (`ALTER ROLE … SET`, auch nur für diese Datenbank) werden
 *    zurückgesetzt, und das Passwort aus `appUrl` wird neu gesetzt. Eine Rolle darf beides bei sich
 *    selbst ändern; Postgres lässt sich das nicht verbieten. So gilt nach jedem Lauf wieder der
 *    Stand aus der Konfiguration.
 * 7. Was die App nicht braucht, wird entzogen, soweit Postgres es zulässt: Nummern der Regeln
 *    ziehen, temporäre Tabellen, große Objekte anlegen, fremde Verbindungen beenden. Fehlen dafür
 *    die Rechte (die Migrations-Rolle ist kein Superuser), bleibt es beim Rest.
 *
 * 8. Gleichnamige Objekte außerhalb von `public` (etwa im Schema der Warteschlange): Sichten und
 *    Fremdtabellen werden gelöscht, Tabellen als reiner Text in das Schema
 *    `QUARANTINE_SCHEMA_NAME` übernommen (siehe `quarantineShadowTables`). So startet PaiBot
 *    wieder, und Daten gehen nicht verloren.
 *
 * Nutzt `appUrl` dieselbe Rolle wie `sql`, wird nur das Schema der Warteschlange angelegt (falls es
 * fehlt), und das Ergebnis ist `undefined`.
 */
export async function prepareAppRole(
  sql: postgres.Sql,
  appUrl: string,
): Promise<AppRoleSetup | undefined> {
  const { user, password } = credentialsOf(appUrl);
  if (user === "") throw new Error("In DATABASE_URL fehlt der Benutzer der App-Rolle.");
  const [self] = await sql<{ name: string }[]>`select current_user as name`;
  if (self?.name === user) {
    // Nur eine Rolle (Entwicklung oder Übergang): Sie legt das Schema der Warteschlange selbst an.
    await sql`create schema if not exists ${sql(QUEUE_SCHEMA_NAME)}`;
    return undefined;
  }

  const [found] = await sql<{ n: number }[]>`
    select count(*)::int as n from pg_roles where rolname = ${user}`;
  let created = false;
  if ((found?.n ?? 0) === 0) {
    if (password === "") {
      throw new Error(`Die App-Rolle ${user} fehlt, und DATABASE_URL enthält kein Passwort.`);
    }
    const [statement] = await sql<{ text: string }[]>`
      select format(
        'create role %I with login nosuperuser nocreatedb nocreaterole noinherit noreplication nobypassrls password %L',
        ${user}::text, ${scramVerifier(password)}::text
      ) as text`;
    if (statement === undefined) throw new Error("Anweisung für die App-Rolle fehlt.");
    await sql.unsafe(statement.text);
    created = true;
  }

  let quarantined: string[] = [];
  await sql.begin(async (tx) => {
    const role = tx(user);
    const database = await databaseName(tx);
    await tx`alter role ${role} reset all`;
    await tx`alter role ${role} in database ${tx(database)} reset all`;
    if (!created && password !== "") {
      const [statement] = await tx<{ text: string }[]>`
        select pg_catalog.format('alter role %I with password %L',
          ${user}::text, ${scramVerifier(password)}::text) as text`;
      if (statement === undefined) throw new Error("Anweisung für die App-Rolle fehlt.");
      await tx.unsafe(statement.text);
    }
    await tx`grant connect on database ${tx(database)} to ${role}`;
    await tx`grant usage on schema public to ${role}`;
    await tx`revoke create on schema public from ${role}`;
    await tx.unsafe(`
      do $$
      begin
        revoke create on schema public from public;
      exception when insufficient_privilege then
        null;
      end
      $$`);

    const tables = await tx<{ name: string }[]>`
      select c.relname as name from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')
      order by c.relname`;
    for (const { name } of tables) {
      const rights = APP_TABLE_RIGHTS[name] ?? APP_DEFAULT_TABLE_RIGHTS;
      await tx`revoke all on table ${tx("public")}.${tx(name)} from ${role}`;
      await tx.unsafe(`grant ${rights} on table public.${quoteIdent(name)} to ${quoteIdent(user)}`);
    }
    await tx`grant usage, select on all sequences in schema public to ${role}`;
    // Tabellen, in die die App nicht einfügt, brauchen auch keine Nummern von ihr.
    for (const { name } of tables) {
      if ((APP_TABLE_RIGHTS[name] ?? APP_DEFAULT_TABLE_RIGHTS).includes("insert")) continue;
      const sequences = await tx<{ seq: string }[]>`
        select s.relname as seq from pg_catalog.pg_depend d
        join pg_catalog.pg_class s on s.oid = d.objid and s.relkind = 'S'
        join pg_catalog.pg_class t on t.oid = d.refobjid
        join pg_catalog.pg_namespace n on n.oid = t.relnamespace
        where n.nspname = 'public' and t.relname = ${name} and d.deptype in ('a', 'i')`;
      for (const { seq } of sequences) {
        await tx`revoke all on sequence ${tx("public")}.${tx(seq)} from ${role}`;
      }
    }
    await tx.unsafe(
      `alter default privileges in schema public grant ${APP_DEFAULT_TABLE_RIGHTS} on tables to ${quoteIdent(user)}`,
    );
    await tx.unsafe(
      `alter default privileges in schema public grant usage, select on sequences to ${quoteIdent(user)}`,
    );

    const [drizzleTable] = await tx<{ ok: boolean }[]>`
      select pg_catalog.to_regclass('drizzle.__drizzle_migrations') is not null as ok`;
    if (drizzleTable?.ok === true) {
      await tx`grant usage on schema drizzle to ${role}`;
      await tx`grant select on drizzle.__drizzle_migrations to ${role}`;
    }

    await prepareQueueSchema(tx, user);
    await withdrawExtras(tx, user, database);
    // Fehlen der Migrations-Rolle die Rechte dafür, bleibt alles, wie es ist; die Prüfung danach
    // nennt die Tabellen dann mit Namen.
    quarantined = await tx
      .savepoint((sp) => quarantineShadowTables(sp, user))
      .catch((error: { code?: string }) => {
        if (error.code === "42501") return [];
        throw error;
      });
  });

  return { role: user, created, quarantined };
}

/**
 * Räumt gleichnamige Objekte außerhalb von `public` weg:
 *
 * - Sichten, materialisierte Sichten und Fremdtabellen enthalten keine eigenen Daten, aber Code,
 *   der beim Lesen läuft. Sie werden gelöscht (`drop … cascade`).
 * - Tabellen: Ihre Zeilen werden als reiner Text (eine Spalte `zeile`) in eine neue Tabelle mit
 *   Zeitstempel im Namen im Schema der Quarantäne kopiert, danach wird die alte Tabelle gelöscht.
 *   Vorher verliert sie Trigger, Regeln, Zeilen-Regeln (Policies) und Standardwerte, damit auch das
 *   Lesen keinen Code ausführt. Die neue Tabelle gehört der Migrations-Rolle und enthält nur Text:
 *   keine Prüfregeln, Indizes, berechneten Spalten oder eigenen Typen. Die Migrations-Rolle
 *   übernimmt nie Objekte, die eine andere Rolle angelegt hat.
 *
 * Liefert je Objekt eine Zeile: `alt -> neu` (als Text abgelegt) bzw. `alt (gelöscht)`.
 */
async function quarantineShadowTables(
  tx: postgres.TransactionSql,
  user: string,
): Promise<string[]> {
  const found = await tx<{ schema: string; name: string; kind: string }[]>`
    select n.nspname as schema, c.relname as name, c.relkind::text as kind
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname not in ('public', 'pg_catalog', 'information_schema', ${QUARANTINE_SCHEMA_NAME})
      and n.nspname not like 'pg\_toast%'
      and c.relkind in ('r', 'p', 'v', 'm', 'f')
      and c.relname in (
        select a.relname from pg_catalog.pg_class a
        join pg_catalog.pg_namespace an on an.oid = a.relnamespace
        where an.nspname = 'public' and a.relkind in ('r', 'p'))
    order by n.nspname, c.relname`;
  if (found.length === 0) return [];
  const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
  const result: string[] = [];
  const tables: { schema: string; name: string }[] = [];
  for (const { schema, name, kind } of found) {
    if (kind === "r" || kind === "p") {
      tables.push({ schema, name });
      continue;
    }
    const art = kind === "v" ? "view" : kind === "m" ? "materialized view" : "foreign table";
    await tx.unsafe(`drop ${art} if exists ${quoteIdent(schema)}.${quoteIdent(name)} cascade`);
    result.push(`${schema}.${name} (gelöscht)`);
  }
  if (tables.length === 0) return result;
  await tx`create schema if not exists ${tx(QUARANTINE_SCHEMA_NAME)}`;
  await tx`revoke all on schema ${tx(QUARANTINE_SCHEMA_NAME)} from public`;
  await tx`revoke all on schema ${tx(QUARANTINE_SCHEMA_NAME)} from ${tx(user)}`;
  for (const { schema, name } of tables) {
    const quelle = `${quoteIdent(schema)}.${quoteIdent(name)}`;
    await neutralize(tx, quelle);
    const target = `${name}_${stamp}`.slice(0, 63);
    const ziel = `${quoteIdent(QUARANTINE_SCHEMA_NAME)}.${quoteIdent(target)}`;
    const [spalten] = await tx<{ liste: string }[]>`
      select coalesce(pg_catalog.string_agg(pg_catalog.quote_ident(attname), ', ' order by attnum), '') as liste
      from pg_catalog.pg_attribute
      where attrelid = ${quelle}::pg_catalog.regclass and attnum > 0 and not attisdropped`;
    // Nur Text: Jede Zeile wird mit den eingebauten Ausgabe-Funktionen der Spalten-Typen zu einer
    // Zeile wie „(1,abc,…)“. Keine Prüfregel, kein Index, keine berechnete Spalte, kein eigener
    // Typ wandert mit; beim Lesen, Schreiben oder Zurückspielen läuft nichts aus der alten Tabelle.
    await tx.unsafe(`create table ${ziel} (zeile text)`);
    await tx.unsafe(
      `insert into ${ziel} (zeile) select pg_catalog.textin(pg_catalog.record_out(t)) from ${quelle} t`,
    );
    await tx.unsafe(
      `comment on table ${ziel} is ${quoteLiteral(`aus ${schema}.${name}, Spalten: ${spalten?.liste ?? ""}`)}`,
    );
    await tx.unsafe(`drop table ${quelle} cascade`);
    result.push(`${schema}.${name} -> ${QUARANTINE_SCHEMA_NAME}.${target}`);
  }
  return result;
}

/** Entfernt von einer Tabelle Trigger, Regeln, Zeilen-Regeln und Standardwerte. */
async function neutralize(tx: postgres.TransactionSql, table: string): Promise<void> {
  const triggers = await tx<{ name: string }[]>`
    select tgname as name from pg_catalog.pg_trigger
    where tgrelid = ${table}::pg_catalog.regclass and not tgisinternal`;
  for (const { name } of triggers) {
    await tx.unsafe(`drop trigger ${quoteIdent(name)} on ${table}`);
  }
  const rules = await tx<{ name: string }[]>`
    select rulename as name from pg_catalog.pg_rewrite
    where ev_class = ${table}::pg_catalog.regclass and rulename <> '_RETURN'`;
  for (const { name } of rules) {
    await tx.unsafe(`drop rule ${quoteIdent(name)} on ${table}`);
  }
  const policies = await tx<{ name: string }[]>`
    select polname as name from pg_catalog.pg_policy
    where polrelid = ${table}::pg_catalog.regclass`;
  for (const { name } of policies) {
    await tx.unsafe(`drop policy ${quoteIdent(name)} on ${table}`);
  }
  await tx.unsafe(`alter table ${table} no force row level security`);
  await tx.unsafe(`alter table ${table} disable row level security`);
  const defaults = await tx<{ name: string }[]>`
    select a.attname as name from pg_catalog.pg_attribute a
    join pg_catalog.pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
    where a.attrelid = ${table}::pg_catalog.regclass and a.attnum > 0 and not a.attisdropped
      and a.attgenerated = ''`;
  for (const { name } of defaults) {
    await tx.unsafe(`alter table ${table} alter column ${quoteIdent(name)} drop default`);
  }
}

async function databaseName(sql: postgres.TransactionSql): Promise<string> {
  const [row] = await sql<{ name: string }[]>`select pg_catalog.current_database() as name`;
  if (row === undefined) throw new Error("Name der Datenbank fehlt.");
  return row.name;
}

/** Schema der Warteschlange anlegen bzw. mit allem darin an die App-Rolle übergeben. */
async function prepareQueueSchema(tx: postgres.TransactionSql, user: string): Promise<void> {
  const [schema] = await tx<{ owner: string }[]>`
    select pg_get_userbyid(nspowner) as owner from pg_namespace where nspname = ${QUEUE_SCHEMA_NAME}`;
  if (schema === undefined) {
    await tx`create schema ${tx(QUEUE_SCHEMA_NAME)} authorization ${tx(user)}`;
  } else if (schema.owner !== user) {
    await tx`alter schema ${tx(QUEUE_SCHEMA_NAME)} owner to ${tx(user)}`;
  }
  await tx.unsafe(
    `
    do $$
    declare
      obj record;
    begin
      for obj in
        select c.relname, c.relkind from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = ${quoteLiteral(QUEUE_SCHEMA_NAME)}
          and c.relkind in ('r', 'p', 'v', 'm', 'S')
          and c.relowner <> ${quoteLiteral(user)}::regrole
          and not (c.relkind = 'S' and exists (
            select 1 from pg_depend d where d.objid = c.oid and d.deptype in ('a', 'i')))
      loop
        execute format('alter %s %I.%I owner to %I',
          case obj.relkind when 'S' then 'sequence' when 'v' then 'view'
            when 'm' then 'materialized view' else 'table' end,
          ${quoteLiteral(QUEUE_SCHEMA_NAME)}, obj.relname, ${quoteLiteral(user)});
      end loop;
      for obj in
        select t.typname from pg_type t
        join pg_namespace n on n.oid = t.typnamespace
        where n.nspname = ${quoteLiteral(QUEUE_SCHEMA_NAME)}
          and t.typtype in ('e', 'd', 'c') and (t.typtype <> 'c' or t.typrelid = 0
            or (select relkind from pg_class where oid = t.typrelid) = 'c')
          and t.typowner <> ${quoteLiteral(user)}::regrole
      loop
        execute format('alter type %I.%I owner to %I',
          ${quoteLiteral(QUEUE_SCHEMA_NAME)}, obj.typname, ${quoteLiteral(user)});
      end loop;
      for obj in
        select p.oid::regprocedure::text as signature from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = ${quoteLiteral(QUEUE_SCHEMA_NAME)}
          and p.proowner <> ${quoteLiteral(user)}::regrole
      loop
        execute format('alter routine %s owner to %I', obj.signature, ${quoteLiteral(user)});
      end loop;
    end
    $$`,
  );

  // Die Warteschlange legt ihr Schema nicht selbst an; ein früher vergebenes Recht wird entzogen.
  await tx`revoke create on database ${tx(await databaseName(tx))} from ${tx(user)}`;
}

/**
 * Entzieht, was die App nicht braucht und was sich in Postgres entziehen lässt. Diese Rechte hat
 * in Postgres jede Rolle über `PUBLIC`; entzogen werden sie für alle Rollen dieser Datenbank. Ohne
 * die nötigen Rechte (die Migrations-Rolle ist kein Superuser) bleibt es bei einer Warnung im Log
 * der Datenbank, der Rest gilt trotzdem.
 */
async function withdrawExtras(
  tx: postgres.TransactionSql,
  user: string,
  database: string,
): Promise<void> {
  await tx`revoke temporary on database ${tx(database)} from ${tx(user)}`;
  await tx.unsafe(`
    do $$
    declare
      fn record;
    begin
      begin
        execute pg_catalog.format('revoke temporary on database %I from public', ${quoteLiteral(database)});
      exception when insufficient_privilege then
        raise warning 'temporäre Tabellen: Recht nicht entziehbar';
      end;
      for fn in
        select p.oid::pg_catalog.regprocedure::text as signature from pg_catalog.pg_proc p
        join pg_catalog.pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'pg_catalog'
          and p.proname in ('pg_terminate_backend', 'lo_create', 'lo_creat', 'lo_from_bytea')
      loop
        begin
          execute pg_catalog.format('revoke execute on function %s from public', fn.signature);
        exception when insufficient_privilege then
          raise warning 'Funktion %: Recht nicht entziehbar', fn.signature;
        end;
      end loop;
    end
    $$`);
}

function quoteIdent(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

function quoteLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

/** Eine dauerhafte, kleine Verbindung für wiederholte Prüfungen (z. B. den Health-Endpunkt). */
export interface RoleProbe {
  /** Prüft Erreichbarkeit und Rechte; wirft, wenn die Datenbank nicht antwortet. */
  probe(): Promise<RoleCheck["status"]>;
  end(): Promise<void>;
}

/**
 * Öffnet höchstens eine Verbindung (nach 60 s Leerlauf geschlossen) mit Zeitgrenzen für Aufbau
 * und Anweisung. Jeder Aufruf von `probe` nutzt dieselbe Verbindung.
 */
export function createRoleProbe(url: string, timeoutMs = 3000): RoleProbe {
  const sql = postgres(url, {
    max: 1,
    connect_timeout: Math.max(1, Math.ceil(timeoutMs / 1000)),
    idle_timeout: 60,
    onnotice: () => undefined,
    connection: {
      application_name: "paibot-health",
      search_path: APP_SEARCH_PATH,
      statement_timeout: timeoutMs,
    },
  });
  return {
    probe: async () => (await checkAppRole(sql)).status,
    end: () => sql.end({ timeout: 1 }),
  };
}
