/**
 * PaiBot – Tests der Verwaltungs-Routen für Bots und Teams: ohne Sitzung 401, ohne Prüfzeichen
 * 403, jede Änderung mit Beleg und mit prüfbarer Kette, die Grenze „Bots insgesamt“, die
 * Vorbedingungen „Standard-Bot bleibt“, „Team vorhanden“ und „Leitung im Team“, und dass die
 * Belege eines gelöschten Bots bleiben.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

import { repo } from "@paibot/db";
import { verifyChain } from "@paibot/receipts";
import type { BotId, TeamId } from "@paibot/shared/ids";
import { LIMITS } from "@paibot/shared/konstanten";
import { describe, expect, it, vi } from "vitest";
import type { RoutenAktion } from "../api/route";
import { API_ROUTEN, type RoutenName, type RoutenParameter, routenPfad } from "../routen";
import { einrichtungAbschliessen } from "../zugang/einrichtung";
import {
  type AnfrageOptionen,
  anfrage,
  type Keksdose,
  TEST_CODE,
  TEST_PASSWORT,
  type TestUmgebung,
  testUmgebung,
  vorabDose,
} from "../zugang/testing";
import {
  botAnlegen,
  botLoeschen,
  botPausieren,
  botsListe,
  botTeamSetzen,
  teamAendern,
  teamAnlegen,
  teamLoeschen,
  teamsListe,
} from "./verwaltung";

vi.setConfig({ testTimeout: 120_000 });

const ZWEITER_BOT = {
  name: "Mila",
  role: "Schreibt Entwürfe",
  instructions: "Antworte kurz.",
  avatarShape: "blatt",
  color: "blau",
} as const;

interface Stand {
  u: TestUmgebung;
  dose: Keksdose;
}

async function eingerichtet(): Promise<Stand> {
  const u = await testUmgebung();
  u.neuerCode(TEST_CODE);
  const abschluss = u.handler("einrichtungAbschliessen", async (k) => ({
    daten: await einrichtungAbschliessen(k),
  }));
  const dose = vorabDose();
  const r = await anfrage(u, abschluss, "POST", "/api/einrichtung", {
    dose,
    koerper: {
      setupCode: TEST_CODE,
      password: TEST_PASSWORT,
      passwordRepeat: TEST_PASSWORT,
      schleuseModeDefault: "off",
      botName: "Pai",
    },
  });
  if (r.status !== 200) throw new Error(`Einrichtung: ${r.status}`);
  return { u, dose };
}

/** Schickt eine Anfrage an eine der Verwaltungs-Routen, mit Methode und Pfad aus dem Vertrag. */
function rufe<N extends RoutenName>(
  s: Stand,
  name: N,
  aktion: RoutenAktion<N>,
  optionen: AnfrageOptionen & { params?: RoutenParameter<N> } = {},
) {
  const params = (optionen.params ?? {}) as RoutenParameter<N>;
  const dose = "dose" in optionen ? optionen.dose : s.dose;
  return anfrage(
    s.u,
    s.u.handler(name, aktion),
    API_ROUTEN[name].methode,
    routenPfad(name, params),
    {
      ...optionen,
      ...(dose === undefined ? {} : { dose }),
      params: params as Record<string, string>,
    },
  );
}

const anlegen = (s: Stand, koerper: unknown, extra: AnfrageOptionen = {}) =>
  rufe(s, "botAnlegen", botAnlegen, { koerper, ...extra });
const pausieren = (s: Stand, id: BotId, paused: boolean) =>
  rufe(s, "botPausieren", botPausieren, { koerper: { paused }, params: { id } });
const loeschen = (s: Stand, id: BotId) => rufe(s, "botLoeschen", botLoeschen, { params: { id } });
const teamSetzen = (s: Stand, id: BotId, koerper: unknown) =>
  rufe(s, "botTeamSetzen", botTeamSetzen, { koerper, params: { id } });
const teamNeu = (s: Stand, koerper: unknown, extra: AnfrageOptionen = {}) =>
  rufe(s, "teamAnlegen", teamAnlegen, { koerper, ...extra });
const teamPatch = (s: Stand, id: string, koerper: unknown) =>
  rufe(s, "teamAendern", teamAendern, { koerper, params: { id } });
