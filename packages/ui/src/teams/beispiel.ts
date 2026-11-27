/**
 * PaiBot – Beispiel-Daten der Teams-Vorschau: Team „Content“ aus der Vorlage und ein zweites Team.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-27
 */

import { t } from "@paibot/shared/texte";
import type { TeamsBot, TeamsDaten, TeamsSzene, Vorlage } from "./typen";

export const SZENEN: readonly { id: TeamsSzene; textKey: `teams.szene.${TeamsSzene}` }[] = [
  { id: "seitenleiste", textKey: "teams.szene.seitenleiste" },
  { id: "bot", textKey: "teams.szene.bot" },
  { id: "team", textKey: "teams.szene.team" },
  { id: "entwurf", textKey: "teams.szene.entwurf" },
  { id: "uebersicht", textKey: "teams.szene.uebersicht" },
];

export const VORLAGE_TEAM_ID = "team-content";

const DARF = [t("teams.recht.antworten"), t("teams.recht.lesen")] as const;
const FRAGT = [t("teams.recht.frage")] as const;
const NIE = [t("teams.recht.apps"), t("teams.recht.regeln"), t("teams.recht.bots")] as const;

/** Der Bot, der aus der Vorlage entsteht: engste Rechte, ohne Apps. */
function ausVorlage(v: Vorlage, leitung: string, teamId: string): TeamsBot[] {
  return v.bots.map((b) => ({
    id: `bot-${b.name.toLowerCase()}`,
    name: b.name,
    rolle: b.aufgabe,
    farbe: b.farbe,
    form: b.form,
    teamId,
    pausiert: false,
    modell: b.modell === "wie_pai" ? t("teams.steckbrief.modell_wie_pai") : b.modell,
    darf: DARF,
    fragt: b.name === leitung ? [t("teams.recht.abnehmen")] : FRAGT,
    nie: NIE,
  }));
}

/**
 * Alle Beispiele der Vorschau. Das Team „Content“ kommt aus der Vorlage, die der Aufrufer
 * mitbringt (die Seite liest `vorlagen/teams/content-team.json`); das Team „Recherche“ ist erfunden.
 */
export function beispielDaten(vorlage: Vorlage): TeamsDaten {
  const content = ausVorlage(vorlage, vorlage.team.leitung.name, VORLAGE_TEAM_ID);
  const pai: TeamsBot = {
    id: "bot-pai",
    name: "Pai",
    rolle: "Dein Standard-Bot: erster Ansprechpunkt für alles.",
    farbe: "limette",
    form: "blatt",
    pausiert: false,
    haupt: true,
    modell: t("teams.vorschau.modell_beispiel"),
    darf: [t("teams.recht.antworten"), t("teams.recht.lesen"), t("teams.recht.entwuerfe")],
    fragt: [t("teams.recht.anlegen_aendern")],
    nie: [t("teams.recht.schluessel"), t("teams.recht.notaus")],
  };
  const solo: TeamsBot = {
    id: "bot-notiz",
    name: "Notiz",
    rolle: "Merkt sich Kleinigkeiten und erinnert dich daran.",
    farbe: "gelb",
    form: "kiesel",
    pausiert: false,
    modell: t("teams.steckbrief.modell_wie_pai"),
    darf: DARF,
    fragt: FRAGT,
    nie: NIE,
  };
  const recherche: TeamsBot[] = [
    {
      id: "bot-quelle",
      name: "Quelle",
      rolle: "Leitung: verteilt Recherche-Aufträge und nimmt sie ab.",
      farbe: "tuerkis",
      form: "kiesel",
      teamId: "team-recherche",
      pausiert: false,
      modell: t("teams.steckbrief.modell_wie_pai"),
      darf: DARF,
      fragt: [t("teams.recht.abnehmen")],
      nie: NIE,
    },
    {
      id: "bot-zahlen",
      name: "Zahlen",
      rolle: "Sucht Zahlen und nennt, woher sie stammen.",
      farbe: "orange",
      form: "dee",
      teamId: "team-recherche",
      pausiert: true,
      modell: t("teams.steckbrief.modell_wie_pai"),
      darf: DARF,
      fragt: FRAGT,
      nie: NIE,
    },
  ];
  const leitungContent = content.find((b) => b.name === vorlage.team.leitung.name);
  return {
    vorlage,
    vorlageTeamId: VORLAGE_TEAM_ID,
    bots: [pai, ...recherche, ...content, solo],
    teams: [
      {
        id: VORLAGE_TEAM_ID,
        name: vorlage.team.name,
        leitungId: leitungContent?.id ?? "",
        zusammenarbeit: vorlage.team.zusammenarbeit,
        abnahme: "leitung",
      },
      {
        id: "team-recherche",
        name: "Recherche",
        leitungId: "bot-quelle",
        zusammenarbeit: "aus",
        abnahme: "ich",
      },
    ],
    faeden: [
      {
        id: "f1",
        teamId: VORLAGE_TEAM_ID,
        titel: "Artikel über Wiesen",
        stand: "laeuft",
        zeit: "seit 12 Min.",
      },
      {
        id: "f2",
        teamId: VORLAGE_TEAM_ID,
        titel: "Newsletter im Dezember",
        stand: "wartet",
        zeit: "seit 1 Std.",
      },
      {
        id: "f3",
        teamId: "team-recherche",
        titel: "Preise der Mitbewerber",
        stand: "wartet",
        zeit: "seit 3 Std.",
      },
      {
        id: "f4",
        teamId: "team-recherche",
        titel: "Zahlen zum Markt",
        stand: "laeuft",
        zeit: "seit 4 Min.",
      },
      {
        id: "f5",
        teamId: VORLAGE_TEAM_ID,
        titel: "Artikel über Bienen",
        stand: "fertig",
        zeit: "gestern",
        abgenommenVon: vorlage.team.leitung.name,
      },
    ],
  };
}
