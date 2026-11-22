/**
 * PaiBot – Update ab Stand 0016 auf Migration 0017 (Teams A) gegen echtes Postgres (nur mit
 * PAIBOT_TEST_DATABASE_URL), mit Bestandsdaten und mit der App-Rolle. Die Migration hat keinen Weg
 * zurück; deshalb gilt dieser Test dem Weg von einer bestehenden Installation aus.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { randomBytes } from "node:crypto";
import { readdirSync } from "node:fs";
import { newId } from "@paibot/shared";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "./migrate";
import { checkMigrationState } from "./rollen";
import {
  createPostgresTestDatabase,
  MIGRATIONS_FOLDER,
  migrationsUpTo,
  type PostgresTestDatabase,
  TEST_DATABASE_URL_ENV,
} from "./testing";

const BASE_URL = process.env[TEST_DATABASE_URL_ENV];
const RECHTE = "42501";
/** Fremdschlüssel verletzt (so meldet Postgres auch ein ON DELETE RESTRICT). */
const FREMDSCHLUESSEL = "23503";
const RESTRICT = "23001";
const CHECK = "23514";
const MIGRATIONS = readdirSync(MIGRATIONS_FOLDER).filter((f) => f.endsWith(".sql")).length;
/** Stand vor Teams A: die Migrationen 0000 bis 0016. */
const VOR_STAND = 17;

async function codeOf(promise: PromiseLike<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    const e = error as { code?: string; cause?: { code?: string } };
    return e.code ?? e.cause?.code;
  }
}

