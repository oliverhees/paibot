/**
 * PaiBot – Verwaltung von Bots und Teams: Bots auflisten, anlegen, pausieren, löschen, einem Team
 * zuordnen; Teams auflisten, anlegen, ändern, löschen. Jede Änderung geht als Besitzer-Aktion
 * durch das Tor; die Fakten der Entscheidung liest nur der Server aus der Datenbank, nie der
 * Browser. Route und Test nutzen dieselben Funktionen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

import { repo } from "@paibot/db";
import { PaiBotError } from "@paibot/shared/fehler";
import { type BotId, isId, type ModelId, newId, type TeamId } from "@paibot/shared/ids";
import { LIMITS } from "@paibot/shared/konstanten";
import { TEAM_FIELDS } from "@paibot/shared/tor-fassung-4";
import type { RoutenAktion } from "../api/route";

type TeamFeld = (typeof TEAM_FIELDS)[number];

function botsId(params: Readonly<Record<string, string>>): BotId {
  const id = params.id;
  if (!isId("bot", id)) throw new PaiBotError("nicht_gefunden");
  return id;
}

function teamsId(params: Readonly<Record<string, string>>): TeamId {
  const id = params.id;
  if (!isId("team", id)) throw new PaiBotError("nicht_gefunden");
  return id;
}

/** `GET /api/bots`: alle Bots, älteste zuerst, mit dem Standard-Bot. */
export const botsListe: RoutenAktion<"botsListe"> = async (k) => {
  const einstellungen = await repo.settings.get(k.db);
  return {
    daten: {
      bots: await repo.bots.list(k.db),
      standardBotId: einstellungen?.defaultBotId ?? null,
    },
  };
};

/**
 * `POST /api/bots`: legt einen weiteren Bot an. Ohne Modell nimmt der neue Bot das Modell des
 * Standard-Bots; ohne Team steht er für sich. Die Grenze „Bots insgesamt“ zieht das Tor aus den
 * Fakten `botsAfter` und `maxBots`, die hier der Server zählt.
 */
export const botAnlegen: RoutenAktion<"botAnlegen"> = async (k) => {
  const botId = newId("bot");
  const teamId = k.eingabe.teamId as TeamId | undefined;
  if (teamId !== undefined && (await repo.teams.get(k.db, teamId)) === undefined) {
    throw new PaiBotError("nicht_gefunden");
  }
  const modelId =
    (k.eingabe.modelId as ModelId | undefined) ??
    ((await repo.bots.getDefault(k.db))?.modelId as ModelId | undefined);
  const botsAfter = (await repo.bots.count(k.db)) + 1;
  const ergebnis = await k.tor(
    k.nachweis,
    { type: "bot.anlegen", target: { botId } },
    { botsAfter, maxBots: LIMITS.bots },
    async () => {
      const bot = await repo.bots.create(k.db, {
        id: botId,
        name: k.eingabe.name,
        role: k.eingabe.role,
        instructions: k.eingabe.instructions,
        avatarShape: k.eingabe.avatarShape,
        color: k.eingabe.color,
        ...(modelId === undefined ? {} : { modelId }),
        ...(teamId === undefined ? {} : { teamId }),
      });
      return { value: bot, result: { status: "ok" } };
    },
  );
  return { daten: { bot: ergebnis.value }, status: 201 };
};

/**
 * `PUT /api/bots/:id/pause`: pausiert einen Bot oder hebt die Pause auf. Ein pausierter Bot
 * antwortet nicht mehr – das hält die Grenze „Bot bereit“ des Tors, nicht diese Route.
 */
export const botPausieren: RoutenAktion<"botPausieren"> = async (k) => {
  const botId = botsId(k.params);
  const bot = await repo.bots.get(k.db, botId);
  if (bot === undefined) throw new PaiBotError("nicht_gefunden");
  const paused = k.eingabe.paused;
  const ergebnis = await k.tor(
    k.nachweis,
    { type: "bot.pausieren", target: { botId } },
    { paused, wasPaused: bot.paused },
    async () => {
      const neu = await repo.bots.setPaused(k.db, botId, paused);
      if (neu === undefined) throw new PaiBotError("nicht_gefunden");
      return { value: neu, result: { status: "ok" } };
    },
  );
  return { daten: { bot: ergebnis.value } };
};

/**
 * `DELETE /api/bots/:id`: löscht einen Bot samt seinen Unterhaltungen. Den Standard-Bot und einen
 * Bot mit laufender Antwort lehnt das Tor über seine Vorbedingungen ab (Fakten `isDefaultBot`,
 * `botRunActive`). Die Belege des Bots bleiben: sie hängen nicht an seiner Zeile.
 */
export const botLoeschen: RoutenAktion<"botLoeschen"> = async (k) => {
  const botId = botsId(k.params);
  if ((await repo.bots.get(k.db, botId)) === undefined) throw new PaiBotError("nicht_gefunden");
  const einstellungen = await repo.settings.get(k.db);
  await k.tor(
    k.nachweis,
    { type: "bot.loeschen", target: { botId } },
    {
      isDefaultBot: einstellungen?.defaultBotId === botId,
      botRunActive: await repo.runs.hatAktivenLauf(k.db, botId),
    },
    async () => {
      if (!(await repo.bots.remove(k.db, botId))) throw new PaiBotError("nicht_gefunden");
      return { value: undefined, result: { status: "ok" } };
    },
  );
  return { daten: { geloescht: botId } };
};

