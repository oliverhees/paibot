/**
 * PaiBot – Suche im Doku-Index: deterministisch, im Speicher, ohne Netz und ohne Datei. Wörter
 * normalisieren, Begriffe mit gleichen Wörtern bilden, Abschnitte finden, die jeden Begriff
 * enthalten, nach Punkten ordnen und Ausschnitte mit festen Obergrenzen liefern.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { cleanText } from "../../run/bereinigen";
import { GLEICHE_WOERTER, STOPPWOERTER } from "./gleiche-woerter";

/** Höchstens so viele Suchanfragen je Aufruf (Frage und bis zu zwei andere Begriffe). */
export const MAX_ANFRAGEN = 3;
/** Je Suchanfrage zählen höchstens so viele Wörter (nach dem Normalisieren). */
export const MAX_WOERTER_JE_ANFRAGE = 12;
/** Höchstens so viele Abschnitte im Ergebnis. */
export const MAX_ABSCHNITTE = 4;
/** Höchstens so viele Zeichen Text je Abschnitt (mit den Zeichen „…“ an gekürzten Rändern). */
export const MAX_TEXT_JE_ABSCHNITT = 1500;
/** Höchstens so viele Zeichen Titel und Text aller Abschnitte zusammen. */
export const MAX_ZEICHEN_GESAMT = 6000;
/** Punkte, wenn ein Begriff im Titel des Abschnitts oder der Seite steht. */
export const PUNKTE_TITEL = 3;
/** Punkte, wenn ein Begriff nur im Text steht. */
export const PUNKTE_TEXT = 1;
/** Mindestpunkte eines Treffers (neben der Bedingung „jeder Begriff kommt vor“). */
export const SCHWELLE = 1;
/** Ab dieser Länge trifft ein Begriff auch Wörter, die mit ihm beginnen oder enden. */
export const WORTTEIL_AB = 5;

/** Endungen, die ab 5 Zeichen abgeschnitten werden (längste zuerst, höchstens eine). */
const ENDUNGEN = ["ungen", "ung", "en", "er", "es", "e", "n", "s"] as const;
/** Alles außer Buchstaben und Ziffern trennt Wörter (fester Ausdruck, nie aus der Eingabe). */
const TRENNER = /[^\p{L}\p{N}]+/u;
/** Ein Wort im Originaltext (fester Ausdruck, nie aus der Eingabe). */
const WORT = /[\p{L}\p{N}]+/gu;

/** Ein Abschnitt, wie er im Index steht. */
export interface DokuAbschnitt {
  readonly id: string;
  readonly seite: string;
  readonly anker: string;
  readonly titel: string;
  /** Überschriften von der Seite abwärts bis zur eigenen. */
  readonly pfad: readonly string[];
  readonly text: string;
}

/** Ein Abschnitt im Ergebnis; `text` ist höchstens `MAX_TEXT_JE_ABSCHNITT` Zeichen lang. */
export interface DokuTreffer {
  id: string;
  seite: string;
  anker: string;
  titel: string;
  text: string;
}

interface Fundstellen {
  /** Abschnitte (Stelle im Index), in deren Titel oder Überschriften-Pfad das Wort steht, aufsteigend. */
  titel: number[];
  /** Abschnitte, in deren Text das Wort steht, aufsteigend. */
  text: number[];
}

/** Ein geladener, vorbereiteter Index; nach dem Aufbau eingefroren. */
export interface GeladenerDokuIndex {
  readonly version: string;
  readonly pruefsumme: string;
  /** Doku-Stand in Kurzform: `<version>+<erste 12 Hex der Prüfsumme>`. */
  readonly stand: string;
  readonly abschnitte: readonly DokuAbschnitt[];
  /** Wort → Fundstellen; nur die Suche liest das. */
  readonly woerter: ReadonlyMap<string, Fundstellen>;
  /** Alle Wörter sortiert (für „beginnt mit“). */
  readonly vorne: readonly string[];
  /** Alle Wörter rückwärts geschrieben, sortiert (für „endet mit“). */
  readonly hinten: readonly string[];
}

/** Doku-Stand in Kurzform aus Version und Prüfsumme (`sha256:<64 Hex>`). */
export function kurzStand(version: string, pruefsumme: string): string {
  return `${version}+${pruefsumme.slice("sha256:".length, "sha256:".length + 12)}`;
}

