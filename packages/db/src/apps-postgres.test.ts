/**
 * PaiBot – Tests der Apps-Datenbank mit der App-Rolle gegen echtes Postgres (nur mit
 * PAIBOT_TEST_DATABASE_URL): Rechte auf den Tabellen, Trigger und Zugriffsfunktionen unter der
 * Rolle der App; dazu der Aufstieg vom Stand vor der Migration mit Bestandsdaten.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { randomBytes } from "node:crypto";
import { type BotId, newId } from "@paibot/shared";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { abdruck, BelegKette, tokenV2, zielAbdruck } from "./apps-testhilfe";
import { createDb, type Database } from "./client";
import { runMigrations } from "./migrate";
import { apps, bots, conversations, messages, runs, settings } from "./repo";
import { checkAppRole, checkMigrationState } from "./rollen";
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

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    const e = error as { code?: string; cause?: { code?: string } };
    return e.code ?? e.cause?.code;
  }
}

describe.skipIf(BASE_URL === undefined)("Apps mit der App-Rolle (Postgres)", () => {
  const roleName = `paibot_app_test_${randomBytes(4).toString("hex")}`;
  const password = randomBytes(24).toString("hex");
  let database: PostgresTestDatabase;
  let app: postgres.Sql;
  let db: Database;
  let schliessen: () => Promise<void>;
  let kette: BelegKette;
  let botId: BotId;

  beforeAll(async () => {
    database = await createPostgresTestDatabase(BASE_URL ?? "", { migrate: false });
    const url = new URL(database.url);
    url.username = roleName;
    url.password = password;
    await runMigrations(database.url, MIGRATIONS_FOLDER, { appUrl: url.toString() });
    app = postgres(url.toString(), { max: 2, onnotice: () => undefined });
    const verbindung = createDb(url.toString());
    db = verbindung.db as unknown as Database;
    schliessen = () => verbindung.sql.end({ timeout: 2 });
    await settings.ensure(db);
    kette = new BelegKette(db);
    botId = (await bots.create(db, { name: "Pai", avatarShape: "blatt", color: "blau" })).id;
  }, 60_000);

  afterAll(async () => {
    await app?.end({ timeout: 2 });
    await schliessen?.();
    await database?.drop();
    const cleanup = postgres(BASE_URL ?? "", { max: 1, onnotice: () => undefined });
    try {
      await cleanup.unsafe(`drop role if exists ${roleName}`);
    } finally {
      await cleanup.end({ timeout: 2 });
    }
  });

  it("die App-Rolle bleibt eingeschränkt, der Stand der Migrationen ist der neueste", async () => {
    expect(await checkAppRole(app)).toMatchObject({ status: "eingeschraenkt", issues: [] });
    expect((await checkMigrationState(app, MIGRATIONS_FOLDER)).status).toBe("aktuell");
  });

  it("app_tools und bot_app_grants: kein Ändern, kein Löschen, kein Leeren (42501)", async () => {
    for (const tabelle of ["app_tools", "bot_app_grants"]) {
      expect(await codeOf(app.unsafe(`update ${tabelle} set created_at = now()`)), tabelle).toBe(
        RECHTE,
      );
      expect(await codeOf(app.unsafe(`delete from ${tabelle}`)), tabelle).toBe(RECHTE);
      expect(await codeOf(app.unsafe(`truncate ${tabelle}`)), tabelle).toBe(RECHTE);
    }
  });

  it("apps: lesen, anlegen, ausgewählte Spalten ändern; Kennung und Kurzname fest; nie löschen", async () => {
    const angelegt = await apps.create(db, {
      shortName: "rechte",
      name: "Rechte",
      url: "https://rechte.beispiel.test/mcp",
      authKind: "token",
      tokenEnc: tokenV2(),
    });
    expect(
      await codeOf(app.unsafe(`update apps set name = 'Neu' where id = '${angelegt.id}'`)),
    ).toBe(undefined);
    for (const spalte of ["id", "short_name", "created_at"]) {
      const wert = spalte === "created_at" ? "now()" : `'${newId("app")}'`;
      expect(await codeOf(app.unsafe(`update apps set ${spalte} = ${wert}`)), spalte).toBe(RECHTE);
    }
    expect(await codeOf(app.unsafe("delete from apps"))).toBe(RECHTE);
    expect(await codeOf(app.unsafe("truncate apps"))).toBe(RECHTE);
  });

  it("Ablauf unter der App-Rolle: sehen, einstufen, Zugriff, Token-Wechsel, Trennen", async () => {
    const konto = await apps.create(db, {
      shortName: "ablauf",
      name: "Ablauf",
      url: "https://ablauf.beispiel.test/mcp",
      authKind: "token",
      tokenEnc: tokenV2(),
    });
    const [erstes] = await apps.sehen(db, konto.id, [
      {
        originalName: "suchen",
        toolDigest: abdruck("1"),
        description: "Sucht",
        inputSchema: { type: "object" },
      },
    ]);
    const tool = erstes?.tool;
    if (tool === undefined) throw new Error("Werkzeug fehlt");
    const ziel = zielAbdruck(konto.id, konto.url);
    // Ohne passende Entscheidung geht die Einstufung nicht.
    await expect(
      apps.einstufen(db, {
        toolId: tool.toolId,
        toolClass: "lesen",
        actionId: newId("action"),
        seenDigest: tool.toolDigest,
        targetDigest: ziel,
      }),
    ).rejects.toThrow();
    const aktion = await kette.werkzeugBestaetigen({
      appId: konto.id,
      toolId: tool.toolId,
      toolClass: "lesen",
      toolDigest: tool.toolDigest,
      targetDigest: ziel,
      toolStatus: "neu",
      toolVersion: 1,
    });
    const bestaetigt = await apps.einstufen(db, {
      toolId: tool.toolId,
      toolClass: "lesen",
      actionId: aktion,
      seenDigest: tool.toolDigest,
      targetDigest: ziel,
    });
    expect(bestaetigt.status).toBe("bestaetigt");
    await apps.setAccess(db, {
      appId: konto.id,
      botId,
      access: "lesen",
      actionId: await kette.zugriffSetzen({ appId: konto.id, botId, access: "lesen" }),
    });
    expect(await apps.currentAccess(db, konto.id, botId)).toBe("lesen");
    await apps.changeAccess(db, konto.id, { tokenEnc: tokenV2().replace("a", "x") });
    expect((await apps.currentTool(db, tool.toolId))?.status).toBe("neu");
    await apps.disconnect(db, konto.id);
    expect(await apps.currentAccess(db, konto.id, botId)).toBe("keiner");
    expect(await apps.getTokenEnc(db, konto.id)).toBeUndefined();
  });

  it("Bestätigen und Token-Wechsel gleichzeitig: danach ist die neueste Fassung „neu“ (App-Zeile gesperrt)", async () => {
    const konto = await apps.create(db, {
      shortName: "gleichzeitig",
      name: "Gleichzeitig",
      url: "https://gleichzeitig.beispiel.test/mcp",
      authKind: "token",
      tokenEnc: tokenV2(),
    });
    const [erstes] = await apps.sehen(db, konto.id, [
      {
        originalName: "suchen",
        toolDigest: abdruck("1"),
        description: "Sucht",
        inputSchema: { type: "object" },
      },
    ]);
    const tool = erstes?.tool;
    if (tool === undefined) throw new Error("Werkzeug fehlt");
    const ziel = zielAbdruck(konto.id, konto.url);
    const aktion = await kette.werkzeugBestaetigen({
      appId: konto.id,
      toolId: tool.toolId,
      toolClass: "lesen",
      toolDigest: tool.toolDigest,
      targetDigest: ziel,
      toolStatus: "neu",
      toolVersion: 1,
    });
    let wechselFertig = false;
    let wechsel: Promise<unknown> = Promise.resolve();
    // Verbindung A bestätigt und hält die Transaktion offen; Verbindung B wechselt den Token.
    await db.transaction(async (tx) => {
      await apps.einstufen(tx as unknown as Database, {
        toolId: tool.toolId,
        toolClass: "lesen",
        actionId: aktion,
        seenDigest: tool.toolDigest,
        targetDigest: ziel,
      });
      wechsel = apps
        .changeAccess(db, konto.id, { tokenEnc: tokenV2().replace("a", "y") })
        .then(() => {
          wechselFertig = true;
        });
      await new Promise((weiter) => setTimeout(weiter, 600));
      // Mit der Sperre wartet B, bis A fertig ist; ohne sie sieht B die offene Bestätigung nicht.
      expect(wechselFertig).toBe(false);
    });
    await wechsel;
    expect((await apps.currentTool(db, tool.toolId))?.status).toBe("neu");
  });

  it("bot_app_grants: die Nummer vergibt die Datenbank; eine selbst gesetzte scheitert (OVERRIDING SYSTEM VALUE)", async () => {
    const konto = await apps.create(db, {
      shortName: "nummer",
      name: "Nummer",
      url: "https://nummer.beispiel.test/mcp",
      authKind: "token",
      tokenEnc: tokenV2(),
    });
    const aktion = await kette.zugriffSetzen({ appId: konto.id, botId, access: "lesen" });
    const zeile = (seq: string, id: string) =>
      app.unsafe(
        `insert into bot_app_grants (seq, app_id, bot_id, access, connection_no, action_id)
         overriding system value
         values (${seq}, '${konto.id}', '${botId}', 'lesen', ${konto.connectionNo}, '${id}')`,
      );
    expect(await codeOf(zeile("9000000000000000000", aktion))).toBe("23514");
    expect(await codeOf(zeile("1", aktion))).toBe("23514");
    // Der richtige Weg bleibt offen: die Nummer kommt aus der Folge der Datenbank.
    await apps.setAccess(db, { appId: konto.id, botId, access: "lesen", actionId: aktion });
    expect(await apps.currentAccess(db, konto.id, botId)).toBe("lesen");
  });

  it("messages.untrusted: die App-Rolle darf es setzen, aber nicht zurücknehmen", async () => {
    const konv = await conversations.create(db, { botId, title: "Fremd" });
    const frage = await messages.insert(db, {
      conversationId: konv.id,
      role: "user",
      content: "Hallo",
    });
    const lauf = await runs.create(db, {
      conversationId: konv.id,
      triggerMessageId: frage.id,
      botId,
    });
    const antwort = await messages.insert(db, {
      conversationId: konv.id,
      role: "assistant",
      runId: lauf.id,
      step: 0,
    });
    await messages.markUntrusted(db, antwort.id);
    expect(await messages.anyUntrusted(db, [antwort.id])).toBe(true);
    expect(
      await codeOf(app.unsafe(`update messages set untrusted = false where id = '${antwort.id}'`)),
    ).toBe(RESTRICT);
  });

  it("R-014 steht in der Datenbank, die App-Rolle kann Regeln nicht ändern", async () => {
    const zeilen = await app.unsafe("select id, version from rules where id = 'R-014'");
    expect(zeilen).toHaveLength(1);
    expect(await codeOf(app.unsafe("update rules set enabled = false where id = 'R-014'"))).toBe(
      RECHTE,
    );
    expect(await codeOf(app.unsafe("delete from rules where id = 'R-014'"))).toBe(RECHTE);
  });
});

describe.skipIf(BASE_URL === undefined)(
  "Aufstieg vom Stand 0015 mit Bestandsdaten (Postgres)",
  () => {
    let database: PostgresTestDatabase;
    let sql: postgres.Sql;

    afterAll(async () => {
      await sql?.end({ timeout: 2 });
      await database?.drop();
    });

    it("Läufe, Nachrichten, Belege und Werkzeug-Aufrufe bleiben unverändert; die Kette läuft weiter", async () => {
      database = await createPostgresTestDatabase(BASE_URL ?? "", { migrate: false });
      await runMigrations(database.url, migrationsUpTo(16));
      sql = postgres(database.url, { max: 2, onnotice: () => undefined });
      const bot = newId("bot");
      const konv = newId("conversation");
      const frage = newId("message");
      const antwort = newId("message");
      const lauf = newId("run");
      const aktion = newId("action");
      await sql.unsafe(
        `insert into bots (id, name, avatar_shape, color) values ('${bot}', 'Pai', 'blatt', 'blau')`,
      );
      await sql.unsafe(
        `insert into conversations (id, bot_id, title) values ('${konv}', '${bot}', 't')`,
      );
      await sql.unsafe(
        `insert into messages (id, conversation_id, role, content) values ('${frage}', '${konv}', 'user', 'Hallo')`,
      );
      await sql.unsafe(
        `insert into runs (id, conversation_id, trigger_message_id, bot_id) values ('${lauf}', '${konv}', '${frage}', '${bot}')`,
      );
      await sql.unsafe(
        `insert into messages (id, conversation_id, role, content, run_id, step) values ('${antwort}', '${konv}', 'assistant', 'x', '${lauf}', 0)`,
      );
      const verbindung = createDb(database.url);
      const bestand = verbindung.db as unknown as Database;
      const bestandsKette = new BelegKette(bestand);
      await bestandsKette.entscheidung({
        type: "nachricht.senden",
        target: { conversationId: konv, messageId: frage },
        facts: { credential: "sitzung" },
      });
      await sql.unsafe(
        `insert into tool_calls (action_id, conversation_id, run_id, message_id, position, call_id, name, source, kind, input, args_digest, tool_key, tool_digest, reach, foreign_content, step, untrusted_input)
       values ('${aktion}', '${konv}', '${lauf}', '${antwort}', 0, 'c0', 'doku_nachschlagen', 'eingebaut', 'lesen', '{}', 'hmac-sha256:${"a".repeat(64)}', 'eingebaut/doku.nachschlagen', 'sha256:${"b".repeat(64)}', 'intern', false, 0, false)`,
      );
      const lesen = async () =>
        JSON.stringify([
          await sql.unsafe(
            "select to_jsonb(t) - 'app_id' - 'app_tool_id' - 'tool_version' as z from tool_calls t",
          ),
          await sql.unsafe("select to_jsonb(m) - 'untrusted' as z from messages m order by id"),
          await sql.unsafe("select to_jsonb(r) as z from runs r"),
          await sql.unsafe("select seq, id, hash, prev_hash, signature from belege order by seq"),
          await sql.unsafe("select id, version from rules order by seq"),
        ]);
      const vorher = await lesen();
      await runMigrations(database.url, MIGRATIONS_FOLDER);
      const nachher = JSON.parse(await lesen()) as unknown[][];
      const alt = JSON.parse(vorher) as unknown[][];
      // Alles Bisherige steht gleich da; bei den Regeln ist nur R-014 dazugekommen.
      expect(nachher.slice(0, 4)).toEqual(alt.slice(0, 4));
      expect(nachher[4]?.slice(0, -1)).toEqual(alt[4]);
      expect(nachher[4]?.at(-1)).toEqual({ id: "R-014", version: 1 });
      // Die Kette lässt sich weiterschreiben: die nächste Zeile hängt am letzten Hash.
      const letzte = (await sql.unsafe("select hash from belege order by seq desc limit 1"))[0];
      await bestandsKette.entscheidung({
        type: "nachricht.senden",
        target: { conversationId: konv, messageId: frage },
        facts: { credential: "sitzung" },
      });
      const [zeile] = await sql.unsafe("select prev_hash from belege order by seq desc limit 1");
      expect(zeile?.prev_hash).toBeDefined();
      expect(letzte?.hash).toBeDefined();
      expect((await sql.unsafe("select count(*)::int as n from belege"))[0]?.n).toBeGreaterThan(
        alt[3]?.length ?? 0,
      );
      // Neue Spalten haben ihre Standardwerte.
      expect(
        (await sql.unsafe("select count(*)::int as n from messages where untrusted"))[0]?.n,
      ).toBe(0);
      await verbindung.sql.end({ timeout: 2 });
    }, 120_000);
  },
);