/** `PUT /api/bots/:id/team`: ordnet den Bot einem Team zu oder nimmt ihn heraus. */
export const botTeamSetzen: RoutenAktion<"botTeamSetzen"> = async (k) => {
  const botId = botsId(k.params);
  if ((await repo.bots.get(k.db, botId)) === undefined) throw new PaiBotError("nicht_gefunden");
  const teamId = k.eingabe.teamId as TeamId | undefined;
  // Beim Herausnehmen gibt es kein Team, das fehlen könnte: der Fakt ist wahr (Vertrag Fassung 4).
  const teamExists = teamId === undefined || (await repo.teams.get(k.db, teamId)) !== undefined;
  const ergebnis = await k.tor(
    k.nachweis,
    { type: "bot.team_setzen", target: { botId, ...(teamId === undefined ? {} : { teamId }) } },
    { teamExists },
    async () => {
      const neu = await repo.bots.setTeam(k.db, botId, teamId ?? null);
      if (neu === undefined) throw new PaiBotError("nicht_gefunden");
      return { value: neu, result: { status: "ok" } };
    },
  );
  return { daten: { bot: ergebnis.value } };
};

/** `GET /api/teams`: alle Teams mit ihren Bots, älteste zuerst. */
export const teamsListe: RoutenAktion<"teamsListe"> = async (k) => {
  const liste = await repo.teams.list(k.db);
  const alleBots = await repo.bots.list(k.db);
  return {
    daten: {
      teams: liste.map((team) => ({
        ...team,
        botIds: alleBots.filter((b) => b.teamId === team.id).map((b) => b.id),
      })),
    },
  };
};

/** `POST /api/teams`: legt ein Team an. Leitung und Schalter kommen mit dem Ändern. */
export const teamAnlegen: RoutenAktion<"teamAnlegen"> = async (k) => {
  const teamId = newId("team");
  const ergebnis = await k.tor(
    k.nachweis,
    { type: "team.anlegen", target: { teamId } },
    {},
    async () => {
      const team = await repo.teams.create(k.db, { id: teamId, name: k.eingabe.name });
      return { value: team, result: { status: "ok" } };
    },
  );
  return { daten: { team: ergebnis.value }, status: 201 };
};

/**
 * `PUT /api/teams/:id`: ändert Name, Leitung, Zusammenarbeit oder Abnahme-Standard. Welche Felder
 * kamen, meldet die Route als Fakt `fields`. Dass die neue Leitung zum Team gehört, prüft das Tor
 * über den Fakt `leadInTeam` – nicht diese Route.
 */
export const teamAendern: RoutenAktion<"teamAendern"> = async (k) => {
  const teamId = teamsId(k.params);
  const vorhanden = await repo.teams.get(k.db, teamId);
  const eingabe = k.eingabe;
  const fields: TeamFeld[] = TEAM_FIELDS.filter((feld) => eingabe[feld] !== undefined);
  if (fields.length === 0) throw new PaiBotError("eingabe_ungueltig");
  const lead = eingabe.lead as BotId | null | undefined;
  // Ohne neue Leitung und beim Wegnehmen gibt es keine Leitung, die fehlen könnte: der Fakt ist wahr.
  const leadInTeam =
    lead === undefined || lead === null ? true : await repo.teams.istMitglied(k.db, teamId, lead);
  const ergebnis = await k.tor(
    k.nachweis,
    { type: "team.aendern", target: { teamId } },
    { fields, teamExists: vorhanden !== undefined, leadInTeam },
    async () => {
      const team = await repo.teams.update(k.db, teamId, {
        ...(eingabe.name === undefined ? {} : { name: eingabe.name }),
        ...(lead === undefined ? {} : { leadBotId: lead }),
        ...(eingabe.collaboration === undefined ? {} : { collaboration: eingabe.collaboration }),
        ...(eingabe.acceptance === undefined ? {} : { acceptanceDefault: eingabe.acceptance }),
      });
      if (team === undefined) throw new PaiBotError("nicht_gefunden");
      return { value: team, result: { status: "ok" } };
    },
  );
  return { daten: { team: ergebnis.value } };
};

/**
 * `DELETE /api/teams/:id`: löscht ein Team. Seine Bots bleiben und stehen danach ohne Team da; ein
 * Team mit Fäden lehnt die Zugriffsschicht mit festem Satz ab.
 */
export const teamLoeschen: RoutenAktion<"teamLoeschen"> = async (k) => {
  const teamId = teamsId(k.params);
  const vorhanden = await repo.teams.get(k.db, teamId);
  await k.tor(
    k.nachweis,
    { type: "team.loeschen", target: { teamId } },
    { teamExists: vorhanden !== undefined },
    async () => {
      if (!(await repo.teams.remove(k.db, teamId))) throw new PaiBotError("nicht_gefunden");
      return { value: undefined, result: { status: "ok" } };
    },
  );
  return { daten: { geloescht: teamId } };
};
