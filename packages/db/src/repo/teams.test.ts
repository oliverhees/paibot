/**
 * PaiBot – Tests der Zugriffsfunktionen für Teams: anlegen, lesen, ändern, löschen, Mitglieder,
 * und die erlaubte Reihenfolge der Stände eines Entwurfs.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

import { type ConversationId, type EntwurfId, newId, type TeamId } from "@paibot/shared";
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../client";
import { teamEntwuerfe, conversations as unterhaltungenTabelle } from "../schema";
import { createTestDb } from "../testing";
import { bots, conversations, teams } from "./index";
import { type EntwurfStand, wechselErlaubt } from "./teams";

const ABDRUCK = `sha256:${"a".repeat(64)}`;

async function entwurfAnlegen(db: Database, status: EntwurfStand): Promise<EntwurfId> {
  const id = newId("entwurf");
  await db.insert(teamEntwuerfe).values({
    id,
    status,
    origin: "vorlage",
    source: "content-team@1",
    title: "Content-Team",
    content: { bots: [] },
    digest: ABDRUCK,
    formatVersion: 1,
  });
  return id;
}

/**
 * Legt einen Faden des Teams direkt in der Tabelle an: Fäden anlegen gehört noch nicht zum
 * Besitzer-Weg, der Test braucht nur die Zeile, damit `conversations.team_id` das Löschen hält.
 */
async function fadenAnlegen(db: Database, teamId: TeamId): Promise<ConversationId> {
  const id = newId("conversation");
  await db.insert(unterhaltungenTabelle).values({ id, kind: "faden", teamId, title: "Faden" });
  return id;
}

describe("Teams: Zugriffsfunktionen", () => {
  let db: Database;
  beforeEach(async () => {
    ({ db } = await createTestDb());
  });

  const neuerBot = (name: string) => bots.create(db, { name, avatarShape: "blatt", color: "blau" });

  it("legt ein Team mit den Vorgaben an und liest es wieder", async () => {
    const team = await teams.create(db, { name: "Content" });
    expect(team).toMatchObject({
      name: "Content",
      collaboration: "aus",
      acceptanceDefault: "leitung",
    });
    expect(team.leadBotId).toBeUndefined();
    expect(await teams.get(db, team.id)).toMatchObject({ id: team.id, name: "Content" });
    expect((await teams.list(db)).map((tm) => tm.id)).toEqual([team.id]);
  });

  it("lehnt einen doppelten Namen als ungültige Eingabe am Feld „name“ ab", async () => {
    await teams.create(db, { name: "Content" });
    await expect(teams.create(db, { name: "Content" })).rejects.toMatchObject({
      code: "eingabe_ungueltig",
      felder: [{ feld: "name", code: "ungueltig" }],
    });
  });

  it("ändert Name, Leitung, Zusammenarbeit und Abnahme-Standard; null nimmt die Leitung weg", async () => {
    const bot = await neuerBot("Mila");
    const team = await teams.create(db, { name: "Content" });
    const geaendert = await teams.update(db, team.id, {
      name: "Redaktion",
      leadBotId: bot.id,
      collaboration: "leitung_fuehrt",
      acceptanceDefault: "besitzer",
    });
    expect(geaendert).toMatchObject({
      name: "Redaktion",
      leadBotId: bot.id,
      collaboration: "leitung_fuehrt",
      acceptanceDefault: "besitzer",
    });
    const ohne = await teams.update(db, team.id, { leadBotId: null });
    expect(ohne?.leadBotId).toBeUndefined();
    expect(await teams.update(db, newId("team"), { name: "Nichts" })).toBeUndefined();
  });

  it("nennt die Mitglieder eines Teams und sagt, ob ein Bot dazugehört", async () => {
    const team = await teams.create(db, { name: "Content" });
    const anderes = await teams.create(db, { name: "Recherche" });
    const mila = await neuerBot("Mila");
    const noa = await neuerBot("Noa");
    const fremd = await neuerBot("Fremd");
    await bots.setTeam(db, mila.id, team.id);
    await bots.setTeam(db, noa.id, team.id);
    await bots.setTeam(db, fremd.id, anderes.id);
    expect(await teams.mitglieder(db, team.id)).toEqual([mila.id, noa.id]);
    expect(await teams.istMitglied(db, team.id, mila.id)).toBe(true);
    expect(await teams.istMitglied(db, team.id, fremd.id)).toBe(false);
    // Ohne Team gehört der Bot zu keinem Team, auch nicht zu dem, das gefragt ist.
    await bots.setTeam(db, fremd.id, null);
    expect(await teams.istMitglied(db, anderes.id, fremd.id)).toBe(false);
  });

  it("löscht ein Team ohne Fäden; die Bots bleiben ohne Team, ein unbekanntes Team ergibt false", async () => {
    const team = await teams.create(db, { name: "Content" });
    const mila = await neuerBot("Mila");
    await bots.setTeam(db, mila.id, team.id);
    await teams.update(db, team.id, { leadBotId: mila.id });
    expect(await teams.remove(db, team.id)).toBe(true);
    expect((await bots.get(db, mila.id))?.teamId).toBeUndefined();
    expect(await teams.remove(db, team.id)).toBe(false);
  });

  // Gegenprobe: `conversations.team_id` mit `on delete cascade` → das Team und sein Faden sind weg (rot).
  it("ein Team mit Fäden lässt sich nicht löschen: fester Satz, Team und Faden bleiben", async () => {
    const team = await teams.create(db, { name: "Content" });
    const faden = await fadenAnlegen(db, team.id);
    await expect(teams.remove(db, team.id)).rejects.toMatchObject({
      code: "abgelehnt",
      text: "Dieses Team hat Fäden und lässt sich nicht löschen.",
      ausweg: "Lösche zuerst die Fäden des Teams.",
    });
    expect(await teams.get(db, team.id)).toBeDefined();
    expect(await conversations.get(db, faden)).toBeDefined();
  });

  it("setzt den Bot in ein Team und wieder heraus; ein unbekanntes Team ist nicht gefunden", async () => {
    const team = await teams.create(db, { name: "Content" });
    const bot = await neuerBot("Mila");
    expect((await bots.setTeam(db, bot.id, team.id))?.teamId).toBe(team.id);
    expect((await bots.setTeam(db, bot.id, null))?.teamId).toBeUndefined();
    await expect(bots.setTeam(db, bot.id, newId("team"))).rejects.toMatchObject({
      code: "nicht_gefunden",
    });
    expect(await bots.setTeam(db, newId("bot"), team.id)).toBeUndefined();
  });

  it("zählt die Bots", async () => {
    expect(await bots.count(db)).toBe(0);
    await neuerBot("Eins");
    await neuerBot("Zwei");
    expect(await bots.count(db)).toBe(2);
  });
});