describe.skipIf(BASE_URL === undefined)("Update von 0016 auf Teams A (Postgres)", () => {
  const roleName = `paibot_app_test_${randomBytes(4).toString("hex")}`;
  const password = randomBytes(24).toString("hex");
  const bot1 = newId("bot");
  const bot2 = newId("bot");
  const unterhaltung1 = newId("conversation");
  const unterhaltung2 = newId("conversation");
  const nachricht1 = newId("message");
  const nachricht2 = newId("message");
  const nachricht3 = newId("message");
  const lauf1 = newId("run");
  const lauf2 = newId("run");
  let database: PostgresTestDatabase;
  let owner: postgres.Sql;
  let app: postgres.Sql;

  beforeAll(async () => {
    expect(MIGRATIONS).toBeGreaterThan(VOR_STAND);
    database = await createPostgresTestDatabase(BASE_URL ?? "", { migrate: false });
    owner = postgres(database.url, { max: 2, onnotice: () => undefined });
    // 1. Eine bestehende Installation auf dem Stand vor Teams A, mit Daten.
    await runMigrations(database.url, migrationsUpTo(VOR_STAND));
    await owner`insert into bots (id, name, instructions, avatar_shape, color)
      values (${bot1}, 'Pai', 'Hilf mir.', 'wabe', 'limette'), (${bot2}, 'Zweiter', '', 'wabe', 'pink')`;
    await owner`insert into settings (id, default_bot_id) values ('singleton', ${bot1})
      on conflict (id) do update set default_bot_id = excluded.default_bot_id`;
    await owner`insert into conversations (id, bot_id, title)
      values (${unterhaltung1}, ${bot1}, 'Erstes Gespräch'), (${unterhaltung2}, ${bot2}, 'Zweites')`;
    await owner`insert into messages (id, conversation_id, role, content)
      values (${nachricht1}, ${unterhaltung1}, 'user', 'Hallo'), (${nachricht2}, ${unterhaltung1}, 'assistant', 'Hi')`;
    await owner`insert into messages (id, conversation_id, role, content)
      values (${nachricht3}, ${unterhaltung2}, 'user', 'Frage an den Zweiten')`;
    await owner`insert into runs (id, conversation_id, trigger_message_id, bot_id, status)
      values (${lauf1}, ${unterhaltung1}, ${nachricht1}, ${bot1}, 'succeeded'),
             (${lauf2}, ${unterhaltung2}, ${nachricht3}, ${bot2}, 'succeeded')`;
    expect((await checkMigrationState(owner, MIGRATIONS_FOLDER)).status).toBe("veraltet");
    // 2. Update auf den aktuellen Stand, dabei die App-Rolle einrichten.
    const url = new URL(database.url);
    url.username = roleName;
    url.password = password;
    await runMigrations(database.url, MIGRATIONS_FOLDER, { appUrl: url.toString() });
    app = postgres(url.toString(), { max: 2, onnotice: () => undefined });
  }, 90_000);

  afterAll(async () => {
    await app?.end({ timeout: 2 });
    await owner?.end({ timeout: 2 });
    await database?.drop();
    const cleanup = postgres(BASE_URL ?? "", { max: 1, onnotice: () => undefined });
    try {
      await cleanup.unsafe(`drop role if exists ${roleName}`);
    } finally {
      await cleanup.end({ timeout: 2 });
    }
  });

  it("der Stand ist danach aktuell", async () => {
    expect(await checkMigrationState(owner, MIGRATIONS_FOLDER)).toMatchObject({
      status: "aktuell",
      applied: MIGRATIONS,
    });
  });

  // Gegenprobe: `kind` ohne Standard `'direkt'` anlegen → der Update scheitert an den Bestandszeilen.
  it("bestehende Unterhaltungen bleiben und sind Direkt-Chats mit ihrem Bot", async () => {
    const rows =
      await owner`select id, bot_id, kind, team_id, title from conversations order by title`;
    expect(rows.map((r) => [r.id, r.bot_id, r.kind, r.team_id])).toEqual([
      [unterhaltung1, bot1, "direkt", null],
      [unterhaltung2, bot2, "direkt", null],
    ]);
  });

  it("Nachrichten und Lauf sind unverändert", async () => {
    const m = await owner`select id, content, role from messages order by id`;
    expect(m.map((r) => r.content).sort()).toEqual(["Frage an den Zweiten", "Hallo", "Hi"]);
    const [lauf] =
      await owner`select bot_id, status, conversation_id from runs where id = ${lauf1}`;
    expect(lauf).toMatchObject({
      bot_id: bot1,
      status: "succeeded",
      conversation_id: unterhaltung1,
    });
  });

  it("Bots haben die neuen Spalten mit Startwerten, Einstellungen den Schalter aus", async () => {
    const rows =
      await owner`select name, paused, team_id, aus_entwurf_id, role from bots order by name`;
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r).toMatchObject({ paused: false, team_id: null, aus_entwurf_id: null, role: "" });
    }
    const [s] = await owner`select stabschef_erlaubt, default_bot_id from settings`;
    expect(s).toMatchObject({ stabschef_erlaubt: false, default_bot_id: bot1 });
  });

  it("die Standard-Regeln sind noch da", async () => {
    const regeln = await owner`select id from rules order by id`;
    expect(regeln.map((r) => r.id)).toContain("R-014");
  });

  // Gegenprobe: eine der 13 Aktionen aus der Migration 0018 streichen → der Test wird rot.
  it("die 13 Aktionen der Fassung 4 sind in den Werten der Regeln und der Belege erlaubt", async () => {
    const defs = await owner`select conname, pg_get_constraintdef(oid) as def from pg_constraint
      where conname in ('rules_action_werte', 'belege_action_werte')`;
    expect(defs).toHaveLength(2);
    for (const d of defs) {
      for (const aktion of [
        "bot.anlegen",
        "bot.loeschen",
        "bot.pausieren",
        "team.anlegen",
        "team.aendern",
        "team.loeschen",
        "bot.team_setzen",
        "team.entwurf_erstellen",
        "team.entwurf_verwerfen",
        "team.entwurf_anlegen",
        "team.entwurf_zuruecknehmen",
        "faden.anlegen",
        "einstellung.stabschef_setzen",
      ]) {
        expect(String(d.def), `${d.conname}: ${aktion}`).toContain(`'${aktion}'`);
      }
    }
  });

  // Gegenprobe: `runs.bot_id` wieder mit Kaskade → der Bot ist weg, der Lauf auch (Test rot).
  it("ein Bot mit Läufen lässt sich nicht löschen, die Daten bleiben", async () => {
    // `bot2` ist nicht der Standard-Bot: Nur die Läufe halten ihn.
    expect(await codeOf(owner`delete from bots where id = ${bot2}`)).toBe(FREMDSCHLUESSEL);
    expect(await owner`select id from runs where id = ${lauf2}`).toHaveLength(1);
    expect(await owner`select id from conversations where id = ${unterhaltung2}`).toHaveLength(1);
  });

  // Gegenprobe: `settings.default_bot_id` wieder `set null` → der Standard-Bot ist weg (Test rot).
  it("der Standard-Bot lässt sich nicht löschen", async () => {
    const bot3 = newId("bot");
    await owner`insert into bots (id, name, avatar_shape, color) values (${bot3}, 'Dritter', 'wabe', 'pink')`;
    await owner`update settings set default_bot_id = ${bot3}`;
    expect(await codeOf(owner`delete from bots where id = ${bot3}`)).toBe(FREMDSCHLUESSEL);
    await owner`update settings set default_bot_id = ${bot1}`;
  });

  it("eine Unterhaltung ohne Bot ist nur als Faden erlaubt (Direkt-Chat ohne Bot scheitert)", async () => {
    expect(
      await codeOf(
        owner`insert into conversations (id, bot_id, title, kind) values (${newId("conversation")}, null, 'x', 'direkt')`,
      ),
    ).toBe(CHECK);
  });

  describe("Rechte der App-Rolle", () => {
    it("Teams: anlegen, ändern, lesen ja", async () => {
      const id = newId("team");
      await app`insert into teams (id, name) values (${id}, 'Studio')`;
      await app`update teams set name = 'Studio 2' where id = ${id}`;
      expect(await app`select name from teams where id = ${id}`).toHaveLength(1);
    });

    // Gegenprobe: `team_anlagen` in `APP_TABLE_RIGHTS` auf Standard-Rechte setzen → rot.
    it("Anlagen eines Entwurfs: nur anhängen und lesen", async () => {
      const entwurf = newId("entwurf");
      await app`insert into team_entwuerfe (id, status, herkunft, quelle, titel, inhalt, abdruck, format_fassung)
        values (${entwurf}, 'offen', 'vorlage', 'content-team@2', 'Content-Team', '{}'::jsonb, ${`sha256:${"a".repeat(64)}`}, 2)`;
      await app`insert into team_anlagen (entwurf_id, objekt_art, objekt_id, stand_bei_anlage)
        values (${entwurf}, 'bot', ${bot1}, 'x')`;
      expect(await codeOf(app`update team_anlagen set stand_bei_anlage = 'y'`)).toBe(RECHTE);
      expect(await codeOf(app`delete from team_anlagen`)).toBe(RECHTE);
      // Auch als Besitzer der Tabelle bleibt es beim Anhängen (Trigger).
      expect(await codeOf(owner`update team_anlagen set stand_bei_anlage = 'y'`)).toBe(RESTRICT);
      expect(await codeOf(owner`delete from team_anlagen`)).toBe(RESTRICT);
    });

    it("Fäden: anlegen und lesen ja, löschen nur mit der Unterhaltung", async () => {
      const team = newId("team");
      await app`insert into teams (id, name) values (${team}, 'Faden-Team')`;
      const faden = newId("conversation");
      await app`insert into conversations (id, bot_id, title, kind, team_id)
        values (${faden}, null, 'Ein Faden', 'faden', ${team})`;
      await app`insert into faeden (conversation_id, ziel, abnahme, herkunft, action_id)
        values (${faden}, 'Etwas tun', 'leitung', 'besitzer', ${newId("action")})`;
      await app`insert into faden_punkte (conversation_id, pos, text) values (${faden}, 0, 'fertig')`;
      expect(await codeOf(app`delete from faeden where conversation_id = ${faden}`)).toBe(RECHTE);
      expect(await codeOf(app`delete from faden_punkte where conversation_id = ${faden}`)).toBe(
        RECHTE,
      );
      // Höchstens zwölf Punkte (Stelle 0 bis 11), jeder Text 1 bis 200 Zeichen.
      expect(
        await codeOf(
          app`insert into faden_punkte (conversation_id, pos, text) values (${faden}, 12, 'x')`,
        ),
      ).toBe(CHECK);
      expect(
        await codeOf(
          app`insert into faden_punkte (conversation_id, pos, text) values (${faden}, 1, '')`,
        ),
      ).toBe(CHECK);
      expect(
        await codeOf(
          app`insert into faden_punkte (conversation_id, pos, text) values (${faden}, 2, ${"x".repeat(201)})`,
        ),
      ).toBe(CHECK);
      expect(
        await codeOf(app`update faeden set ziel = 'anders' where conversation_id = ${faden}`),
      ).toBe(RECHTE);
      // Das Team ist mit einem Faden nicht löschbar; erst der Faden, dann das Team.
      expect(await codeOf(app`delete from teams where id = ${team}`)).toBe(FREMDSCHLUESSEL);
      await app`delete from conversations where id = ${faden}`;
      expect(await app`select 1 from faeden where conversation_id = ${faden}`).toHaveLength(0);
      expect(await app`select 1 from faden_punkte where conversation_id = ${faden}`).toHaveLength(
        0,
      );
      await app`delete from teams where id = ${team}`;
    });
  });
});
