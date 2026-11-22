/**
 * PaiBot – Tests: Was beim Löschen eines Bots passiert (Läufe, Standard-Bot, Team, Leitung).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { newId } from "@paibot/shared";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../client";
import { bots as botTabelle, teams, conversations as unterhaltungen } from "../schema";
import { createTestDb } from "../testing";
import { bots, conversations, messages, runs } from "./index";

describe("Bot löschen", () => {
  let db: Database;
  beforeEach(async () => {
    ({ db } = await createTestDb());
  });

  const neuerBot = (name: string) => bots.create(db, { name, avatarShape: "blatt", color: "blau" });

  // Gegenprobe: `runs.bot_id` wieder mit `on delete cascade` → der Bot und sein Lauf sind weg (rot).
  it("ein Bot mit Läufen lässt sich nicht löschen: fester Satz, Bot, Gespräch und Lauf bleiben", async () => {
    const bot = await neuerBot("Alt");
    const gespraech = await conversations.create(db, { botId: bot.id, title: "G" });
    const nachricht = await messages.insert(db, {
      conversationId: gespraech.id,
      role: "user",
      content: "Hi",
    });
    const lauf = await runs.create(db, {
      conversationId: gespraech.id,
      triggerMessageId: nachricht.id,
      botId: bot.id,
    });
    await expect(bots.remove(db, bot.id)).rejects.toMatchObject({
      code: "abgelehnt",
      text: "Dieser Bot hat schon gearbeitet und lässt sich nicht löschen.",
      ausweg: "Pausiere den Bot, dann antwortet er nicht mehr.",
    });
    expect(await bots.get(db, bot.id)).toBeDefined();
    expect(await conversations.get(db, gespraech.id)).toBeDefined();
    expect(await runs.get(db, lauf.id)).toBeDefined();
  });

  it("ein Bot ohne Läufe geht mit seinen Direkt-Chats; ein unbekannter Bot ergibt false", async () => {
    const bot = await neuerBot("Neu");
    const gespraech = await conversations.create(db, { botId: bot.id, title: "G" });
    expect(await bots.remove(db, bot.id)).toBe(true);
    expect(await conversations.get(db, gespraech.id)).toBeUndefined();
    expect(await bots.remove(db, bot.id)).toBe(false);
  });

  // Gegenprobe: `bots.team_id` ohne `on delete set null` (no action) → die Löschung scheitert (rot).
  it("ein Bot im Team verlässt es nicht erst beim Löschen des Teams: Team weg, Bot bleibt einzeln", async () => {
    const bot = await neuerBot("Mitglied");
    const team = newId("team");
    await db.insert(teams).values({ id: team, name: "Studio", leadBotId: bot.id });
    await db.update(botTabelle).set({ teamId: team }).where(eq(botTabelle.id, bot.id));
    await db.delete(teams).where(eq(teams.id, team));
    const [zeile] = await db.select().from(botTabelle).where(eq(botTabelle.id, bot.id));
    expect(zeile?.teamId).toBeNull();
  });

  // Gegenprobe: `teams.lead_bot_id` ohne `on delete set null` → der Bot lässt sich nicht löschen (rot).
  it("war der Bot die Leitung, hat das Team danach keine Leitung und besteht weiter", async () => {
    const bot = await neuerBot("Leitung");
    const team = newId("team");
    await db.insert(teams).values({ id: team, name: "Studio", leadBotId: bot.id });
    expect(await bots.remove(db, bot.id)).toBe(true);
    const [zeile] = await db.select().from(teams).where(eq(teams.id, team));
    expect(zeile).toMatchObject({ id: team, leadBotId: null });
  });

  // Gegenprobe: `conversations.team_id` mit `on delete cascade` → Team weg, Faden weg (rot).
  it("ein Team mit Faden lässt sich nicht löschen, ohne Faden schon", async () => {
    const team = newId("team");
    await db.insert(teams).values({ id: team, name: "Studio" });
    const faden = newId("conversation");
    await db.insert(unterhaltungen).values({ id: faden, kind: "faden", teamId: team, title: "F" });
    await expect(db.delete(teams).where(eq(teams.id, team))).rejects.toThrow();
    expect(
      (await db.select().from(unterhaltungen).where(eq(unterhaltungen.id, faden))).length,
    ).toBe(1);
    await db.delete(unterhaltungen).where(eq(unterhaltungen.id, faden));
    await db.delete(teams).where(eq(teams.id, team));
    expect((await db.select().from(teams).where(eq(teams.id, team))).length).toBe(0);
  });
});
