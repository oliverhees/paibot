/**
 * PaiBot – reine Funktionen der Fäden: Form des Kopfs, Ergebnis-Zeile, Filter, Gruppen, Vorschläge.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { ersteZeile, hatLink, kuerze, sauberName } from "./text";
import type {
  Etappe,
  FadenBot,
  FilterArt,
  Frage,
  GespraechsEintrag,
  StabPlatz,
  Vorschlag,
  Ziel,
} from "./typen";

/** Ab so vielen Zielen startet der Kopf als schmale Zeile und die Leiste öffnet sich von selbst. */
export const SCHWELLE_ZIELE = 5;
/** Ab so vielen Beteiligten ebenso. */
export const SCHWELLE_BETEILIGTE = 6;
/** Höchstens so viele Zuschläge je Auftrag (der Server setzt die Grenze, hier nur die Anzeige). */
export const ZUSCHLAEGE_MAX = 5;
/** Länge der ersten Zeile je Zulieferung in der Ergebnis-Zeile. */
export const ERGEBNIS_ZEILE_MAX = 80;
/** Eine Möglichkeit, die ein Bot anbietet, ist höchstens so lang. */
export const MOEGLICHKEIT_MAX = 120;
/** Höchstens so viele Möglichkeiten eines Bots werden gezeigt. */
export const MOEGLICHKEITEN_MAX = 3;

export interface KopfFormEingabe {
  ziele: number;
  beteiligte: number;
  /** Was der Besitzer zuletzt im Browser gewählt hat: `true` zu, `false` offen, sonst nichts. */
  kopfZu?: boolean | null;
  /** Dasselbe für die Leiste: `true` offen, `false` zu. */
  leisteOffen?: boolean | null;
}

export interface KopfFormErgebnis {
  /** Der Faden ist „groß“: schmale Zeile und Leiste von selbst. */
  gross: boolean;
  kopfZu: boolean;
  leisteOffen: boolean;
}

/**
 * Wie startet ein Faden? Ab `SCHWELLE_ZIELE` Zielen oder `SCHWELLE_BETEILIGTE` Beteiligten
 * (gleich oder mehr) ist er groß: der Kopf startet als schmale Zeile, die Leiste ist offen.
 * Darunter ist der Kopf offen und es gibt keine Leiste von selbst. Hat der Besitzer etwas
 * gewählt, gilt das.
 */
export function kopfForm(e: KopfFormEingabe): KopfFormErgebnis {
  const gross = e.ziele >= SCHWELLE_ZIELE || e.beteiligte >= SCHWELLE_BETEILIGTE;
  return {
    gross,
    kopfZu: typeof e.kopfZu === "boolean" ? e.kopfZu : gross,
    leisteOffen: typeof e.leisteOffen === "boolean" ? e.leisteOffen : gross,
  };
}

/** Alle Ziele aller Etappen in einer Liste. */
export function alleZiele(etappen: readonly Etappe[]): Ziel[] {
  return etappen.flatMap((e) => e.ziele);
}

/** „4 von 9“: erledigte und alle Ziele. */
export function zielStand(ziele: readonly Ziel[]): { erledigt: number; gesamt: number } {
  return { erledigt: ziele.filter((z) => z.stand === "erledigt").length, gesamt: ziele.length };
}

/** Die laufende Etappe: die erste mit unerledigten Zielen (sonst die letzte). */
export function laufendeEtappe(etappen: readonly Etappe[]): Etappe | undefined {
  return etappen.find((e) => e.ziele.some((z) => z.stand !== "erledigt")) ?? etappen.at(-1);
}

/** Wörter in einer Aufzählung: „A“, „A und B“, „A, B und C“. */
export function nenne(namen: readonly string[]): string {
  if (namen.length <= 1) return namen[0] ?? "";
  return `${namen.slice(0, -1).join(", ")} und ${namen.at(-1)}`;
}

export interface ErgebnisZeileEingabe {
  /** Anzahl der Beiträge der Gruppe. */
  beitraege: number;
  /** Namen der Bots, die geschrieben haben (aus den Bot-Daten, nicht aus dem Text). */
  autoren: readonly string[];
  /** Die Zulieferungen der Gruppe; nur ihre erste Zeile geht in die Ergebnis-Zeile ein. */
  lieferungen: readonly { text: string; untrusted?: boolean }[];
}

