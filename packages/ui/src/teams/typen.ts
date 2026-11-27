/**
 * PaiBot – Anzeige-Typen für Bots und Teams: nur Daten für die Bausteine, keine Verträge mit dem Server.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-27
 */

import type { AvatarShape, BotColor } from "@paibot/shared/objekte";

// Alles hier gehört den Bausteinen unter `teams/`. Es gibt keinen Server und keine Vertragsdatei;
// später werden diese Typen aus den Daten des Servers befüllt. Bis dahin kommen sie aus `beispiel.ts`.

export type Zusammenarbeit = "aus" | "leitung_fuehrt";
export type AbnahmeStandard = "leitung" | "ich";

/** Ein Bot, wie die Verwaltung ihn zeigt. */
export interface TeamsBot {
  id: string;
  name: string;
  /** Aufgabe in einem Satz. */
  rolle: string;
  farbe: BotColor;
  form?: AvatarShape;
  /** Kennung des Teams; ohne Team steht der Bot unter „Ohne Team“. */
  teamId?: string;
  pausiert: boolean;
  /** Anzeige des Modells („Wie Pai“ oder ein Name). */
  modell: string;
  darf: readonly string[];
  fragt: readonly string[];
  nie: readonly string[];
}

export interface TeamsTeam {
  id: string;
  name: string;
  /** Kennung des Bots, der das Team leitet. */
  leitungId: string;
  zusammenarbeit: Zusammenarbeit;
  abnahme: AbnahmeStandard;
}

export type UebersichtStand = "laeuft" | "wartet" | "fertig";

/** Ein Faden in der Teams-Übersicht; mehr als „öffnen“ und „stoppen“ gibt es dort nicht. */
export interface UebersichtFaden {
  id: string;
  teamId: string;
  titel: string;
  stand: UebersichtStand;
  /** Kurze Zeitangabe („vor 5 Min.“). */
  zeit: string;
  /** Bei „fertig“: wer abgenommen hat. */
  abgenommenVon?: string;
}

/** Ein Bot aus der Vorlage eines Team-Entwurfs, mit der Anweisung im vollen Wortlaut. */
export interface VorlageBot {
  name: string;
  aufgabe: string;
  anweisung: string;
  modell: string;
  form: AvatarShape;
  farbe: BotColor;
}

/** Form der Vorlage (`vorlagen/teams/*.json`), soweit die Vorschau sie liest. */
export interface Vorlage {
  titel: string;
  beschreibung: string;
  team: {
    name: string;
    leitung: { name: string };
    zusammenarbeit: Zusammenarbeit;
    abnahme: "leitung" | "ich" | string;
  };
  bots: readonly VorlageBot[];
}

export interface TeamsDaten {
  bots: readonly TeamsBot[];
  teams: readonly TeamsTeam[];
  faeden: readonly UebersichtFaden[];
  /** Das Team der Vorlage; es entsteht erst, wenn der Entwurf angelegt wird. */
  vorlage: Vorlage;
  /** Kennung, unter der das Team der Vorlage angelegt wird. */
  vorlageTeamId: string;
}

export type TeamsSzene = "seitenleiste" | "bot" | "team" | "entwurf" | "uebersicht";