const teamWeg = (s: Stand, id: string) => rufe(s, "teamLoeschen", teamLoeschen, { params: { id } });

/** Der Bot, der nicht der Standard-Bot ist. */
async function zweiterBot(s: Stand): Promise<BotId> {
  const einstellungen = await repo.settings.get(s.u.db);
  const bot = (await repo.bots.list(s.u.db)).find((b) => b.id !== einstellungen?.defaultBotId);
  if (bot === undefined) throw new Error("kein zweiter Bot");
  return bot.id;
}

async function standardBot(s: Stand): Promise<BotId> {
  const bot = await repo.bots.getDefault(s.u.db);
  if (bot === undefined) throw new Error("kein Standard-Bot");
  return bot.id;
}

/** Eingerichtet, dazu ein Team und ein zweiter Bot, der zu ihm gehört. */
async function mitTeam(s: Stand): Promise<{ teamId: TeamId; botId: BotId }> {
  await anlegen(s, ZWEITER_BOT);
  const r = await teamNeu(s, { name: "Content" });
  const teamId = (r.body.daten as { team: { id: TeamId } }).team.id;
  const botId = await zweiterBot(s);
  await teamSetzen(s, botId, { teamId });
  return { teamId, botId };
}

async function belegArten(s: Stand, abSeq: number): Promise<string[]> {
  const liste = await repo.belege.listFrom(s.u.db, { fromSeq: abSeq });
  return liste.map((e) =>
    e.body.type === "decision" || e.body.type === "result" ? e.body.action.type : e.body.type,
  );
}

async function naechsteSeq(s: Stand): Promise<number> {
  return ((await repo.belege.head(s.u.db))?.seq ?? 0) + 1;
}