describe("Teams: Stände eines Entwurfs gehen nur vorwärts", () => {
  let db: Database;
  beforeEach(async () => {
    ({ db } = await createTestDb());
  });

  it("erlaubt genau die Wechsel der Tabelle und sonst keinen", () => {
    expect(wechselErlaubt("offen", "angelegt")).toBe(true);
    expect(wechselErlaubt("offen", "verworfen")).toBe(true);
    expect(wechselErlaubt("offen", "verfallen")).toBe(true);
    expect(wechselErlaubt("angelegt", "zurueckgenommen")).toBe(true);
    // Rückwärts geht nichts, und ein Endstand bleibt ein Endstand.
    expect(wechselErlaubt("angelegt", "offen")).toBe(false);
    expect(wechselErlaubt("verworfen", "offen")).toBe(false);
    expect(wechselErlaubt("zurueckgenommen", "angelegt")).toBe(false);
    expect(wechselErlaubt("offen", "offen")).toBe(false);
  });

  it("schreibt den erlaubten Stand samt Entscheidung in die passende Spalte", async () => {
    const id = await entwurfAnlegen(db, "offen");
    const action = newId("action");
    expect(await teams.entwurfStandSetzen(db, id, "angelegt", action)).toBe("angelegt");
    const [row] = await db.select().from(teamEntwuerfe);
    expect(row?.createdActionId).toBe(action);
    expect(row?.revertedActionId).toBeNull();
    const zurueck = newId("action");
    expect(await teams.entwurfStandSetzen(db, id, "zurueckgenommen", zurueck)).toBe(
      "zurueckgenommen",
    );
    const [danach] = await db.select().from(teamEntwuerfe);
    expect(danach?.revertedActionId).toBe(zurueck);
    expect(danach?.createdActionId).toBe(action);
  });

  // Gegenprobe: die Prüfung mit `wechselErlaubt` entfernen → der verbotene Wechsel geht durch (rot).
  it("lehnt einen verbotenen Wechsel ab und ändert nichts", async () => {
    const id = await entwurfAnlegen(db, "angelegt");
    await expect(teams.entwurfStandSetzen(db, id, "offen")).rejects.toMatchObject({
      code: "abgelehnt",
      text: "Dieser Entwurf ist nicht mehr offen.",
    });
    const [row] = await db.select().from(teamEntwuerfe);
    expect(row?.status).toBe("angelegt");
  });

  it("gibt bei einem unbekannten Entwurf undefined zurück", async () => {
    expect(await teams.entwurfStandSetzen(db, newId("entwurf"), "angelegt")).toBeUndefined();
  });
});
