/**
 * PaiBot – Anzeige-Typen der Fäden: nur Daten für die Bausteine, keine Verträge mit dem Server.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import type { AvatarShape, BotColor } from "@paibot/shared/objekte";
import type { AvatarLebendigZustand } from "../avatar-lebendig/daten";

// Alles hier sind Anzeige-Typen. Sie gehören den Bausteinen unter `faden/` und werden später
// aus den Daten des Servers befüllt; bis dahin kommen die Angaben aus `beispiel.ts`.
// Jeder Text, den ein Bot geschrieben hat, ist als solcher erkennbar (`untrusted`) und wird
// nur als reiner Text angezeigt.

/** Ein Bot, so wie die Bausteine ihn brauchen: Name, Rolle, Avatar, Stand. */
export interface FadenBot {
  id: string;
  name: string;
  /** Aufgabe in wenigen Worten („Grafik“, „Video“). */
  rolle: string;
  farbe: BotColor;
  form?: AvatarShape;
  zustand: AvatarLebendigZustand;
  /** Kurzes Wort für Listen („führt“, „Plakat“, „fragt dich“); kommt aus Ereignissen. */
  stand: string;
  standArt?: "warn" | "aktiv";
  leitung?: boolean;
}

export type FadenStand =
  | "laeuft"
  | "wartet_auf_dich"
  | "wartet_auf_abnahme"
  | "fertig"
  | "angehalten"
  | "grenze";

export type ZielStand = "offen" | "laeuft" | "wartet" | "erledigt";

/** Ein Punkt von „Fertig, wenn“. */
export interface Ziel {
  id: string;
  text: string;
  stand: ZielStand;
  botId?: string;
  /** Kurzer Zusatz („Ida schreibt“, „Eli fragt dich: Preise?“). */
  hinweis?: string;
}

export interface Etappe {
  id: string;
  /** Ohne Namen ist es nur eine Liste ohne Etappen. */
  name?: string;
  ziele: Ziel[];
}

/** Ein Platz auf dem Staffelstab: ein Bot oder du. */
export interface StabPlatz {
  /** Bot-Kennung oder `du`. */
  id: string;
  name: string;
  /** Wort unter dem Namen („führt“, „Plakat“, „liest mit“). */
  wort: string;
  wortArt?: "warn" | "aktiv";
  /** Nur Anzeige: hat einen offenen Auftrag (kommt aus Ereignissen). */
  dran?: boolean;
  /** Nur Anzeige: die Leitung. */
  fuehrt?: boolean;
  /** Nur Anzeige: kommt als Nächstes dran. */
  naechste?: boolean;
  farbe?: BotColor;
  form?: AvatarShape;
  zustand?: AvatarLebendigZustand;
}

export interface BudgetAnzeige {
  /** 0 bis 100. */
  prozent: number;
}

export interface TiefeAnzeige {
  an: number;
  max: number;
}

export interface Lieferstueck {
  id: string;
  titel: string;
  meta: string;
  symbol: "plakat" | "auge" | "doku";
  beleg?: BelegInfo;
}

export interface ErgebnisDaten {
  titel: string;
  /** „von Mila abgenommen · 14:47 · 4 von 4 Punkten erfüllt“ */
  untertitel: string;
  lieferungen: Lieferstueck[];
  uebergaben: string;
  dauer?: string;
}

/** Eine feste Möglichkeit des Servers oder eine Möglichkeit, die ein Bot angeboten hat. */
export type Vorschlag =
  | { art: "fest"; text: string }
  | { art: "moeglichkeit"; nummer: number; text: string };

export interface Frage {
  id: string;
  botId: string;
  text: string;
  untrusted?: boolean;
  vorschlaege: Vorschlag[];
}

/** Was beim Klick auf einen Antwort-Vorschlag passiert: der Text kommt ins Feld, nichts wird gesendet. */
export interface VorschlagWahl {
  frageId: string;
  vorschlag: Vorschlag;
  /** Text, der ins Eingabefeld kommt. */
  text: string;
}

