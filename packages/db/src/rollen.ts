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

/** Schema der Warteschlange (pg-boss). Gehört der App-Rolle. */
export const QUEUE_SCHEMA_NAME = "pgboss";

/** Rechte der App-Rolle auf Tabellen, für die nicht die Standard-Rechte gelten. */
export const APP_TABLE_RIGHTS: Readonly<Record<string, string>> = {
  belege: "select, insert",
  rules: "select, insert",
  installation_keys: "select, insert, update (retired_at)",
  conversation_events: "select, insert, delete",
};

/** Rechte der App-Rolle auf alle übrigen Tabellen im Schema `public` (kein TRUNCATE). */
export const APP_DEFAULT_TABLE_RIGHTS = "select, insert, update, delete";

/** Tabellen, auf denen die App-Rolle weder ändern noch löschen noch leeren darf. */
const APPEND_ONLY_TABLES = ["belege", "rules"] as const;

/** Gründe, aus denen eine Verbindung zu viele Rechte hat. */
export type RoleIssue =
  | "superuser"
  | "bypassrls"
  | "createrole"
  | "replication"
  | "besitzer"
  | "schema_create"
  | "belege_aenderbar"
  | "replikationsmodus";

/** Ergebnis der Rechte-Prüfung einer Verbindung. */
export interface RoleCheck {
  status: "eingeschraenkt" | "zu_viele_rechte";
  /** Name der Rolle, mit der die Verbindung arbeitet. */
  role: string;
  issues: RoleIssue[];
}

/** Kurze deutsche Beschreibung der Gründe für das Log. */
export const ROLE_ISSUE_TEXT: Readonly<Record<RoleIssue, string>> = {
  superuser: "ist Superuser",
  bypassrls: "darf Zeilen-Regeln umgehen (BYPASSRLS)",
  createrole: "darf Rollen anlegen (CREATEROLE)",
  replication: "hat Replikationsrechte",
  besitzer: "ist Besitzer von Tabellen (kann Trigger abschalten)",
  schema_create: "darf im Schema public Objekte anlegen",
  belege_aenderbar: "darf Belege oder Regeln ändern, löschen oder leeren",
  replikationsmodus: "darf session_replication_role setzen",
};

/**
 * Prüft, mit welchen Rechten die Verbindung arbeitet. `eingeschraenkt` heißt: kein Superuser,
 * nicht Besitzer der Tabellen, keine Änderungsrechte auf Belegen und Regeln.
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
    }[]
  >`
    select
      current_user as role,
      r.rolsuper as superuser,
      r.rolbypassrls as bypassrls,
      r.rolcreaterole as createrole,
      r.rolreplication as replication,
      exists (
        select 1 from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p')
          and pg_has_role(current_user, c.relowner, 'USAGE')
      ) as besitzer,
      has_schema_privilege('public', 'CREATE') as schema_create,
      coalesce((
        select bool_or(
          has_table_privilege(c.oid, 'UPDATE')
          or has_table_privilege(c.oid, 'DELETE')
          or has_table_privilege(c.oid, 'TRUNCATE')
          or has_table_privilege(c.oid, 'TRIGGER')
        )
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname in ${sql(APPEND_ONLY_TABLES as unknown as string[])}
      ), false) as belege_aenderbar
    from pg_roles r
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
  ] as const) {
    if (row[key]) issues.push(key);
  }
  if (!row.superuser && (await maySetReplicationRole(sql))) issues.push("replikationsmodus");
  return {
    status: issues.length === 0 ? "eingeschraenkt" : "zu_viele_rechte",
    role: row.role,
    issues,
  };
}

/** Ab Postgres 15 lässt sich das Setzen einzelner Parameter erlauben; das prüfen wir mit. */
async function maySetReplicationRole(sql: postgres.Sql): Promise<boolean> {
  const [version] = await sql<{ n: number }[]>`
    select current_setting('server_version_num')::int as n`;
  if ((version?.n ?? 0) < 150000) return false;
  const [row] = await sql<{ ok: boolean }[]>`
    select has_parameter_privilege('session_replication_role', 'SET') as ok`;
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
    select to_regclass('drizzle.__drizzle_migrations') is not null as ok`;
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
}

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
 * 5. Schema der Warteschlange: gehört der App-Rolle. Solange die Warteschlange dort noch nicht
 *    eingerichtet ist, darf die App-Rolle Schemas in der Datenbank anlegen (das verlangt die
 *    Einrichtung von pg-boss); danach wird das Recht wieder entzogen.
 *
 * Gibt `undefined` zurück, wenn `appUrl` dieselbe Rolle nutzt wie `sql`.
 */
export async function prepareAppRole(
  sql: postgres.Sql,
  appUrl: string,
): Promise<AppRoleSetup | undefined> {
  const { user, password } = credentialsOf(appUrl);
  if (user === "") throw new Error("In DATABASE_URL fehlt der Benutzer der App-Rolle.");
  const [self] = await sql<{ name: string }[]>`select current_user as name`;
  if (self?.name === user) return undefined;

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

  await sql.begin(async (tx) => {
    const role = tx(user);
    await tx`grant connect on database ${tx(await databaseName(tx))} to ${role}`;
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
    await tx.unsafe(
      `alter default privileges in schema public grant ${APP_DEFAULT_TABLE_RIGHTS} on tables to ${quoteIdent(user)}`,
    );
    await tx.unsafe(
      `alter default privileges in schema public grant usage, select on sequences to ${quoteIdent(user)}`,
    );

    const [drizzleTable] = await tx<{ ok: boolean }[]>`
      select to_regclass('drizzle.__drizzle_migrations') is not null as ok`;
    if (drizzleTable?.ok === true) {
      await tx`grant usage on schema drizzle to ${role}`;
      await tx`grant select on drizzle.__drizzle_migrations to ${role}`;
    }

    await prepareQueueSchema(tx, user);
  });

  return { role: user, created };
}

async function databaseName(sql: postgres.TransactionSql): Promise<string> {
  const [row] = await sql<{ name: string }[]>`select current_database() as name`;
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

  const database = tx(await databaseName(tx));
  const [installed] = await tx<{ ok: boolean }[]>`
    select to_regclass(${`${QUEUE_SCHEMA_NAME}.version`}) is not null as ok`;
  if (installed?.ok === true) {
    await tx`revoke create on database ${database} from ${tx(user)}`;
  } else {
    await tx`grant create on database ${database} to ${tx(user)}`;
  }
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
    connection: { application_name: "paibot-health", statement_timeout: timeoutMs },
  });
  return {
    probe: async () => (await checkAppRole(sql)).status,
    end: () => sql.end({ timeout: 1 }),
  };
}
