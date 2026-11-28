/**
 * PaiBot – Tests der Worker-Rolle gegen echtes Postgres (nur mit PAIBOT_TEST_DATABASE_URL): Der
 * Worker liest, was er für Läufe braucht, schreibt nur Läufe, Nachrichten, Ereignisse, Werkzeug-
 * Aufrufe, Belege und Aufträge und scheitert an Bots, Teams, Entwürfen und dem Kopf eines Fadens.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

import { randomBytes } from "node:crypto";
import { newId } from "@paibot/shared";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "./migrate";
import { checkMigrationState, checkWorkerRole, WORKER_TABLE_RIGHTS } from "./rollen";
import {
  createPostgresTestDatabase,
  MIGRATIONS_FOLDER,
  type PostgresTestDatabase,
  TEST_DATABASE_URL_ENV,
} from "./testing";

const BASE_URL = process.env[TEST_DATABASE_URL_ENV];
/** Postgres: Recht fehlt. */
const RECHTE = "42501";

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

describe.skipIf(BASE_URL === undefined)("Worker-Rolle gegen echtes Postgres", () => {
  const suffix = randomBytes(4).toString("hex");
  const appRole = `paibot_app_test_${suffix}`;
  const workerRole = `paibot_worker_test_${suffix}`;
  const appPassword = randomBytes(24).toString("hex");
  const workerPassword = randomBytes(24).toString("hex");
  const bot = newId("bot");
  const team = newId("team");
  const chat = newId("conversation");
  const faden = newId("conversation");
  const frage = newId("message");
  const lauf = newId("run");
  let database: PostgresTestDatabase;
  let owner: postgres.Sql;
  let app: postgres.Sql;
  let worker: postgres.Sql;
  let appUrl: string;
  let workerUrl: string;

  beforeAll(async () => {
    database = await createPostgresTestDatabase(BASE_URL ?? "", { migrate: false });
    appUrl = withUser(database.url, appRole, appPassword);
    workerUrl = withUser(database.url, workerRole, workerPassword);
    const result = await runMigrations(database.url, MIGRATIONS_FOLDER, { appUrl, workerUrl });
    expect(result.workerRole).toEqual({ role: workerRole, created: true });
    owner = postgres(database.url, { max: 2, onnotice: () => undefined });
    app = postgres(appUrl, { max: 1, onnotice: () => undefined });
    worker = postgres(workerUrl, { max: 2, onnotice: () => undefined });
    await owner`insert into bots (id, name, instructions, avatar_shape, color)
      values (${bot}, 'Pai', 'Hilf mir.', 'wabe', 'limette')`;
    await owner`insert into settings (id, default_bot_id) values ('singleton', ${bot})
      on conflict (id) do update set default_bot_id = excluded.default_bot_id`;
    await owner`insert into teams (id, name) values (${team}, 'Studio')`;
    await owner`insert into conversations (id, bot_id, title) values (${chat}, ${bot}, 'Chat')`;
    await owner`insert into conversations (id, bot_id, title, kind, team_id)
      values (${faden}, null, 'Faden', 'faden', ${team})`;
    await owner`insert into faeden (conversation_id, ziel, abnahme, herkunft, action_id)
      values (${faden}, 'Ein Video', 'leitung', 'besitzer', ${newId("action")})`;
    await owner`insert into messages (id, conversation_id, role, content)
      values (${frage}, ${chat}, 'user', 'Hallo')`;
    await owner`insert into runs (id, conversation_id, trigger_message_id, bot_id, status)
      values (${lauf}, ${chat}, ${frage}, ${bot}, 'queued')`;
  }, 90_000);

  afterAll(async () => {
    await worker?.end({ timeout: 2 });
    await app?.end({ timeout: 2 });
    await owner?.end({ timeout: 2 });
    await database?.drop();
    const cleanup = postgres(BASE_URL ?? "", { max: 1, onnotice: () => undefined });
    try {
      await cleanup.unsafe(`drop role if exists ${workerRole}`);
      await cleanup.unsafe(`drop role if exists ${appRole}`);
    } finally {
      await cleanup.end({ timeout: 2 });
    }
  });

  it("die Rolle hat keine Sonderrechte und nur LOGIN", async () => {
    const [row] = await owner`
      select rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls, rolcanlogin, rolinherit
      from pg_roles where rolname = ${workerRole}`;
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

  it("Bots, Teams und Team-Entwürfe: anlegen, ändern und löschen scheitern", async () => {
    const versuche: [string, string][] = [
      [
        "bots insert",
        `insert into bots (id, name, instructions, avatar_shape, color) values ('${newId("bot")}', 'X', '', 'wabe', 'pink')`,
      ],
      ["bots update", `update bots set name = 'Umbenannt' where id = '${bot}'`],
      ["bots delete", `delete from bots where id = '${bot}'`],
      ["teams insert", `insert into teams (id, name) values ('${newId("team")}', 'Fremd')`],
      ["teams update", `update teams set name = 'Umbenannt' where id = '${team}'`],
      ["teams delete", `delete from teams where id = '${team}'`],
      ["team_entwuerfe insert", "insert into team_entwuerfe (id) values ('x')"],
      ["team_entwuerfe update", "update team_entwuerfe set status = 'verworfen'"],
      ["team_entwuerfe delete", "delete from team_entwuerfe"],
      ["team_anlagen insert", "insert into team_anlagen (entwurf_id) values ('x')"],
    ];
    for (const [name, statement] of versuche) {
      expect(await codeOf(worker.unsafe(statement)), name).toBe(RECHTE);
    }
    const [unveraendert] = await owner`select name from bots where id = ${bot}`;
    expect(unveraendert?.name).toBe("Pai");
  });

  it("Faden: Kopf-Felder ändern, anlegen und löschen scheitern; Stand, Staffelstab und „belastet“ gehen", async () => {
    for (const spalte of ["ziel", "abnahme", "herkunft", "action_id", "updated_at", "created_at"]) {
      expect(
        await codeOf(
          worker.unsafe(`update faeden set ${spalte} = ${spalte} where conversation_id = $1`, [
            faden,
          ]),
        ),
        spalte,
      ).toBe(RECHTE);
    }
    expect(
      await codeOf(
        worker`insert into faeden (conversation_id, ziel, abnahme, herkunft, action_id)
          values (${chat}, 'Fremd', 'leitung', 'besitzer', ${newId("action")})`,
      ),
    ).toBe(RECHTE);
    expect(await codeOf(worker`delete from faeden where conversation_id = ${faden}`)).toBe(RECHTE);
    expect(
      await codeOf(
        worker`insert into faden_punkte (conversation_id, pos, text) values (${faden}, 0, 'x')`,
      ),
    ).toBe(RECHTE);

    await worker`update faeden set stand = 'wartet_auf_dich', stab_bei = ${`bot:${bot}`}, belastet = true
      where conversation_id = ${faden}`;
    const [kopf] =
      await owner`select ziel, stand, stab_bei, belastet from faeden where conversation_id = ${faden}`;
    expect(kopf).toEqual({
      ziel: "Ein Video",
      stand: "wartet_auf_dich",
      stab_bei: `bot:${bot}`,
      belastet: true,
    });
  });

  it("Besitzer, Sitzungen, Geräte und Bremsen der Anmeldung sieht der Worker gar nicht", async () => {
    for (const tabelle of ["owner", "sessions", "geraete", "rate_limits"]) {
      expect(await codeOf(worker.unsafe(`select 1 from ${tabelle} limit 1`)), tabelle).toBe(RECHTE);
    }
  });

  it("die Arbeit eines Laufs geht: lesen, Lauf fortschreiben, Nachricht anlegen, Ereignis anhängen", async () => {
    const [gelesen] = await worker`select b.name, c.title from bots b
      join conversations c on c.bot_id = b.id where c.id = ${chat}`;
    expect(gelesen).toEqual({ name: "Pai", title: "Chat" });
    await worker`update runs set status = 'running', started_at = now() where id = ${lauf}`;
    const antwort = newId("message");
    await worker`insert into messages (id, conversation_id, role, content, run_id, status)
      values (${antwort}, ${chat}, 'assistant', '', ${lauf}, 'streaming')`;
    await worker`update messages set content = 'Hi', status = 'complete' where id = ${antwort}`;
    await worker`update conversations set last_message_at = now(), updated_at = now() where id = ${chat}`;
    await worker`insert into conversation_events (conversation_id, seq, run_id, type, payload)
      values (${chat}, 1, ${lauf}, 'run.started', '{}'::jsonb)`;
    expect(await codeOf(worker`update conversations set title = 'Fremd' where id = ${chat}`)).toBe(
      RECHTE,
    );
    expect(await codeOf(worker`delete from conversations where id = ${chat}`)).toBe(RECHTE);
    expect(await codeOf(worker`insert into runs (id) values ('x')`)).toBe(RECHTE);
    expect(await codeOf(worker`delete from conversation_events`)).toBe(RECHTE);
  });

  it("die Rechte jeder Tabelle stehen in Postgres genau wie in WORKER_TABLE_RIGHTS", async () => {
    const rows = await owner<{ name: string; rights: string | null }[]>`
      select c.relname as name, string_agg(p.privilege_type, ', ' order by p.privilege_type) as rights
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      left join information_schema.table_privileges p
        on p.table_schema = 'public' and p.table_name = c.relname and p.grantee = ${workerRole}
      where n.nspname = 'public' and c.relkind in ('r', 'p')
      group by c.relname order by c.relname`;
    const tableLevel = (rights: string) =>
      rights
        .replace(/\w+\s*\([^)]*\)/g, "")
        .split(",")
        .map((right) => right.trim())
        .filter((right) => right !== "")
        .map((right) => right.toUpperCase())
        .sort()
        .join(", ");
    expect(Object.fromEntries(rows.map((row) => [row.name, row.rights ?? ""]))).toEqual(
      Object.fromEntries(
        Object.entries(WORKER_TABLE_RIGHTS)
          .map(([name, rights]) => [name, tableLevel(rights)] as const)
          .sort(([a], [b]) => a.localeCompare(b)),
      ),
    );

    const columns = await owner<{ name: string; columns: string }[]>`
      select table_name as name, string_agg(column_name, ', ' order by column_name) as columns
      from information_schema.column_privileges
      where table_schema = 'public' and grantee = ${workerRole} and privilege_type = 'UPDATE'
      group by table_name order by table_name`;
    const erwartet = Object.entries(WORKER_TABLE_RIGHTS)
      .map(([name, rights]) => {
        const liste = /update\s*\(([^)]*)\)/.exec(rights)?.[1];
        return [
          name,
          liste
            ?.split(",")
            .map((column) => column.trim())
            .sort()
            .join(", "),
        ] as const;
      })
      .filter((eintrag): eintrag is readonly [string, string] => eintrag[1] !== undefined);
    const ganzeTabelle = rows
      .filter((row) => (row.rights ?? "").includes("UPDATE"))
      .map((row) => row.name);
    expect(
      Object.fromEntries(
        columns
          .filter((row) => !ganzeTabelle.includes(row.name))
          .map((row) => [row.name, row.columns]),
      ),
    ).toEqual(Object.fromEntries(erwartet));
  });

  it("checkWorkerRole: die Worker-Rolle ist eingeschränkt, die App-Rolle darf zu viel", async () => {
    expect(await checkWorkerRole(worker)).toEqual({
      status: "eingeschraenkt",
      role: workerRole,
      issues: [],
    });
    const mitAppRolle = await checkWorkerRole(app);
    expect(mitAppRolle.status).toBe("zu_viele_rechte");
    expect(mitAppRolle.issues).toEqual(["besitzer_tabellen_schreibbar", "warteschlange_besitzer"]);
  });

  it("die Worker-Rolle liest den Stand der Migrationen und besitzt nichts", async () => {
    expect((await checkMigrationState(worker, MIGRATIONS_FOLDER)).status).toBe("aktuell");
    const [besitz] = await owner<{ n: number }[]>`
      select (select count(*) from pg_class where relowner = ${workerRole}::regrole)
        + (select count(*) from pg_namespace where nspowner = ${workerRole}::regrole) as n`;
    expect(Number(besitz?.n)).toBe(0);
    expect(await codeOf(worker`create table public.fremd (x int)`)).toBe(RECHTE);
  });

  it("ein zweiter Lauf ist wiederholbar und setzt Einstellungen und Passwort der Rolle zurück", async () => {
    await owner.unsafe(`alter role ${workerRole} set search_path = 'fremd'`);
    const result = await runMigrations(database.url, MIGRATIONS_FOLDER, { appUrl, workerUrl });
    expect(result.workerRole).toEqual({ role: workerRole, created: false });
    const [einstellungen] = await owner<{ n: number }[]>`
      select count(*)::int as n from pg_db_role_setting where setrole = ${workerRole}::regrole`;
    expect(einstellungen?.n).toBe(0);
  });

  it("dieselbe Rolle für App und Worker lehnt der Migrations-Schritt ab", async () => {
    await expect(
      runMigrations(database.url, MIGRATIONS_FOLDER, { appUrl, workerUrl: appUrl }),
    ).rejects.toThrow(/eigene Rolle/);
    await expect(
      runMigrations(database.url, MIGRATIONS_FOLDER, { appUrl, workerUrl: database.url }),
    ).rejects.toThrow(/eigene Rolle/);
  });
});
