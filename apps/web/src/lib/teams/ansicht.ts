/**
 * PaiBot – Abbildung der Bots und Teams des Servers auf die Anzeige-Typen der Bausteine: der
 * Haupt-Assistent für sich, die Teams mit ihren Mitgliedern (Leitung zuerst), die Bots ohne Team.
 * Rein, ohne Datenbank; die Seite liest die Daten und ruft `ordne`.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

import type { BotId, TeamId } from "@paibot/shared/ids";
import type { AvatarShape, Bot, BotColor } from "@paibot/shared/objekte";
import { t } from "@paibot/shared/texte";
import type { AbnahmeStandard, TeamsBot, TeamsTeam, Zusammenarbeit } from "@paibot/ui";
import type { BotRechte } from "../bot/bot";

/**
 * Wer abnimmt, wie es gespeichert wird (`faden_abnahmen` der Datenbank). Hier noch einmal
 * geschrieben, damit diese Datei ohne das Datenbank-Paket auskommt und auch im Browser liegt; ein
 * Test prüft, dass beide Formen zusammenpassen.
 */
export type AbnahmeGespeichert = "leitung" | "besitzer" | "ohne";

/** Ein Team, wie die Zugriffsschicht es liefert (Teilmenge, die die Oberfläche braucht). */
export interface TeamDaten {
  id: TeamId;
  name: string;
  leadBotId?: BotId;
  collaboration: Zusammenarbeit;
  acceptanceDefault: AbnahmeGespeichert;
}

/** Ein Bot, wie Seitenleiste und Steckbrief ihn brauchen. */
export interface AnsichtBot {
  id: BotId;
  name: string;
  /** Aufgabe in einem Satz; leer bei einem einzelnen Bot. */
  rolle: string;
  farbe: BotColor;
  form: AvatarShape;
  pausiert: boolean;
  /** Dieser Bot leitet das Team, in dem er steht. */
  leitung: boolean;
  /** Der Haupt-Assistent (der Standard-Bot der Einstellungen). */
  haupt: boolean;
}

/** Ein Team mit seinen Mitgliedern, Leitung zuerst. */
export interface AnsichtTeam {
  id: TeamId;
  name: string;
  leitungId?: BotId;
  zusammenarbeit: Zusammenarbeit;
  abnahme: AbnahmeGespeichert;
  bots: readonly AnsichtBot[];
}

/** Alles, was Seitenleiste und Teams-Seiten vom Server brauchen. */
export interface BotsUndTeams {
  /** Fehlt, solange kein Standard-Bot gesetzt ist (vor der Einrichtung). */
  haupt?: AnsichtBot;
  teams: readonly AnsichtTeam[];
  /** Bots ohne Team und Bots, deren Team es nicht mehr gibt. */
  ohneTeam: readonly AnsichtBot[];
}

/**
 * Wer abnimmt, in den Worten der Oberfläche. Die Oberfläche kennt zwei Fälle: die Leitung oder
 * du. Alles andere (`ohne`) zeigt sie als „du“, denn ohne Leitung bleibt die Abnahme beim
 * Besitzer; die Wahl „ohne“ gehört zum einzelnen Faden, nicht zum Standard eines Teams.
 */
export function abnahmeAnzeige(gespeichert: AbnahmeGespeichert): AbnahmeStandard {
  return gespeichert === "leitung" ? "leitung" : "ich";
}

/** Umgekehrt: die Wahl der Oberfläche in den gespeicherten Wert. */
export function abnahmeGespeichert(anzeige: AbnahmeStandard): AbnahmeGespeichert {
  return anzeige === "leitung" ? "leitung" : "besitzer";
}

function ansichtBot(b: Bot, haupt: boolean, leitung: boolean): AnsichtBot {
  return {
    id: b.id,
    name: b.name,
    rolle: b.role,
    farbe: b.color,
    form: b.avatarShape,
    pausiert: b.paused,
    leitung,
    haupt,
  };
}

/**
 * Ordnet Bots und Teams für die Oberfläche: Der Standard-Bot wird der
 * Haupt-Assistent und steht für sich, auch wenn er ein Team hat. Jedes Team bekommt seine
 * Mitglieder, die Leitung zuerst; die übrigen in der Reihenfolge der Liste. Ein Bot ohne Team und
 * ein Bot, dessen Team es nicht mehr gibt, stehen unter „Ohne Team“.
 */
export function ordne(
  bots: readonly Bot[],
  teams: readonly TeamDaten[],
  standardBotId: string | undefined,
): BotsUndTeams {
  const hauptBot = bots.find((b) => b.id === standardBotId);
  const uebrige = bots.filter((b) => b.id !== hauptBot?.id);
  const gruppen = teams.map((tm) => {
    const mitglieder = uebrige
      .filter((b) => b.teamId === tm.id)
      .sort((a, b) => Number(b.id === tm.leadBotId) - Number(a.id === tm.leadBotId));
    return {
      id: tm.id,
      name: tm.name,
      ...(tm.leadBotId === undefined ? {} : { leitungId: tm.leadBotId }),
      zusammenarbeit: tm.collaboration,
      abnahme: tm.acceptanceDefault,
      bots: mitglieder.map((b) => ansichtBot(b, false, b.id === tm.leadBotId)),
    } satisfies AnsichtTeam;
  });
  const bekannt = new Set(teams.map((tm) => tm.id));
  const ohneTeam = uebrige
    .filter((b) => b.teamId === undefined || !bekannt.has(b.teamId))
    .map((b) => ansichtBot(b, false, false));
  return {
    ...(hauptBot === undefined ? {} : { haupt: ansichtBot(hauptBot, true, false) }),
    teams: gruppen,
    ohneTeam,
  };
}

/**
 * Der Steckbrief eines Bots: Rolle, Modell in Worten und die drei Listen aus den geltenden
 * Regeln. `modell` ist der Name des Modells oder „Wie Pai“, wenn der Bot keins eigenes hat.
 */
export function teamsBot(bot: AnsichtBot, modell: string, rechte: BotRechte): TeamsBot {
  return {
    id: bot.id,
    name: bot.name,
    rolle: bot.rolle,
    farbe: bot.farbe,
    form: bot.form,
    pausiert: bot.pausiert,
    ...(bot.haupt ? { haupt: true } : {}),
    modell,
    darf: rechte.erlaubt.map((r) => r.text),
    fragt: rechte.fragt.map((r) => r.text),
    nie: rechte.nie.map((r) => r.text),
  };
}

/**
 * Das Team für die Bausteine. Ohne Leitung bleibt `leitungId` leer: Die Bausteine vergleichen die
 * Kennung, und keine Kennung ist leer – so ist kein Bot die Leitung.
 */
export function teamsTeam(team: AnsichtTeam): TeamsTeam {
  return {
    id: team.id,
    name: team.name,
    leitungId: team.leitungId ?? "",
    zusammenarbeit: team.zusammenarbeit,
    abnahme: abnahmeAnzeige(team.abnahme),
  };
}

/** Name des Modells für den Steckbrief; ohne eigenes Modell steht dort „Wie Pai“. */
export function modellName(name: string | undefined): string {
  return name ?? t("teams.steckbrief.modell_wie_pai");
}
