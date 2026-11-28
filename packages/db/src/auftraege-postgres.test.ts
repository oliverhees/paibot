/**
 * PaiBot – Update ab Stand 0019 auf Migration 0020 (Aufträge) gegen echtes Postgres (nur mit
 * PAIBOT_TEST_DATABASE_URL): Bestandsdaten bleiben, Rechte der App-Rolle auf den neuen Tabellen
 * und Spalten, und der Teil-Index „ein aktiver Lauf je Auftragsbaum“ mit zwei Verbindungen. Die
 * frische Datenbank prüfen `migrations.test.ts` (PGlite) und `migrate-postgres.test.ts`.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

import { randomBytes } from "node:crypto";
import { readdirSync } from "node:fs";
import { type BotId, newId } from "@paibot/shared";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BelegKette } from "./apps-testhilfe";
import { createDb, type Database } from "./client";
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
const RESTRICT = "23001";
const EINDEUTIG = "23505";
const MIGRATIONS = readdirSync(MIGRATIONS_FOLDER).filter((f) => f.endsWith(".sql")).length;
/** Stand vor den Aufträgen: die Migrationen 0000 bis 0019. */
const VOR_STAND = 20;

async function codeOf(promise: PromiseLike<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    const e = error as { code?: string; cause?: { code?: string } };
    return e.code ?? e.cause?.code;
  }
}

