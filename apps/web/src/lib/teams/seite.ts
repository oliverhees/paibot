/**
 * PaiBot – Lesen für die Seiten „Bot“ und „Teams“: der Steckbrief eines Bots (Rolle, Team,
 * Modell, geltende Regeln) und die Übersicht aller Teams mit ihren Bots.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

import { type Database, repo } from "@paibot/db";
import type { BotId, TeamId } from "@paibot/shared/ids";
import type { TeamsBot, TeamsTeam } from "@paibot/ui";
import { botRechte, modellVon } from "../bot/bot";
import { type AnsichtTeam, modellName, ordne, teamsBot, teamsTeam } from "./ansicht";

/** Alles, was die Seite eines Bots zeigt. */
export interface BotSeiteDaten {
  bot: TeamsBot;
  /** Team des Bots, falls er in einem steht. */
  team?: TeamsTeam;
  /** Teams zur Wahl, wenn der Besitzer den Bot umhängt (ohne Team ist auch eine Wahl). */
  teams: readonly { id: string; name: string }[];
  /** Der Haupt-Assistent: Er lässt sich nicht löschen und hat seine eigene Seite. */
  haupt: boolean;
}

/**
 * Steckbrief eines Bots. Hier steht bewusst **kein** `getDefault`: Die Seite zeigt den Bot, dessen
 * Kennung in der Adresse steht. Welcher davon der Standard-Bot ist, sagt `haupt`.
 */
export async function botSeite(db: Database, botId: BotId): Promise<BotSeiteDaten | undefined> {
  const einstellungen = await repo.settings.get(db);
  const [bots, teams] = await Promise.all([repo.bots.list(db), repo.teams.list(db)]);
  const gruppen = ordne(bots, teams, einstellungen?.defaultBotId);
  const alle = [
    ...(gruppen.haupt === undefined ? [] : [gruppen.haupt]),
    ...gruppen.teams.flatMap((tm) => tm.bots),
    ...gruppen.ohneTeam,
  ];
  const ansicht = alle.find((b) => b.id === botId);
  const roh = bots.find((b) => b.id === botId);
  if (ansicht === undefined || roh === undefined) return undefined;
  const regeln = await repo.rules.listActive(db);
  const modell = await modellVon(db, roh);
  const team = teams.find((tm) => tm.id === roh.teamId);
  const gruppe = gruppen.teams.find((tm) => tm.id === team?.id);
  const bot = teamsBot(ansicht, modellName(modell?.displayName), botRechte(regeln));
  return {
    bot: { ...bot, ...(roh.teamId === undefined ? {} : { teamId: roh.teamId }) },
    ...(gruppe === undefined ? {} : { team: teamsTeam(gruppe) }),
    teams: teams.map((tm) => ({ id: tm.id, name: tm.name })),
    haupt: ansicht.haupt,
  };
}

/** Ein Team mit seinen Mitgliedern für die Seiten. */
export interface TeamMitBots {
  team: TeamsTeam;
  mitglieder: readonly TeamsBot[];
}

/** Alles, was die Teams-Seiten zeigen. */
export interface TeamsSeiteDaten {
  teams: readonly TeamMitBots[];
  /** Bots ohne Team; der Besitzer ordnet sie von hier aus einem Team zu. */
  ohneTeam: readonly TeamsBot[];
  /** Keine Tagesgrenze gesetzt: Der Hinweis am Schalter „Zusammenarbeit“ erscheint. */
  ohneTagesbudget: boolean;
}

/** Ein Bot für die Listen der Teams-Seiten: ohne Modell und Regeln, die zeigt nur sein Steckbrief. */
function kurz(team: AnsichtTeam | undefined, bot: Parameters<typeof teamsBot>[0]): TeamsBot {
  const b = teamsBot(bot, "", { erlaubt: [], fragt: [], nie: [] });
  return { ...b, ...(team === undefined ? {} : { teamId: team.id }) };
}

/**
 * Teams mit ihren Bots. Auch hier kein `getDefault` für die Auswahl: Der Standard-Bot steht nur
 * deshalb gesondert, weil er der Haupt-Assistent ist, und bleibt damit außerhalb der Teams.
 */
export async function teamsSeite(db: Database): Promise<TeamsSeiteDaten> {
  const einstellungen = await repo.settings.get(db);
  const [bots, teams] = await Promise.all([repo.bots.list(db), repo.teams.list(db)]);
  const gruppen = ordne(bots, teams, einstellungen?.defaultBotId);
  return {
    teams: gruppen.teams.map((tm) => ({
      team: teamsTeam(tm),
      mitglieder: tm.bots.map((b) => kurz(tm, b)),
    })),
    ohneTeam: gruppen.ohneTeam.map((b) => kurz(undefined, b)),
    ohneTagesbudget:
      einstellungen?.dailyTokenBudget === undefined || einstellungen.dailyTokenBudget === null,
  };
}

/** Ein einzelnes Team für seine Verwaltungsseite. */
export async function teamSeite(
  db: Database,
  teamId: TeamId,
): Promise<(TeamMitBots & { ohneTagesbudget: boolean }) | undefined> {
  const daten = await teamsSeite(db);
  const treffer = daten.teams.find((e) => e.team.id === teamId);
  return treffer === undefined ? undefined : { ...treffer, ohneTagesbudget: daten.ohneTagesbudget };
}