export interface ErgebnisZeileErgebnis {
  /** „9 Beiträge von Sam, Eli und Noa“ */
  kopf: string;
  /** Erste Zeile je Zulieferung, durch Komma getrennt; leer ohne Zulieferung. */
  ergebnis: string;
  /** Mindestens eine Zulieferung ist aus fremden Inhalten. */
  belastet: boolean;
}

/**
 * Die Ergebnis-Zeile einer eingeklappten Gruppe, fest zusammengesetzt aus den Zulieferungen und
 * ohne KI: Namen aus den Bot-Daten, je Zulieferung nur die erste Zeile (höchstens 80 Zeichen,
 * reiner Text). Ein Text, den die Leitung nachträglich ergänzt, kommt nie hier hinein.
 */
export function ergebnisZeile(e: ErgebnisZeileEingabe): ErgebnisZeileErgebnis {
  const namen = [...new Set(e.autoren.map(sauberName))];
  const anzahl = Math.max(0, Math.floor(e.beitraege));
  const beitraege = anzahl === 1 ? "1 Beitrag" : `${anzahl} Beiträge`;
  const kopf = namen.length > 0 ? `${beitraege} von ${nenne(namen)}` : beitraege;
  const zeilen = e.lieferungen
    .map((l) => ersteZeile(l.text, ERGEBNIS_ZEILE_MAX))
    .filter((z) => z !== "");
  return {
    kopf,
    ergebnis: zeilen.join(", "),
    belastet: e.lieferungen.some((l) => l.untrusted === true),
  };
}

/** Die Möglichkeiten, die ein Bot angeboten hat: höchstens 3, je ≤ 120 Zeichen, ohne Link. */
export function gueltigeMoeglichkeiten(texte: readonly string[]): Vorschlag[] {
  const gut: Vorschlag[] = [];
  for (const text of texte) {
    const sauber = text.trim();
    if (sauber === "" || Array.from(sauber).length > MOEGLICHKEIT_MAX || hatLink(sauber)) {
      // Eine ungültige Möglichkeit macht alle ungültig: es gibt dann keine Vorschläge.
      return [];
    }
    gut.push({ art: "moeglichkeit", nummer: gut.length + 1, text: sauber });
  }
  return gut.slice(0, MOEGLICHKEITEN_MAX);
}

/**
 * Was ins Eingabefeld kommt, wenn man einen Vorschlag antippt. Feste Texte des Servers kommen
 * wörtlich; zu einer Möglichkeit eines Bots kommt nur ein fester Text („Möglichkeit 2“), nie der
 * Wortlaut des Bots. Gesendet wird nichts: das tust du selbst.
 */
export function vorschlagText(v: Vorschlag): string {
  return v.art === "fest" ? v.text : `Möglichkeit ${v.nummer}`;
}

/** Feste Antworten, die der Server immer anbieten kann. */
export const FESTE_ANTWORTEN: readonly Vorschlag[] = [
  { art: "fest", text: "Ja" },
  { art: "fest", text: "Nein" },
  { art: "fest", text: "Frag die Leitung" },
];

/** Sichtbare Beschriftung eines Vorschlags (Bot-Text gekürzt, bereinigt). */
export function vorschlagLabel(v: Vorschlag): string {
  return v.art === "fest" ? v.text : kuerze(v.text, MOEGLICHKEIT_MAX);
}

/** Welche Einträge zeigt der Umschalter „Alles · Nur Ergebnisse · Nur an mich“? */
export type FilterWahl = "alles" | "ergebnisse" | "an_mich";

function filterArtVon(e: GespraechsEintrag): FilterArt {
  switch (e.art) {
    case "beitrag":
    case "gruppe":
      return e.filter;
    case "grenze":
    case "band":
      return "frage";
    case "trenner":
      return "ergebnis";
  }
}

/** Filtert die Einträge: „Nur Ergebnisse“ blendet Einzelheiten aus, „Nur an mich“ zeigt nur Fragen und Wahlen. */
export function filtereGespraech(
  eintraege: readonly GespraechsEintrag[],
  wahl: FilterWahl,
): GespraechsEintrag[] {
  if (wahl === "alles") return [...eintraege];
  return eintraege.filter((e) => {
    const art = filterArtVon(e);
    return wahl === "ergebnisse" ? art !== "detail" : art === "frage";
  });
}

/** Wie viele Einträge sind „an mich“ (für die Zahl am Umschalter)? */
export function zaehleAnMich(eintraege: readonly GespraechsEintrag[]): number {
  return eintraege.filter((e) => filterArtVon(e) === "frage" && e.art !== "trenner").length;
}