/**
 * Form eines vollständigen Doku-Stands: Version, „+“, 12 Hex-Zeichen der Prüfsumme (wie
 * `kurzStand`). Ein beim Kürzen der Hülle beschnittener Stand passt nicht mehr.
 */
export const STAND_MUSTER = /^\d{1,6}\.\d{1,6}\.\d{1,6}(?:-[0-9A-Za-z.-]{1,40})?\+[0-9a-f]{12}$/;

/** Klein, Umlaute und ß ausgeschrieben; ohne Bereinigen (das macht `woerter`). */
function klein(text: string): string {
  return text
    .toLocaleLowerCase("de")
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss");
}

/** Schneidet ab 5 Zeichen höchstens eine einfache Endung ab. */
export function ohneEndung(wort: string): string {
  if (wort.length < WORTTEIL_AB) return wort;
  for (const endung of ENDUNGEN) {
    if (wort.endsWith(endung)) return wort.slice(0, wort.length - endung.length);
  }
  return wort;
}

/**
 * Normalisieren für Eingabe und Index gleich: bereinigen (NFC, ohne unsichtbare Zeichen), klein,
 * ae/oe/ue/ss, alles außer Buchstaben und Ziffern trennt; Wörter unter 2 Zeichen und Stoppwörter
 * fallen weg; ab 5 Zeichen eine einfache Endung ab.
 */
export function woerter(text: string): string[] {
  const out: string[] = [];
  for (const roh of klein(cleanText(text)).split(TRENNER)) {
    if (roh.length < 2 || STOPPWOERTER.has(roh)) continue;
    const wort = ohneEndung(roh);
    if (wort.length < 2 || STOPPWOERTER.has(wort)) continue;
    out.push(wort);
  }
  return out;
}

/** Gruppe gleicher Wörter je Wort. */
const GRUPPE: ReadonlyMap<string, readonly string[]> = new Map(
  GLEICHE_WOERTER.flatMap((gruppe) => gruppe.map((wort) => [wort, gruppe] as const)),
);

/** Ein Begriff der Anfrage: das Wort und seine gleichen Wörter. */
type Begriff = readonly string[];

function begriffe(anfrage: string): Begriff[] {
  const gesehen = new Set<string>();
  const out: Begriff[] = [];
  for (const wort of woerter(anfrage).slice(0, MAX_WOERTER_JE_ANFRAGE)) {
    const gruppe = GRUPPE.get(wort) ?? [wort];
    const schluessel = gruppe[0] ?? wort;
    if (gesehen.has(schluessel)) continue;
    gesehen.add(schluessel);
    out.push(gruppe);
  }
  return out;
}

/** Trifft `wort` (aus dem Index) die Form `form` eines Begriffs? */
function trifft(wort: string, form: string): boolean {
  if (wort === form) return true;
  return form.length >= WORTTEIL_AB && (wort.startsWith(form) || wort.endsWith(form));
}

/** Erste Stelle in `liste` (sortiert), deren Wert nicht kleiner als `wert` ist. */
function untereGrenze(liste: readonly string[], wert: string): number {
  let lo = 0;
  let hi = liste.length;
  while (lo < hi) {
    const mitte = (lo + hi) >>> 1;
    if ((liste[mitte] as string) < wert) lo = mitte + 1;
    else hi = mitte;
  }
  return lo;
}

const rueckwaerts = (wort: string) => Array.from(wort).reverse().join("");

/** Alle Wörter des Index, die eine Form treffen (gleich, beginnt mit, endet mit). */
function passendeWoerter(index: GeladenerDokuIndex, form: string): string[] {
  const out = new Set<string>();
  if (index.woerter.has(form)) out.add(form);
  if (form.length >= WORTTEIL_AB) {
    for (let i = untereGrenze(index.vorne, form); i < index.vorne.length; i++) {
      const wort = index.vorne[i] as string;
      if (!wort.startsWith(form)) break;
      out.add(wort);
    }
    const rueck = rueckwaerts(form);
    for (let i = untereGrenze(index.hinten, rueck); i < index.hinten.length; i++) {
      const wort = index.hinten[i] as string;
      if (!wort.startsWith(rueck)) break;
      out.add(rueckwaerts(wort));
    }
  }
  return [...out].sort();
}