describe.skipIf(BASE_URL === undefined)("Update von 0019 auf die Aufträge (Postgres)", () => {
  const roleName = `paibot_app_test_${randomBytes(4).toString("hex")}`;
  const password = randomBytes(24).toString("hex");
  const pai = newId("bot");
  const ideen = newId("bot");
  const team = newId("team");
  const chat = newId("conversation");
  const chat2 = newId("conversation");
  const faden = newId("conversation");
  const fadenBelastet = newId("conversation");
  const frage = newId("message");
  const antwort = newId("message");
  const imFaden = newId("message");
  const fremdImFaden = newId("message");
  const lauf = newId("run");
  let database: PostgresTestDatabase;
  let owner: postgres.Sql;
  let app: postgres.Sql;
  let app2: postgres.Sql;
  let appDb: { db: Database; close: () => Promise<void> };
  let vorher: string;

  const bestand = async () =>
    JSON.stringify([
      await owner`select id, bot_id, kind, team_id, title from conversations order by id`,
      await owner`select id, conversation_id, role, content, status, origin, untrusted, run_id from messages order by id`,
      await owner`select id, conversation_id, bot_id, status from runs order by id`,
      await owner`select conversation_id, ziel, abnahme, herkunft, action_id from faeden order by conversation_id`,
    ]);

  beforeAll(async () => {
    expect(MIGRATIONS).toBeGreaterThan(VOR_STAND);
    database = await createPostgresTestDatabase(BASE_URL ?? "", { migrate: false });
    owner = postgres(database.url, { max: 2, onnotice: () => undefined });
    // 1. Eine Installation auf dem Stand 0019 mit Unterhaltungen, Nachrichten, Lauf und Faden.
    await runMigrations(database.url, migrationsUpTo(VOR_STAND));
    await owner`insert into bots (id, name, instructions, avatar_shape, color)
      values (${pai}, 'Pai', 'Hilf mir.', 'wabe', 'limette'), (${ideen}, 'Ideen', '', 'wabe', 'pink')`;
    await owner`insert into settings (id, default_bot_id) values ('singleton', ${pai})
      on conflict (id) do update set default_bot_id = excluded.default_bot_id`;
    await owner`insert into teams (id, name) values (${team}, 'Studio')`;
    await owner`insert into conversations (id, bot_id, title) values (${chat}, ${pai}, 'Erstes'), (${chat2}, ${ideen}, 'Zweites')`;
    await owner`insert into conversations (id, bot_id, title, kind, team_id)
      values (${faden}, null, 'Faden', 'faden', ${team}), (${fadenBelastet}, null, 'Fremd', 'faden', ${team})`;
    await owner`insert into faeden (conversation_id, ziel, abnahme, herkunft, action_id)
      values (${faden}, 'Ein Video', 'leitung', 'besitzer', ${newId("action")}),
             (${fadenBelastet}, 'Eine Recherche', 'leitung', 'besitzer', ${newId("action")})`;
    await owner`insert into messages (id, conversation_id, role, content) values (${frage}, ${chat}, 'user', 'Hallo')`;
    await owner`insert into runs (id, conversation_id, trigger_message_id, bot_id, status, finished_at)
      values (${lauf}, ${chat}, ${frage}, ${pai}, 'succeeded', now())`;
    await owner`insert into messages (id, conversation_id, role, content, run_id, untrusted)
      values (${antwort}, ${chat}, 'assistant', 'Hi', ${lauf}, true)`;
    // Eine alte Antwort ohne Autor in einem Faden: bleibt erlaubt (die Pflicht gilt für neue Zeilen).
    await owner`insert into messages (id, conversation_id, role, content) values (${imFaden}, ${faden}, 'assistant', 'Alt')`;
    // Ein alter Faden mit fremdem Inhalt: Er muss nach dem Update als belastet gelten.
    await owner`insert into messages (id, conversation_id, role, content, untrusted)
      values (${fremdImFaden}, ${fadenBelastet}, 'assistant', 'Von einer Webseite', true)`;
    vorher = await bestand();
    expect((await checkMigrationState(owner, MIGRATIONS_FOLDER)).status).toBe("veraltet");
    // 2. Update auf den neuesten Stand, dabei die App-Rolle einrichten.
    const url = new URL(database.url);
    url.username = roleName;
    url.password = password;
    await runMigrations(database.url, MIGRATIONS_FOLDER, { appUrl: url.toString() });
    app = postgres(url.toString(), { max: 2, onnotice: () => undefined });
    app2 = postgres(url.toString(), { max: 1, onnotice: () => undefined });
    const verbindung = createDb(url.toString());
    appDb = {
      db: verbindung.db as unknown as Database,
      close: () => verbindung.sql.end({ timeout: 2 }),
    };
  }, 90_000);

  afterAll(async () => {
    await appDb?.close();
    await app2?.end({ timeout: 2 });
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

  it("bestehende Unterhaltungen, Nachrichten, Läufe und Fäden sind unverändert", async () => {
    expect(await bestand()).toBe(vorher);
    const [m] =
      await owner`select bot_id, auftrag_id, frage_bezug from messages where id = ${antwort}`;
    expect(m).toEqual({ bot_id: null, auftrag_id: null, frage_bezug: null });
    const [r] =
      await owner`select auftrag_id, auftrag_root_id, untrusted_input, finish_reason from runs where id = ${lauf}`;
    expect(r).toEqual({
      auftrag_id: null,
      auftrag_root_id: null,
      untrusted_input: null,
      finish_reason: null,
    });
    const [f] =
      await owner`select stand, stab_bei, belastet from faeden where conversation_id = ${faden}`;
    expect(f).toEqual({ stand: "laufend", stab_bei: null, belastet: false });
    const [s] = await owner`select notaus_epoche, auftrag_max_tokens from settings`;
    expect(s).toEqual({ notaus_epoche: 0, auftrag_max_tokens: 200000 });
  });

  it("alte Fäden mit fremdem Inhalt gelten nach dem Update als belastet, saubere nicht", async () => {
    const zeilen =
      await owner`select conversation_id, belastet from faeden order by conversation_id`;
    expect(Object.fromEntries(zeilen.map((z) => [z.conversation_id, z.belastet]))).toEqual({
      [faden]: false,
      [fadenBelastet]: true,
    });
  });

  describe("mit der App-Rolle", () => {
    let kette: BelegKette;
    let wurzel: string;

    async function neueWurzel(konv = chat, bot: BotId = pai): Promise<string> {
      const actionId = await kette.entscheidung({
        type: "nachricht.senden",
        target: { conversationId: konv, messageId: newId("message") },
        facts: { credential: "sitzung" },
      });
      const id = newId("auftrag");
      await app`insert into auftraege (id, art, root_id, conversation_id, bot_id, geber, zettel, action_id, notaus_epoche)
        values (${id}, 'wurzel', ${id}, ${konv}, ${bot}, 'besitzer', 'Plan', ${actionId}, (select notaus_epoche from settings))`;
      return id;
    }

    beforeAll(async () => {
      kette = new BelegKette(appDb.db);
      wurzel = await neueWurzel();
    });

    // Gegenprobe: `auftraege` in `APP_TABLE_RIGHTS` auf Standard-Rechte setzen → rot.
    it("Aufträge: anlegen und lesen ja, löschen und feste Spalten ändern nein", async () => {
      expect(await app`select id from auftraege where id = ${wurzel}`).toHaveLength(1);
      expect(await codeOf(app`delete from auftraege where id = ${wurzel}`)).toBe(RECHTE);
      expect(await codeOf(app`update auftraege set zettel = 'anders' where id = ${wurzel}`)).toBe(
        RECHTE,
      );
      expect(
        await codeOf(app`update auftraege set action_id = ${newId("action")} where id = ${wurzel}`),
      ).toBe(RECHTE);
      // Auch als Besitzer der Tabelle bleibt der Zettel fest (Trigger).
      expect(await codeOf(owner`update auftraege set zettel = 'anders' where id = ${wurzel}`)).toBe(
        RESTRICT,
      );
      // Den Stand darf die App ändern, aber nur auf erlaubten Wegen (Trigger).
      expect(
        await codeOf(
          app`update auftraege set status = 'fertig', finished_at = now() where id = ${wurzel}`,
        ),
      ).toBe(RESTRICT);
    });

    // Gegenprobe: `auftrag_ereignisse` in `APP_TABLE_RIGHTS` auf Standard-Rechte setzen → rot.
    it("Ereignisse und Zuschläge: nur anhängen und lesen", async () => {
      expect(await app`select seq from auftrag_ereignisse`).not.toHaveLength(0);
      expect(await codeOf(app`update auftrag_ereignisse set type = 'stab.moved'`)).toBe(RECHTE);
      expect(await codeOf(app`delete from auftrag_ereignisse`)).toBe(RECHTE);
      expect(await codeOf(app`truncate auftrag_ereignisse`)).toBe(RECHTE);
      const actionId = await kette.entscheidung({
        type: "auftrag.budget_erhoehen",
        target: { conversationId: chat, auftragId: wurzel },
        facts: {},
      });
      await app`insert into auftrag_zuschlaege (auftrag_root_id, nr, action_id) values (${wurzel}, 0, ${actionId})`;
      expect(await codeOf(app`update auftrag_zuschlaege set nr = 2`)).toBe(RECHTE);
      expect(await codeOf(app`delete from auftrag_zuschlaege`)).toBe(RECHTE);
      // Auch als Besitzer der Tabellen bleibt es beim Anhängen (Trigger).
      expect(await codeOf(owner`update auftrag_ereignisse set type = 'stab.moved'`)).toBe(RESTRICT);
      expect(await codeOf(owner`delete from auftrag_zuschlaege`)).toBe(RESTRICT);
    });

    // Gegenprobe: `bot_id` in die Spalten-Liste von `messages` aufnehmen → rot.
    it("Nachrichten: Autor, Auftrag und Bezug ändert die App nie", async () => {
      expect(await codeOf(app`update messages set bot_id = ${pai} where id = ${antwort}`)).toBe(
        RECHTE,
      );
      expect(
        await codeOf(app`update messages set auftrag_id = ${wurzel} where id = ${antwort}`),
      ).toBe(RECHTE);
      // Inhalt einer abgeschlossenen Nachricht: Recht ja (für das Abschließen), Trigger nein.
      expect(await codeOf(app`update messages set content = 'anders' where id = ${antwort}`)).toBe(
        RESTRICT,
      );
    });

    it("Fäden: Stand, Staffelstab und belastet ja, Ziel nein, belastet nie zurück", async () => {
      await app`update faeden set stand = 'wartet_auf_dich', stab_bei = 'besitzer', belastet = true where conversation_id = ${faden}`;
      expect(
        await codeOf(app`update faeden set ziel = 'anders' where conversation_id = ${faden}`),
      ).toBe(RECHTE);
      expect(
        await codeOf(app`update faeden set belastet = false where conversation_id = ${faden}`),
      ).toBe(RESTRICT);
    });

    it("Not-Aus-Epoche: nur mit dem Schalter", async () => {
      expect(await codeOf(app`update settings set notaus_epoche = 1`)).toBe(RESTRICT);
      await app`update settings set kill_switch = true`;
      await app`update settings set kill_switch = false`;
      const [s] = await app`select notaus_epoche from settings`;
      expect(s?.notaus_epoche).toBe(1);
    });

    // Gegenprobe: den Teil-Index `runs_ein_aktiver_lauf_je_auftragsbaum` entfernen → der zweite
    // Lauf geht durch, rot.
    it("zwei Verbindungen: im selben Auftragsbaum entsteht nur ein aktiver Lauf", async () => {
      const w = await neueWurzel();
      const kind = newId("auftrag");
      const uebergabe = await kette.entscheidung({
        type: "auftrag.uebergeben",
        actor: `bot:${pai}`,
        target: { conversationId: chat2, toBotId: ideen },
        facts: {},
      });
      await app`insert into auftraege (id, art, parent_auftrag_id, root_id, conversation_id, bot_id, geber, action_id, notaus_epoche)
        values (${kind}, 'uebergabe', ${w}, ${w}, ${chat2}, ${ideen}, ${`bot:${pai}`}, ${uebergabe}, (select notaus_epoche from settings))`;
      const m1 = newId("message");
      const m2 = newId("message");
      await app`insert into messages (id, conversation_id, role, content) values (${m1}, ${chat}, 'user', 'a'), (${m2}, ${chat2}, 'user', 'b')`;
      let zweiter: Promise<string | undefined> | undefined;
      await app.begin(async (tx) => {
        await tx`insert into runs (id, conversation_id, trigger_message_id, bot_id, auftrag_id, auftrag_root_id, untrusted_input)
          values (${newId("run")}, ${chat}, ${m1}, ${pai}, ${w}, ${w}, false)`;
        // Die zweite Verbindung wartet auf die erste und scheitert nach deren Abschluss. Der
        // Fehler wird sofort abgefangen: er kann eintreffen, bevor der Test wieder wartet.
        zweiter = codeOf(
          app2`insert into runs (id, conversation_id, trigger_message_id, bot_id, auftrag_id, auftrag_root_id, untrusted_input)
          values (${newId("run")}, ${chat2}, ${m2}, ${ideen}, ${kind}, ${w}, false)`.execute(),
        );
        await new Promise((resolve) => setTimeout(resolve, 300));
      });
      expect(await zweiter).toBe(EINDEUTIG);
      const aktiv = await owner`select id from runs where auftrag_root_id = ${w}`;
      expect(aktiv).toHaveLength(1);
    });
  });
});
