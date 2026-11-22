/**
 * PaiBot – Test: Art und Team einer Unterhaltung stehen nach dem Anlegen fest, und der Kopf eines
 * Fadens gehört nur zu einer Unterhaltung der Art Faden (Trigger aus Migration 0017).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-23
 */

import { newId } from "@paibot/shared";
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "./client";
import { bots, conversations } from "./repo";
import { createTestDb } from "./testing";

/** Text der Meldung der Datenbank (Drizzle packt sie in `cause`). */
async function meldung(p: PromiseLike<unknown>): Promise<string> {
  try {
    await p;
    return "";
  } catch (e) {
    const x = e as { message?: string; cause?: { message?: string } };
    return `${x.message ?? ""} | ${x.cause?.message ?? ""}`;
  }
}

describe("Unterhaltung: Art und Team stehen fest", () => {
  let db: Database;
  beforeEach(async () => {
    ({ db } = await createTestDb());
  });

  async function team(name: string): Promise<string> {
    const id = newId("team");
    await db.execute(sql`insert into teams (id, name) values (${id}, ${name})`);
    return id;
  }
  async function faden(teamId: string): Promise<string> {
    const id = newId("conversation");
    await db.execute(
      sql`insert into conversations (id, bot_id, title, kind, team_id)
        values (${id}, null, 'Faden', 'faden', ${teamId})`,
    );
    await db.execute(
      sql`insert into faeden (conversation_id, ziel, abnahme, herkunft, action_id)
        values (${id}, 'Ziel', 'leitung', 'besitzer', ${newId("action")})`,
    );
    return id;
  }

  // Gegenprobe: den Trigger `conversations_festhalten` aus 0017 entfernen → alle vier rot.
  it("ein Faden wird nicht zum Direkt-Chat, ein Direkt-Chat nicht zum Faden", async () => {
    const t = await team("A");
    const f = await faden(t);
    const bot = await bots.create(db, { name: "B", avatarShape: "blatt", color: "blau" });
    expect(
      await meldung(
        db.execute(
          sql`update conversations set kind = 'direkt', bot_id = ${bot.id}, team_id = null where id = ${f}`,
        ),
      ),
    ).toMatch(/lassen sich nicht ändern/);
    const direkt = await conversations.create(db, { botId: bot.id, title: "D" });
    expect(
      await meldung(
        db.execute(
          sql`update conversations set kind = 'faden', bot_id = null, team_id = ${t} where id = ${direkt.id}`,
        ),
      ),
    ).toMatch(/lassen sich nicht ändern/);
  });

  it("das Team einer Unterhaltung wechselt nicht", async () => {
    const f = await faden(await team("A"));
    const anderes = await team("B");
    expect(
      await meldung(db.execute(sql`update conversations set team_id = ${anderes} where id = ${f}`)),
    ).toMatch(/lassen sich nicht ändern/);
  });

  it("andere Änderungen gehen weiter (Titel, Zeit)", async () => {
    const f = await faden(await team("A"));
    await db.execute(sql`update conversations set title = 'Neu' where id = ${f}`);
    const bot = await bots.create(db, { name: "B", avatarShape: "blatt", color: "blau" });
    const direkt = await conversations.create(db, { botId: bot.id, title: "D" });
    await db.execute(sql`update conversations set title = 'Neu' where id = ${direkt.id}`);
  });

  // Gegenprobe: den Trigger `faeden_nur_fuer_faden` entfernen → rot.
  it("eine Zeile in faeden gibt es nur für eine Unterhaltung der Art Faden", async () => {
    const bot = await bots.create(db, { name: "B", avatarShape: "blatt", color: "blau" });
    const direkt = await conversations.create(db, { botId: bot.id, title: "D" });
    expect(
      await meldung(
        db.execute(
          sql`insert into faeden (conversation_id, ziel, abnahme, herkunft, action_id)
          values (${direkt.id}, 'Ziel', 'leitung', 'besitzer', ${newId("action")})`,
        ),
      ),
    ).toMatch(/nur zu einer Unterhaltung der Art Faden/);
  });
});