/** Abschnitte, in denen der Begriff vorkommt: Stelle → steht er im Titel? */
function fundeDesBegriffs(index: GeladenerDokuIndex, begriff: Begriff): Map<number, boolean> {
  const funde = new Map<number, boolean>();
  for (const form of begriff) {
    for (const wort of passendeWoerter(index, form)) {
      const stellen = index.woerter.get(wort);
      if (stellen === undefined) continue;
      for (const i of stellen.titel) funde.set(i, true);
      for (const i of stellen.text) if (!funde.has(i)) funde.set(i, false);
    }
  }
  return funde;
}

interface Wertung {
  punkte: number;
  titelTreffer: number;
  /** Begriffe der besten Anfrage (für den Ausschnitt). */
  begriffe: Begriff[];
}

const besser = (a: Wertung, b: Wertung) =>
  a.punkte !== b.punkte ? a.punkte > b.punkte : a.titelTreffer > b.titelTreffer;

/** Wertung je Abschnitt für eine Anfrage: nur Abschnitte, die jeden Begriff enthalten. */
function werteAnfrage(index: GeladenerDokuIndex, anfrage: string): Map<number, Wertung> {
  const liste = begriffe(anfrage);
  const out = new Map<number, Wertung>();
  if (liste.length === 0) return out;
  const funde = liste.map((begriff) => fundeDesBegriffs(index, begriff));
  const [erste, ...rest] = funde;
  if (erste === undefined) return out;
  for (const [stelle] of erste) {
    if (!rest.every((f) => f.has(stelle))) continue;
    let punkte = 0;
    let titelTreffer = 0;
    for (const f of funde) {
      if (f.get(stelle) === true) {
        punkte += PUNKTE_TITEL;
        titelTreffer += 1;
      } else {
        punkte += PUNKTE_TEXT;
      }
    }
    if (punkte >= SCHWELLE) out.set(stelle, { punkte, titelTreffer, begriffe: liste });
  }
  return out;
}

/** Stelle des ersten Worts im Text, das einen der Begriffe trifft; sonst -1. */
function ersterTreffer(text: string, liste: readonly Begriff[]): number {
  for (const match of text.matchAll(WORT)) {
    const wort = ohneEndung(klein(match[0]));
    if (liste.some((begriff) => begriff.some((form) => trifft(wort, form)))) {
      return match.index ?? -1;
    }
  }
  return -1;
}

/** Ist `i` die zweite Hälfte eines Ersatzpaars (darf nicht der erste Rand sein)? */
const istZweiteHaelfte = (text: string, i: number) => {
  const c = text.charCodeAt(i);
  return c >= 0xdc00 && c <= 0xdfff;
};

/**
 * Ausschnitt eines Texts mit höchstens `MAX_TEXT_JE_ABSCHNITT` Zeichen. Ein längerer Text beginnt
 * am Satz- bzw. Zeilenanfang vor dem ersten Treffer-Wort (liegt der mehr als 300 Zeichen davor,
 * am Treffer-Wort selbst); gekürzte Ränder tragen „…“.
 */
export function ausschnitt(text: string, liste: readonly Begriff[]): string {
  if (text.length <= MAX_TEXT_JE_ABSCHNITT) return text;
  const treffer = Math.max(0, ersterTreffer(text, liste));
  let start = 0;
  if (treffer > 0) {
    let satz = treffer;
    while (satz > 0) {
      const vorher = text[satz - 1];
      if (vorher === "\n") break;
      if (satz >= 2 && /[.!?]/.test(text[satz - 2] ?? "") && /\s/.test(vorher ?? "")) break;
      satz -= 1;
    }
    start = treffer - satz > 300 ? treffer : satz;
  }
  if (istZweiteHaelfte(text, start)) start += 1;
  const vorne = start > 0 ? "…" : "";
  const platz = MAX_TEXT_JE_ABSCHNITT - vorne.length;
  if (text.length - start <= platz) return `${vorne}${text.slice(start)}`;
  let ende = start + platz - 1;
  if (istZweiteHaelfte(text, ende)) ende -= 1;
  return `${vorne}${text.slice(start, ende)}…`;
}

/**
 * Sucht mit bis zu `MAX_ANFRAGEN` Anfragen. Treffer: Abschnitt enthält jeden Begriff einer
 * Anfrage (Titel und Überschriften-Pfad zählen als Titel) und hat mindestens `SCHWELLE`
 * Punkte; je Abschnitt zählt die beste Anfrage. Ordnung: Punkte, dann Begriffe im Titel (je
 * absteigend), dann kürzerer Text, dann Reihenfolge im Index. Höchstens `MAX_ABSCHNITTE`
 * Abschnitte; Titel und Ausschnitte zusammen höchstens `MAX_ZEICHEN_GESAMT` Zeichen und als JSON
 * höchstens `maxJsonZeichen` – was nicht passt, fällt als ganzer Abschnitt von hinten weg.
 */
