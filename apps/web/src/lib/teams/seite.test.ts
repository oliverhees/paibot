/**
 * PaiBot – Tests des Lesens für die Seiten „Bot“ und „Teams“: der Steckbrief zeigt den Bot aus der
 * Adresse (nicht den Standard-Bot), der Haupt-Assistent ist als solcher gekennzeichnet, Teams
 * kommen mit ihren Mitgliedern, und der Hinweis „ohne Tagesbudget“ hängt an der Tagesgrenze.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

import { type Database, repo } from "@paibot/db";
import { createTestDb } from "@paibot/db/testing";
import type { BotId } from "@paibot/shared/ids";
import { describe, expect, it, vi } from "vitest";
import { botSeite, teamSeite, teamsSeite } from "./seite";

vi.setConfig({ testTimeout: 120_000 });

/** Standard-Bot „Pai“, ein zweiter Bot „Mila“ in einem Team „Content“ mit Mila als Leitung. */
async function stand() {
  const { db } = await createTestDb();
  const pai = await repo.bots.create(db, {
    name: "Pai",
    instructions: "Antworte kurz.",
    avatarShape: "kiesel",
    color: "limette",
  });
  await repo.settings.update(db, { defaultBotId: pai.id });
  const mila = await repo.bots.create(db, {
    name: "Mila",
    instructions: "Schreib Entwürfe.",
    role: "Schreibt Entwürfe",
    avatarShape: "blatt",
    color: "blau",
  });
  const team = await repo.teams.create(db, { name: "Content" });
  await repo.bots.setTeam(db, mila.id, team.id);
  await repo.teams.update(db, team.id, { leadBotId: mila.id });
  return { db, paiId: pai.id, milaId: mila.id, teamId: team.id };
}

const hole = async (db: Database, id: BotId) => {
  const daten = await botSeite(db, id);
  if (daten === undefined) throw new Error("keine Daten");
  return daten;
};

describe("Seite eines Bots", () => {
  // Gegenprobe zur bewussten Entscheidung „kein getDefault“: Liest `botSeite` statt der Kennung aus
  // der Adresse den Standard-Bot (`repo.bots.getDefault`), wird dieser Test rot.
  it("zeigt den Bot aus der Adresse, nicht den Standard-Bot", async () => {
    const { db, milaId } = await stand();
    const daten = await hole(db, milaId);
    expect(daten.bot.id).toBe(milaId);
    expect(daten.bot.name).toBe("Mila");
    expect(daten.haupt).toBe(false);
  });

  it("kennzeichnet den Haupt-Assistenten; er steht in keinem Team", async () => {
    const { db, paiId } = await stand();
    const daten = await hole(db, paiId);
    expect(daten.haupt).toBe(true);
    expect(daten.team).toBeUndefined();
    expect(daten.bot.teamId).toBeUndefined();
  });

  it("nennt Team und Leitung des Bots und alle Teams zur Wahl", async () => {
    const { db, milaId, teamId } = await stand();
    const daten = await hole(db, milaId);
    expect(daten.bot.teamId).toBe(teamId);
    expect(daten.team?.name).toBe("Content");
    expect(daten.team?.leitungId).toBe(milaId);
    expect(daten.teams).toEqual([{ id: teamId, name: "Content" }]);
  });

  it("einen Bot, den es nicht gibt, gibt es auch auf der Seite nicht", async () => {
    const { db, milaId } = await stand();
    await repo.bots.remove(db, milaId);
    expect(await botSeite(db, milaId)).toBeUndefined();
  });

  it("ein pausierter Bot ist im Steckbrief pausiert", async () => {
    const { db, milaId } = await stand();
    await repo.bots.setPaused(db, milaId, true);
    expect((await hole(db, milaId)).bot.pausiert).toBe(true);
  });
});

describe("Seiten „Bots und Teams“", () => {
  it("listet jedes Team mit seinen Mitgliedern; der Haupt-Assistent bleibt außen vor", async () => {
    const { db, milaId, teamId } = await stand();
    const daten = await teamsSeite(db);
    expect(daten.teams.map((e) => e.team.id)).toEqual([teamId]);
    expect(daten.teams[0]?.mitglieder.map((b) => b.id)).toEqual([milaId]);
    // Der Standard-Bot ist der Haupt-Assistent und steht weder im Team noch unter „ohne Team“.
    expect(daten.ohneTeam).toEqual([]);
  });

  it("ein Bot ohne Team steht unter „ohne Team“", async () => {
    const { db, milaId } = await stand();
    await repo.bots.setTeam(db, milaId, null);
    const daten = await teamsSeite(db);
    expect(daten.teams[0]?.mitglieder).toEqual([]);
    expect(daten.ohneTeam.map((b) => b.id)).toEqual([milaId]);
  });

  // Gegenprobe zur Pflicht: Setzt `teamsSeite` `ohneTagesbudget` fest auf `false`, wird dieser
  // Test rot – und mit ihm der Hinweis am Schalter „Zusammenarbeit“.
  it("ohne Tagesgrenze gilt „ohne Tagesbudget“, mit Grenze nicht", async () => {
    const { db, teamId } = await stand();
    expect((await teamsSeite(db)).ohneTagesbudget).toBe(true);
    expect((await teamSeite(db, teamId))?.ohneTagesbudget).toBe(true);
    await repo.settings.update(db, { dailyTokenBudget: 100_000 });
    expect((await teamsSeite(db)).ohneTagesbudget).toBe(false);
    expect((await teamSeite(db, teamId))?.ohneTagesbudget).toBe(false);
  });

  it("ein Team, das es nicht gibt, gibt es auch auf der Seite nicht", async () => {
    const { db, teamId } = await stand();
    await repo.teams.remove(db, teamId);
    expect(await teamSeite(db, teamId)).toBeUndefined();
  });
});