export interface FadenKopfDaten {
  id: string;
  titel: string;
  /** Wer abnimmt („Mila“); nur Anzeige. */
  abnahme: string;
  stand: FadenStand;
  /** Kurzer Stand-Text in der Kopfzeile („läuft · 8 Min“). */
  standText: string;
  etappen: Etappe[];
  /** Beteiligte in der Reihenfolge des Staffelstabs (Bots, dazu `du`). */
  stab: StabPlatz[];
  /** Weitere Beteiligte, die nicht auf der Bahn stehen (für den Stapel „+N“). */
  weitere?: StabPlatz[];
  budget: BudgetAnzeige;
  tiefe: TiefeAnzeige;
  /** Anzahl der Beteiligten, nach der die Schwelle für die schmale Zeile gilt. */
  beteiligte: number;
  fragen?: Frage[];
  /** Nur gesetzt, wenn der Server den Auftrag als fertig meldet. */
  ergebnis?: ErgebnisDaten;
  /** Wer führt, wer dran ist, wer als Nächstes kommt (Namen für die schmale Zeile). */
  dranText?: string;
  etappeText?: string;
}

export interface BelegInfo {
  nr: number;
  was: string;
  weg: string;
  zeit: string;
  tor?: string;
  grenze?: string;
}

/** Zulieferung: ein Stück Arbeit, das ein Bot an einen anderen liefert. */
export interface Zulieferung {
  id: string;
  titel: string;
  meta: string;
  von: string;
  an: string;
  symbol: "plakat" | "auge" | "doku";
  untrusted?: boolean;
  beleg?: BelegInfo;
}

export type Abnahme = "leitung" | "ich" | "ohne";

/** Der Auftragszettel, so wie die Leitung ihn abgegeben hat und das Tor ihn erkannt hat. */
export interface ZettelDaten {
  von: string;
  ziel: string;
  fertigWenn: string[];
  abnahme: Abnahme;
  /** Grenzen, die der Bot im Zettel genannt hat: nur ein Vorschlag, ohne Wirkung. */
  grenzenVorschlag?: string;
  /** Grenzen, die das Tor gesetzt hat. */
  grenzen?: string;
  belege?: BelegInfo;
}

export type ZeilenArt = "uebergabe" | "bitte" | "fertig" | "zurueck" | "frage" | "unklar";

/** Eine Zeile, die der Server in einer Antwort erkannt hat, mit dem Ergebnis des Tors. */
export interface ErkannteZeile {
  art: ZeilenArt;
  /** An wen (Name, bereinigt angezeigt). */
  an?: string;
  ergebnis: "erlaubt" | "abgelehnt";
  /** Grund-Wort bei Ablehnung („Weg nicht erlaubt“). */
  grund?: string;
  zettel?: ZettelDaten;
  /** Reiner Text des Zettels, wenn kein vollständiger Zettel vorliegt. */
  zettelText?: string;
  beleg?: BelegInfo;
}

export type FilterArt = "detail" | "ergebnis" | "frage";

export interface Beitrag {
  art: "beitrag";
  id: string;
  /** `du` oder eine Bot-Kennung. */
  von: string;
  zeit: string;
  text: string;
  /** Gehört zu: Einzelheiten, Ergebnissen oder Dingen an dich. */
  filter: FilterArt;
  /** Unter deiner Nachricht: Kennung der Leitung, die antwortet („an Mila, die Leitung“). */
  route?: string;
  /** Marke „direkte Bitte“ mit ihrem Beleg. */
  direkteBitte?: BelegInfo;
  untrusted?: boolean;
  zulieferungen?: Zulieferung[];
  zeilen?: ErkannteZeile[];
  beleg?: BelegInfo;
  /** Der Beitrag ist eine Frage an dich (Zeichen am Avatar). */
  fragt?: boolean;
  /** Abnahme der Leitung: der Stempel steht nur, wenn der Server den Auftrag als fertig meldet. */
  abnahme?: { text: string; fertig: boolean };
  /** Ein laufender Text: Schreibmarke. */
  streamt?: boolean;
}