export function sucheImIndex(
  index: GeladenerDokuIndex,
  anfragen: readonly string[],
  maxJsonZeichen: number = Number.POSITIVE_INFINITY,
  huelle: (abschnitte: DokuTreffer[]) => unknown = (abschnitte) => abschnitte,
): DokuTreffer[] {
  const beste = new Map<number, Wertung>();
  for (const anfrage of anfragen.slice(0, MAX_ANFRAGEN)) {
    for (const [stelle, wertung] of werteAnfrage(index, anfrage)) {
      const bisher = beste.get(stelle);
      if (bisher === undefined || besser(wertung, bisher)) beste.set(stelle, wertung);
    }
  }
  const geordnet = [...beste.entries()].sort(([ia, a], [ib, b]) => {
    if (a.punkte !== b.punkte) return b.punkte - a.punkte;
    if (a.titelTreffer !== b.titelTreffer) return b.titelTreffer - a.titelTreffer;
    const la = (index.abschnitte[ia] as DokuAbschnitt).text.length;
    const lb = (index.abschnitte[ib] as DokuAbschnitt).text.length;
    if (la !== lb) return la - lb;
    return ia - ib;
  });
  const out: DokuTreffer[] = geordnet.slice(0, MAX_ABSCHNITTE).map(([stelle, wertung]) => {
    const a = index.abschnitte[stelle] as DokuAbschnitt;
    return {
      id: a.id,
      seite: a.seite,
      anker: a.anker,
      titel: a.titel,
      text: ausschnitt(a.text, wertung.begriffe),
    };
  });
  const zeichen = (liste: DokuTreffer[]) =>
    liste.reduce((summe, t) => summe + t.titel.length + t.text.length, 0);
  while (
    out.length > 0 &&
    (zeichen(out) > MAX_ZEICHEN_GESAMT || JSON.stringify(huelle(out)).length > maxJsonZeichen)
  ) {
    out.pop();
  }
  return out;
}

function tiefEingefroren<T>(wert: T): T {
  if (wert !== null && typeof wert === "object" && !Object.isFrozen(wert)) {
    for (const teil of Object.values(wert)) tiefEingefroren(teil);
    Object.freeze(wert);
  }
  return wert;
}

/**
 * Bereitet einen Index für die Suche vor: Abschnitte kopiert und eingefroren, Wörter von Titel
 * (mit dem Pfad der Überschriften darüber) und Text je Abschnitt einmal normalisiert. Prüft nichts; geprüft wird beim
 * Laden (`ladeDokuIndex`). Ohne Prüfung nutzen das nur Tests.
 */
export function bereiteIndexVor(
  stand: { version: string; pruefsumme: string },
  abschnitte: readonly DokuAbschnitt[],
): GeladenerDokuIndex {
  const kopie = abschnitte.map((a) => ({
    id: a.id,
    seite: a.seite,
    anker: a.anker,
    titel: a.titel,
    pfad: [...a.pfad],
    text: a.text,
  }));
  const woerterMap = new Map<string, Fundstellen>();
  const eintragen = (wort: string, stelle: number, art: "titel" | "text") => {
    let f = woerterMap.get(wort);
    if (f === undefined) {
      f = { titel: [], text: [] };
      woerterMap.set(wort, f);
    }
    const liste = f[art];
    if (liste[liste.length - 1] !== stelle) liste.push(stelle);
  };
  for (const [stelle, a] of kopie.entries()) {
    const titelWoerter = new Set([...woerter(a.titel), ...a.pfad.flatMap((t) => woerter(t))]);
    for (const wort of [...titelWoerter].sort()) eintragen(wort, stelle, "titel");
    for (const wort of new Set(woerter(a.text))) eintragen(wort, stelle, "text");
  }
  const vorne = [...woerterMap.keys()].sort();
  const hinten = vorne.map(rueckwaerts).sort();
  for (const f of woerterMap.values()) tiefEingefroren(f);
  return Object.freeze({
    version: stand.version,
    pruefsumme: stand.pruefsumme,
    stand: kurzStand(stand.version, stand.pruefsumme),
    abschnitte: tiefEingefroren(kopie),
    woerter: woerterMap,
    vorne: Object.freeze(vorne),
    hinten: Object.freeze(hinten),
  });
}