/** Wie viele Beiträge stehen im Faden, und wie viele davon sind eingeklappt? */
export function zaehleBeitraege(eintraege: readonly GespraechsEintrag[]): {
  gesamt: number;
  eingeklappt: number;
} {
  let gesamt = 0;
  let eingeklappt = 0;
  for (const e of eintraege) {
    if (e.art === "beitrag") gesamt += 1;
    else if (e.art === "gruppe") {
      const n = Number.parseInt(e.kopf, 10);
      const zahl = Number.isFinite(n) ? n : e.inhalt.length;
      gesamt += zahl;
      eingeklappt += zahl;
    }
  }
  return { gesamt, eingeklappt };
}

/** Teilt eine Liste in die ersten `max` und den Rest („+N“). */
export function stapelRest<T>(liste: readonly T[], max: number): { sichtbar: T[]; rest: number } {
  const n = Math.max(0, max);
  return { sichtbar: liste.slice(0, n), rest: Math.max(0, liste.length - n) };
}

export interface TeamGruppen {
  fuehrt: FadenBot[];
  dran: FadenBot[];
  wartetAufDich: FadenBot[];
  naechste: FadenBot[];
  ruhig: FadenBot[];
}

/**
 * Sortiert die Beteiligten für den Reiter „Team“. „Führt“ und „dran“ sind nur Anzeige und
 * kommen aus den übergebenen Kennungen (aus Ereignissen), nie aus einem Text. Wer eine offene
 * Frage hat, steht unter „Wartet auf dich“.
 */
export function teamGruppen(
  bots: readonly FadenBot[],
  a: {
    fuehrt: string;
    dran: readonly string[];
    naechste: readonly string[];
    fragen: readonly Frage[];
  },
): TeamGruppen {
  const fragend = new Set(a.fragen.map((f) => f.botId));
  const g: TeamGruppen = { fuehrt: [], dran: [], wartetAufDich: [], naechste: [], ruhig: [] };
  for (const b of bots) {
    if (b.id === a.fuehrt) g.fuehrt.push(b);
    else if (fragend.has(b.id)) g.wartetAufDich.push(b);
    else if (a.dran.includes(b.id)) g.dran.push(b);
    else if (a.naechste.includes(b.id)) g.naechste.push(b);
    else g.ruhig.push(b);
  }
  return g;
}

/** Höchstens so viele Mitglieder stehen in der Seitenleiste ohne „+N ruhig“. */
export const MITGLIEDER_OHNE_AUSBLENDEN = 6;

/**
 * Welche Mitglieder zeigt die Seitenleiste? Bis zu sechs alle. Bei mehr bleiben die, die etwas
 * tun oder wollen („aktiv“), die übrigen werden zu „+N ruhig“. Die Leitung steht immer oben
 * und zählt hier nicht mit.
 */
export function sichtbareMitglieder<T extends { zustand: string }>(
  mitglieder: readonly T[],
): { sichtbar: T[]; ruhig: T[] } {
  if (mitglieder.length <= MITGLIEDER_OHNE_AUSBLENDEN)
    return { sichtbar: [...mitglieder], ruhig: [] };
  return {
    sichtbar: mitglieder.filter((m) => m.zustand !== "ruhig"),
    ruhig: mitglieder.filter((m) => m.zustand === "ruhig"),
  };
}

/** Stand der Bahn: Plätze mit der Marke „dran“ aus den Kennungen, die der Server nennt. */
export function markiereDran(plaetze: readonly StabPlatz[], dran: readonly string[]): StabPlatz[] {
  return plaetze.map((p) => ({ ...p, dran: dran.includes(p.id) }));
}

/** Nächster Reiter bei Pfeiltasten (Anfang und Ende springen herum). */
export function naechsterReiter(anzahl: number, aktuell: number, taste: string): number | null {
  if (anzahl <= 0) return null;
  if (taste === "ArrowRight") return (aktuell + 1) % anzahl;
  if (taste === "ArrowLeft") return (aktuell - 1 + anzahl) % anzahl;
  if (taste === "Home") return 0;
  if (taste === "End") return anzahl - 1;
  return null;
}

/** Ist noch ein Zuschlag möglich? (Der Server entscheidet; die Anzeige sperrt nur den Knopf.) */
export function zuschlagMoeglich(z: { benutzt: number; max: number }): boolean {
  return z.benutzt < z.max;
}

/** Budget als Prozent 0 bis 100 für die Anzeige. */
export function budgetProzent(p: number): number {
  if (!Number.isFinite(p)) return 0;
  return Math.min(100, Math.max(0, Math.round(p)));
}