describe("Bots verwalten", () => {
  it("ohne Sitzung 401, ohne Prüfzeichen 403, nichts angelegt", async () => {
    const s = await eingerichtet();
    expect((await anlegen(s, ZWEITER_BOT, { dose: undefined })).status).toBe(401);
    expect((await anlegen(s, ZWEITER_BOT, { pruefzeichen: null })).status).toBe(403);
    expect((await anlegen(s, ZWEITER_BOT, { origin: "https://boese.example" })).status).toBe(403);
    expect(await repo.bots.count(s.u.db)).toBe(1);
  });

  it("legt einen zweiten Bot an: eigene Zeile, Aufgabe, Modell wie der Standard-Bot", async () => {
    const s = await eingerichtet();
    const ab = await naechsteSeq(s);
    const r = await anlegen(s, ZWEITER_BOT);
    expect(r.status).toBe(201);
    const neu = await repo.bots.get(s.u.db, await zweiterBot(s));
    expect(neu?.name).toBe("Mila");
    expect(neu?.role).toBe("Schreibt Entwürfe");
    expect(neu?.paused).toBe(false);
    expect(neu?.teamId).toBe(undefined);
    expect(await belegArten(s, ab)).toEqual(["bot.anlegen", "bot.anlegen"]);
    expect((await verifyChain(await repo.belege.listFrom(s.u.db))).ok).toBe(true);
  });

  it("die Liste nennt alle Bots und den Standard-Bot", async () => {
    const s = await eingerichtet();
    await anlegen(s, ZWEITER_BOT);
    const r = await rufe(s, "botsListe", botsListe);
    const daten = r.body.daten as { bots: { name: string }[]; standardBotId: string };
    expect(daten.bots.map((b) => b.name)).toEqual(["Pai", "Mila"]);
    expect(daten.standardBotId).toBe(await standardBot(s));
  });

  // Gegenprobe zur Grenze „Bots insgesamt“: `maxBots: LIMITS.bots` in `botAnlegen` durch eine
  // größere Zahl ersetzen → dieser Test wird rot.
  it("die Grenze „Bots insgesamt“ lehnt den Bot über der Grenze ab", async () => {
    const s = await eingerichtet();
    for (let i = await repo.bots.count(s.u.db); i < LIMITS.bots; i++) {
      await repo.bots.create(s.u.db, { name: `Bot ${i}`, avatarShape: "blatt", color: "blau" });
    }
    const r = await anlegen(s, ZWEITER_BOT);
    expect(r.status).toBe(429);
    expect(r.body.fehler?.code).toBe("limit_erreicht");
    expect(await repo.bots.count(s.u.db)).toBe(LIMITS.bots);
  });

  // Gegenprobe zur Grenze bei gleichzeitigen Anfragen: in `botAnlegen` die Reihe (`nacheinander`)
  // weglassen **und** in `repo.bots.anlegenUnterGrenze` die Sperre samt Zählung entfernen → beide
  // Anfragen gelingen, es gibt 51 Bots, dieser Test wird rot.
  it("zwei gleichzeitige Anfragen an der Grenze legen genau einen Bot an", async () => {
    const s = await eingerichtet();
    for (let i = await repo.bots.count(s.u.db); i < LIMITS.bots - 1; i++) {
      await repo.bots.create(s.u.db, { name: `Bot ${i}`, avatarShape: "blatt", color: "blau" });
    }
    expect(await repo.bots.count(s.u.db)).toBe(LIMITS.bots - 1);
    const [a, b] = await Promise.all([
      anlegen(s, { ...ZWEITER_BOT, name: "Mila" }),
      anlegen(s, { ...ZWEITER_BOT, name: "Nora" }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 429]);
    const abgelehnt = a.status === 429 ? a : b;
    expect(abgelehnt.body.fehler?.code).toBe("limit_erreicht");
    expect(await repo.bots.count(s.u.db)).toBe(LIMITS.bots);
  });

  // Gegenprobe zur Pflicht „Namen mit ‚Team ‘ sind reserviert“: in `packages/shared/src/inputs.ts`
  // die Prüfung `istTeamName` aus `botNameSchema` entfernen → dieser Test wird rot.
  it("einen Bot namens „Team …“ legt niemand an", async () => {
    const s = await eingerichtet();
    const r = await anlegen(s, { ...ZWEITER_BOT, name: "Team Content" });
    expect(r.status).toBe(400);
    expect(r.body.fehler?.code).toBe("eingabe_ungueltig");
    expect((r.body.fehler as { felder?: unknown } | undefined)?.felder).toEqual([
      { feld: "name", code: "ungueltig" },
    ]);
    expect(await repo.bots.count(s.u.db)).toBe(1);
  });

  // Gegenprobe zur Pflicht „Namen bleiben auseinanderzuhalten“: den Aufruf `nameFrei` in
  // `botAnlegen` entfernen → dieser Test wird rot.
  it("einen Namen, der einem bestehenden Bot zu ähnlich ist, lehnt die Route ab", async () => {
    const s = await eingerichtet();
    for (const name of ["pai", "PAI", "Ｐａｉ", "P\u0430i"]) {
      const r = await anlegen(s, { ...ZWEITER_BOT, name });
      expect({ name, status: r.status, code: r.body.fehler?.code }).toEqual({
        name,
        status: 400,
        code: "eingabe_ungueltig",
      });
    }
    expect(await repo.bots.count(s.u.db)).toBe(1);
    // Ein eigener Name geht weiter.
    expect((await anlegen(s, ZWEITER_BOT)).status).toBe(201);
  });

  it("pausiert einen Bot und hebt die Pause auf", async () => {
    const s = await eingerichtet();
    await anlegen(s, ZWEITER_BOT);
    const botId = await zweiterBot(s);
    expect((await pausieren(s, botId, true)).status).toBe(200);
    expect((await repo.bots.get(s.u.db, botId))?.paused).toBe(true);
    expect((await pausieren(s, botId, false)).status).toBe(200);
    expect((await repo.bots.get(s.u.db, botId))?.paused).toBe(false);
  });

  // Gegenprobe zur Vorbedingung „Standard-Bot bleibt“: den Fakt `isDefaultBot` in `botLoeschen`
  // fest auf `false` setzen → dieser Test wird rot.
  it("den Standard-Bot löscht niemand", async () => {
    const s = await eingerichtet();
    const r = await loeschen(s, await standardBot(s));
    expect(r.status).toBe(409);
    expect(r.body.fehler?.code).toBe("standard_bot_bleibt");
    expect(await repo.bots.count(s.u.db)).toBe(1);
  });

  it("löscht einen Bot; seine Belege bleiben und die Kette prüft", async () => {
    const s = await eingerichtet();
    await anlegen(s, ZWEITER_BOT);
    const botId = await zweiterBot(s);
    await pausieren(s, botId, true);
    const vorher = await repo.belege.listFrom(s.u.db);
    const r = await loeschen(s, botId);
    expect(r.status).toBe(200);
    expect(await repo.bots.get(s.u.db, botId)).toBe(undefined);
    const nachher = await repo.belege.listFrom(s.u.db);
    // Jeder Beleg von vorher steht noch da, mit derselben Nummer.
    expect(nachher.slice(0, vorher.length).map((e) => e.id)).toEqual(vorher.map((e) => e.id));
    expect(JSON.stringify(nachher)).toContain(botId);
    expect((await verifyChain(nachher)).ok).toBe(true);
  });

  it("einen Bot einem Team zuordnen und wieder herausnehmen", async () => {
    const s = await eingerichtet();
    const { teamId, botId } = await mitTeam(s);
    expect((await repo.bots.get(s.u.db, botId))?.teamId).toBe(teamId);
    expect((await teamSetzen(s, botId, {})).status).toBe(200);
    expect((await repo.bots.get(s.u.db, botId))?.teamId).toBe(undefined);
  });

  // Gegenprobe zur Festlegung „die Leitung ist immer Mitglied ihres Teams“: in
  // `repo.bots.setTeam` das Leeren von `teams.lead_bot_id` entfernen → dieser Test wird rot.
  it("nimmt man die Leitung aus dem Team, hat das Team danach keine Leitung", async () => {
    const s = await eingerichtet();
    const { teamId, botId } = await mitTeam(s);
    expect((await teamPatch(s, teamId, { lead: botId })).status).toBe(200);
    expect((await teamSetzen(s, botId, {})).status).toBe(200);
    expect((await repo.teams.get(s.u.db, teamId))?.leadBotId).toBe(undefined);
    expect((await repo.bots.get(s.u.db, botId))?.teamId).toBe(undefined);
  });

  it("versetzt man die Leitung in ein anderes Team, verliert das alte Team seine Leitung", async () => {
    const s = await eingerichtet();
    const { teamId, botId } = await mitTeam(s);
    await teamPatch(s, teamId, { lead: botId });
    const zweites = (await teamNeu(s, { name: "Technik" })).body.daten as { team: { id: TeamId } };
    expect((await teamSetzen(s, botId, { teamId: zweites.team.id })).status).toBe(200);
    expect((await repo.teams.get(s.u.db, teamId))?.leadBotId).toBe(undefined);
    expect((await repo.bots.get(s.u.db, botId))?.teamId).toBe(zweites.team.id);
    expect((await repo.teams.get(s.u.db, zweites.team.id))?.leadBotId).toBe(undefined);
  });

  it("ein einfaches Mitglied zu versetzen lässt die Leitung des Teams stehen", async () => {
    const s = await eingerichtet();
    const { teamId, botId } = await mitTeam(s);
    await teamPatch(s, teamId, { lead: botId });
    const r = await anlegen(s, { ...ZWEITER_BOT, name: "Nora" });
    const mitglied = (r.body.daten as { bot: { id: BotId } }).bot.id;
    await teamSetzen(s, mitglied, { teamId });
    expect((await teamSetzen(s, mitglied, {})).status).toBe(200);
    expect((await repo.teams.get(s.u.db, teamId))?.leadBotId).toBe(botId);
  });

  // Gegenprobe zur Vorbedingung „Team vorhanden“: den Fakt `teamExists` in `botTeamSetzen` fest
  // auf `true` setzen → dieser Test wird rot.
  it("ein unbekanntes Team lehnt die Zuordnung ab", async () => {
    const s = await eingerichtet();
    await anlegen(s, ZWEITER_BOT);
    const r = await teamSetzen(s, await zweiterBot(s), {
      teamId: "tea_00000000000000000000000000",
    });
    expect(r.status).toBe(404);
    expect(r.body.fehler?.code).toBe("nicht_gefunden");
  });
});

describe("Teams verwalten", () => {
  it("ohne Sitzung 401, ohne Prüfzeichen 403, nichts angelegt", async () => {
    const s = await eingerichtet();
    expect((await teamNeu(s, { name: "Content" }, { dose: undefined })).status).toBe(401);
    expect((await teamNeu(s, { name: "Content" }, { pruefzeichen: null })).status).toBe(403);
    expect(await repo.teams.list(s.u.db)).toEqual([]);
  });

  it("legt ein Team an und schreibt beide Belege", async () => {
    const s = await eingerichtet();
    const ab = await naechsteSeq(s);
    const r = await teamNeu(s, { name: "Content" });
    expect(r.status).toBe(201);
    const [team] = await repo.teams.list(s.u.db);
    expect(team?.name).toBe("Content");
    expect(team?.leadBotId).toBe(undefined);
    expect(team?.collaboration).toBe("aus");
    expect(await belegArten(s, ab)).toEqual(["team.anlegen", "team.anlegen"]);
  });

  it("ändert Name, Zusammenarbeit und Abnahme-Standard", async () => {
    const s = await eingerichtet();
    const { teamId } = await mitTeam(s);
    const r = await teamPatch(s, teamId, {
      name: "Redaktion",
      collaboration: "leitung_fuehrt",
      acceptance: "besitzer",
    });
    expect(r.status).toBe(200);
    const team = await repo.teams.get(s.u.db, teamId);
    expect(team?.name).toBe("Redaktion");
    expect(team?.collaboration).toBe("leitung_fuehrt");
    expect(team?.acceptanceDefault).toBe("besitzer");
  });

  it("setzt die Leitung auf ein Mitglied und nimmt sie wieder weg", async () => {
    const s = await eingerichtet();
    const { teamId, botId } = await mitTeam(s);
    expect((await teamPatch(s, teamId, { lead: botId })).status).toBe(200);
    expect((await repo.teams.get(s.u.db, teamId))?.leadBotId).toBe(botId);
    expect((await teamPatch(s, teamId, { lead: null })).status).toBe(200);
    expect((await repo.teams.get(s.u.db, teamId))?.leadBotId).toBe(undefined);
  });

  // Gegenprobe zur Vorbedingung „Leitung im Team“: den Fakt `leadInTeam` in `teamAendern` fest
  // auf `true` setzen → dieser Test wird rot.
  it("eine Leitung, die nicht zum Team gehört, lehnt das Tor ab", async () => {
    const s = await eingerichtet();
    const { teamId } = await mitTeam(s);
    const fremd = await standardBot(s);
    const r = await teamPatch(s, teamId, { lead: fremd });
    expect(r.status).toBe(409);
    expect(r.body.fehler?.code).toBe("leitung_nicht_im_team");
    expect((await repo.teams.get(s.u.db, teamId))?.leadBotId).toBe(undefined);
  });

  it("ein unbekanntes Team lehnt Ändern und Löschen ab", async () => {
    const s = await eingerichtet();
    const id = "tea_00000000000000000000000000";
    expect((await teamPatch(s, id, { name: "Neu" })).body.fehler?.code).toBe("nicht_gefunden");
    expect((await teamWeg(s, id)).body.fehler?.code).toBe("nicht_gefunden");
  });

  it("löscht ein Team; seine Bots bleiben und stehen ohne Team da", async () => {
    const s = await eingerichtet();
    const { teamId, botId } = await mitTeam(s);
    const r = await teamWeg(s, teamId);
    expect(r.status).toBe(200);
    expect(await repo.teams.get(s.u.db, teamId)).toBe(undefined);
    expect((await repo.bots.get(s.u.db, botId))?.teamId).toBe(undefined);
  });

  it("die Liste nennt jedes Team mit seinen Bots", async () => {
    const s = await eingerichtet();
    const { teamId, botId } = await mitTeam(s);
    const r = await rufe(s, "teamsListe", teamsListe);
    const daten = r.body.daten as { teams: { id: string; botIds: string[] }[] };
    expect(daten.teams).toEqual([expect.objectContaining({ id: teamId, botIds: [botId] })]);
  });
});