export interface Gruppe {
  art: "gruppe";
  id: string;
  titel?: string;
  /** Kennungen der Bots, deren Avatare im Stapel stehen. */
  autoren: string[];
  /** „9 Beiträge von Sam, Eli und Noa“ – so kommt es vom Aufrufer (siehe `ergebnisZeile`). */
  kopf: string;
  /** „Termine als Text, Fotoauswahl für die Webseite“ – eine übergebene Eigenschaft, kein erzeugter Text. */
  ergebnis: string;
  /** Mindestens eine Zulieferung stammt aus fremden Inhalten. */
  belastet?: boolean;
  /** Ergänzung der Leitung (Kurzfassung ihrer `Fertig:`-Zeile), getrennt als Bot-Text. */
  zusatz?: { von: string; text: string };
  abgenommen?: boolean;
  filter: Exclude<FilterArt, "frage">;
  inhalt: GespraechsEintrag[];
}

export interface Trenner {
  art: "trenner";
  id: string;
  text: string;
}

export interface GrenzenWahl {
  id: string;
  titel: string;
  text: string;
  art: "zuschlag" | "selbst" | "abschliessen";
  empfohlen?: boolean;
}

export interface GrenzenKarteDaten {
  art: "grenze";
  id: string;
  zeit: string;
  titel: string;
  text: string;
  wahl: GrenzenWahl[];
  /** Zuschläge dieses Auftrags: „1 von 5“. */
  zuschlaege: { benutzt: number; max: number };
  beleg?: BelegInfo;
}

export interface Hinweisband {
  art: "band";
  id: string;
  titel: string;
  text: string;
  ton: "halt";
}

export type GespraechsEintrag = Beitrag | Gruppe | Trenner | GrenzenKarteDaten | Hinweisband;

export interface BelegZeile {
  zeit: string;
  was: string;
  weg: string;
  info: BelegInfo;
  /** Mit Rand in der Farbe des Akzents (z. B. direkte Bitte, Fragen). */
  markiert?: boolean;
}

export interface LeistenDaten {
  etappen: Etappe[];
  naechstOffen?: { titel: string; text: string };
  lieferungen: Zulieferung[];
  fragen: Frage[];
  belege: BelegZeile[];
  belegeText?: string;
  /** Kennungen aller Beteiligten (für den Reiter „Team“). */
  beteiligte: string[];
  /** Wer führt, wer dran ist, wer als Nächstes kommt: aus Ereignissen des Servers. */
  fuehrt: string;
  dran: string[];
  naechste: string[];
}

export interface TeamFaden {
  id: string;
  titel: string;
  /** Wort rechts („läuft“, „2 Fragen“, „fertig“). */
  stand: string;
  standArt?: "warn" | "aktiv";
  /** Unter-Faden eines Mitglieds (kleine Einrückung). */
  aktiv?: boolean;
}

export interface TeamDaten {
  id: string;
  name: string;
  leitung: string;
  mitglieder: string[];
  faeden: TeamFaden[];
  /** Zeilen „Faden eines Mitglieds“ unter dem Bot. */
  botFaeden?: Record<string, TeamFaden[]>;
  offen: boolean;
}

export interface SeitenleisteDaten {
  notAus: boolean;
  /** Offene Fragen aller Fäden („3 Fragen“); 0 blendet das Feld aus. */
  fragenAnzahl: number;
  fragenText?: string;
  paiFaeden: { id: string; titel: string; stand: string }[];
  teams: TeamDaten[];
  /** Ein weiteres, zugeklapptes Team (Name, Anzahl Bots). */
  weitereTeams?: { id: string; name: string; anzahl: number; leitungId: string }[];
}
