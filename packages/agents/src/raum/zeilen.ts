/**
 * PaiBot – Feste Zeilen in der Antwort eines Bots erkennen
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

/**
 * Im Text einer fertigen Bot-Antwort wirken nur feste Zeilen:
 *
 * - `@Name: …` (Übergabe der Leitung, Bitte eines Mitglieds, bei Pai `@Team Name: …`)
 * - `Zurück an @Name: …`
 * - `Fertig: …`
 * - `Frage an dich: …` (optional mit `Möglichkeiten: a | b | c` direkt darunter)
 *
 * Reine Funktion: keine Datenbank, keine Uhr, kein Modell. Sie liefert nur Wünsche und Fakten
 * (Weg, Länge des Zettels, Breite) und entscheidet nichts; ob ein Wunsch gilt, entscheidet allein
 * das Tor. Sie wirft nie.
 *
 * Maßstab ist, was die Person in der Anzeige sieht. Darum gilt:
 * - Eine Zeile beginnt in Spalte 0 mit ASCII `@` bzw. dem festen Wort und hat einen ASCII-`:`.
 *   Es wird nichts normalisiert (NFKC nur für den Namen, über `vergleichsName`): `＠` und `：`
 *   sind keine Zeilen.
 * - Code (Zaun, eingerückt), Zitate, Listen und deren Fortsetzungszeilen zählen nicht.
 * - Enthält die Antwort HTML (außerhalb von Code), Bidi-Steuerzeichen, einen anderen Zeilentrenner
 *   als `\n` oder unsichtbare Zeichen im Namen einer Zeile, gibt es aus ihr keine Wünsche.
 * - Nur Antworten, die normal zu Ende gingen, und nur an den erlaubten Orten (Faden, Pais Chat).
 */

import { aehnlichkeitsForm, type RaumBot, vergleichsName } from "./namen";

/** Längster Zettel in Zeichen (Unicode-Zeichen nach dem Bereinigen); länger wird nie gekürzt. */
export const MAX_ZETTEL_ZEICHEN = 2_000;
/** Höchstzahl der Möglichkeiten unter einer Frage. */
export const MAX_MOEGLICHKEITEN = 3;
/** Längste Möglichkeit in Zeichen. */
export const MAX_MOEGLICHKEIT_ZEICHEN = 120;
/** Längste Antwort, die gelesen wird; eine längere wird nie teilweise gelesen. */
export const MAX_ANTWORT_ZEICHEN = 200_000;
/** Längster Namensteil einer `@`-Zeile; ein längerer ist kein Name. */
const MAX_NAME_ZEICHEN = 120;
const ANFANG_ZEICHEN = 200;

export type GeberRolle = "stabschef" | "leitung" | "mitglied";

/** Wer die Antwort geschrieben hat. */
export interface ZeilenGeber {
  readonly botId: string;
  readonly rolle: GeberRolle;
}

/** Die Leitung eines Teams, wie Pai sie über `@Team Name:` erreicht. */
export interface TeamLeitung {
  readonly teamName: string;
  readonly leitung: RaumBot;
}

export interface ZeilenEingabe {
  /** Der gespeicherte End-Text der Antwort (nach dem Rücktausch der Datenschleuse). */
  readonly text: string;
  readonly geber: ZeilenGeber;
  /** Bots des Teams des Gebers (bei Pai: leer oder alle Bots, die er nicht erreichen darf). */
  readonly mitglieder: readonly RaumBot[];
  /** Kennung der Leitung des Teams (`null` = keine gesetzt). */
  readonly leitungId: string | null;
  /** Nur für Pai: die Leitungen der Teams, die er erreichen darf. */
  readonly teams?: readonly TeamLeitung[];
  /** Wie der Lauf endete; nur `succeeded` mit `stop` gilt als normal zu Ende. */
  readonly abschluss: { readonly laufStatus: string; readonly grund: string };
  /** Art des Auftrags, zu dem der Lauf gehört (`keiner` = Lauf direkt auf eine Nachricht der Person). */
  readonly auftragArt: string;
  /** `faden` oder `direkt`. */
  readonly conversationKind: string;
  /** Erlaubt mehrere `@`-Zeilen der Leitung (Fächer); sonst gilt: zwei Zeilen, keine Übergabe. */
  readonly faecher?: boolean;
  /** Bots, die in dieser Wurzel schon einen Auftrag haben (für den Fakt zu `Zurück an`). */
  readonly botIdsMitAuftrag?: readonly string[];
  /** Obergrenze der Antwortlänge; Standard `MAX_ANTWORT_ZEICHEN`. */
  readonly maxAntwortZeichen?: number;
}

export type ZeilenArt = "uebergabe" | "bitte" | "team" | "rueckgabe" | "fertig" | "frage";

export type ZielRolle = "leitung" | "mitglied" | "stabschef" | "selbst" | "team_fremd";

/**
 * Code des Weges einer Übergabe. Die ersten vier sind die erlaubten Wege, alle anderen sind
 * verboten und haben je einen eigenen Code. Die Funktion entscheidet nichts: sie benennt nur.
 */
export type WegCode =
  | "pai_an_leitung"
  | "leitung_an_mitglied"
  | "leitung_gibt_zurueck"
  | "mitglied_bittet_kollegen"
  | "verboten_an_sich_selbst"
  | "verboten_team_von_nicht_pai"
  | "verboten_pai_nicht_auf_nachricht"
  | "verboten_pai_nicht_im_direkt_chat"
  | "verboten_pai_an_mitglied"
  | "verboten_leitung_nicht_im_faden"
  | "verboten_leitung_auftragsart"
  | "verboten_zulieferer"
  | "verboten_bitte_an_leitung"
  | "verboten_bitte_auftragsart"
  | "verboten_rueckgabe_von_nicht_leitung";

export interface WegFakt {
  readonly code: WegCode;
  /** Der Weg steht in der Tabelle der erlaubten Wege. Ob er gilt, entscheidet das Tor. */
  readonly inTabelle: boolean;
  readonly geberRolle: GeberRolle;
  readonly zielRolle: ZielRolle;
  readonly art: "team" | "uebergabe" | "bitte" | "rueckgabe";
  readonly auftragArt: string;
  readonly conversationKind: string;
  /** Geber und Ziel gehören zum selben Team. */
  readonly sameTeam: boolean;
  /** Das Ziel hat in dieser Wurzel schon einen Auftrag; `null`, wenn die Eingabe es nicht sagt. */
  readonly zielHatAuftrag: boolean | null;
}

export interface WunschZiel {
  readonly botId: string;
  readonly name: string;
  readonly pausiert: boolean;
  /** Bei `@Team …:` der Teamname, wie ihn Pai geschrieben hat (gekürzt). */
  readonly teamName?: string;
}

export interface Wunsch {
  readonly art: ZeilenArt;
  /** Zeilennummer in der Antwort, ab 1. */
  readonly zeile: number;
  /** `null` bei `Fertig:` und `Frage an dich:` und bei `@Team …:` von einem Nicht-Pai. */
  readonly ziel: WunschZiel | null;
  /** Der erkannte Auftragszettel: Rest der Zeile bis zur nächsten festen Zeile oder Leerzeile, bereinigt. */
  readonly zettel: string;
  /** Länge des Zettels in Zeichen. */
  readonly zettelLaenge: number;
  /** Teil nach `Fertig, wenn:` im Zettel, sonst `null`. */
  readonly fertigWenn: string | null;
  /** Nur bei `frage`: die sauberen Möglichkeiten (leer, wenn sie nicht erlaubt sind). */
  readonly moeglichkeiten: readonly string[];
  /** Nur bei `frage` mit `Möglichkeiten:` darunter: warum keine Möglichkeit gilt. */
  readonly moeglichkeitenGrund: MoeglichkeitenGrund | null;
  /** Nur bei Übergabe, Bitte, Team, Rückgabe. */
  readonly weg: WegFakt | null;
}

export type MoeglichkeitenGrund = "zu_viele" | "zu_lang" | "link" | "leer";

export type VerworfenGrund = "zettel_zu_lang" | "moeglichkeiten_ohne_frage";

/** Eine Zeile, die erkannt, aber kein Wunsch ist. */
export interface VerworfeneZeile {
  readonly grund: VerworfenGrund;
  readonly zeile: number;
  readonly art: ZeilenArt | "moeglichkeiten";
  /** Länge des (nicht gekürzten) Zettels in Zeichen. */
  readonly zettelLaenge: number;
  /** Anfang des Zettels (höchstens 200 Zeichen) zum Anzeigen; der Rest wird nicht aufgehoben. */
  readonly zettelAnfang: string;
}

export type ZeilenHinweisGrund = "unbekannt" | "aehnlicher_name" | "mehrdeutig";

/** Eine `@`-Zeile, deren Name niemanden trifft. Sie ist kein Wunsch. */
export interface ZeilenHinweis {
  readonly grund: ZeilenHinweisGrund;
  readonly zeile: number;
  /** Der Name, wie er stand (gekürzt auf 60 Zeichen). */
  readonly geschrieben: string;
}

/** Warum aus der ganzen Antwort keine Wünsche entstehen. */
export type ZeilenGrund =
  | "nicht_normal_beendet"
  | "kein_ort"
  | "leer"
  | "antwort_zu_lang"
  | "zeilentrenner"
  | "bidi"
  | "html"
  | "unsichtbar_im_namen"
  | "widerspruch"
  | "mehrfach"
  | "zwei_zeilen_mitglied"
  | "zwei_zeilen_leitung";

export interface ZeilenErgebnis {
  readonly wuensche: readonly Wunsch[];
  readonly verworfen: readonly VerworfeneZeile[];
  readonly hinweise: readonly ZeilenHinweis[];
  /** `null`: die Antwort wurde gelesen (auch wenn sie keine Zeile enthält). */
  readonly grund: ZeilenGrund | null;
  /** Die feste Zeile „Unklare Anweisung, nichts übergeben“ gehört unter die Antwort. */
  readonly unklar: boolean;
  /** Zahl der Wünsche, die den Stab weitergeben wollen (Breite, Fächer); ohne Fertig und Frage. */
  readonly breite: number;
  /** Länge der Antwort in Zeichen. */
  readonly antwortLaenge: number;
}

const BIDI = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/u;
// biome-ignore lint/suspicious/noControlCharactersInRegex: gesucht werden genau diese Zeichen
const ANDERE_ZEILENTRENNER = /[\r\u0085\u000B\u000C\u2028\u2029]/u;
const UNSICHTBAR = /[\p{Cf}\p{Cc}]/u;
const UNSICHTBAR_ALLE = /[\p{Cf}\p{Cc}]/gu;
const HTML_ANFANG = /<[A-Za-z/!?]/u;

function leer(grund: ZeilenGrund | null, antwortLaenge: number, unklar = false): ZeilenErgebnis {
  return { wuensche: [], verworfen: [], hinweise: [], grund, unklar, breite: 0, antwortLaenge };
}

type Zeilentyp = "leer" | "code" | "text" | "fortsetzung";

/**
 * Teilt die Zeilen so ein, wie die Anzeige sie darstellt: Zaun und eingerückter Code sind `code`,
 * Zitate und Listen samt ihren Fortsetzungszeilen sind `fortsetzung`, alles andere ist `text`.
 */
function klassifiziere(zeilen: readonly string[]): Zeilentyp[] {
  const typen: Zeilentyp[] = [];
  let zaun: { zeichen: string; laenge: number } | null = null;
  let vorherText = false;
  let inZitatOderListe = false;
  for (const zeile of zeilen) {
    if (zaun) {
      typen.push("code");
      const zu = /^ {0,3}(`{3,}|~{3,})[ \t]*$/u.exec(zeile)?.[1];
      if (zu && zu[0] === zaun.zeichen && zu.length >= zaun.laenge) zaun = null;
      continue;
    }
    if (zeile.trim() === "") {
      typen.push("leer");
      vorherText = false;
      inZitatOderListe = false;
      continue;
    }
    const auf = /^ {0,3}(`{3,}|~{3,})/u.exec(zeile)?.[1];
    if (auf) {
      zaun = { zeichen: auf[0] as string, laenge: auf.length };
      typen.push("code");
      vorherText = false;
      inZitatOderListe = false;
      continue;
    }
    if (/^(?: {4,}|\t)/u.test(zeile)) {
      // Eingerückt nach einem Absatz ist es Fortsetzung des Absatzes, sonst Code.
      if (inZitatOderListe) typen.push("fortsetzung");
      else if (vorherText) typen.push("text");
      else typen.push("code");
      continue;
    }
    if (/^ {0,3}>/u.test(zeile) || /^ {0,3}(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)/u.test(zeile)) {
      inZitatOderListe = true;
      vorherText = true;
      typen.push("fortsetzung");
      continue;
    }
    typen.push(inZitatOderListe ? "fortsetzung" : "text");
    vorherText = true;
  }
  return typen;
}

/** Code in Backticks aus einer Zeile nehmen (gleich lange Folgen öffnen und schließen). */
function ohneCodeStuecke(zeile: string): string {
  return zeile.replace(/(`+)(?!`)[\s\S]*?(?<!`)\1(?!`)/gu, " ");
}

function enthaeltHtml(zeilen: readonly string[], typen: readonly Zeilentyp[]): boolean {
  for (let i = 0; i < zeilen.length; i++) {
    const typ = typen[i];
    if (typ === "code" || typ === "leer") continue;
    if (HTML_ANFANG.test(ohneCodeStuecke(zeilen[i] as string))) return true;
  }
  return false;
}

/** Form einer festen Zeile; `null`, wenn die Zeile keine ist. */
interface Form {
  readonly art: "name" | "rueckgabe" | "fertig" | "frage" | "moeglichkeiten";
  /** Namensteil bei `name` und `rueckgabe`. */
  readonly name: string;
  readonly rest: string;
}

function parseForm(zeile: string): Form | null {
  if (zeile.startsWith("Zurück an @")) {
    const m = /^Zurück an @([^:]*):(.*)$/u.exec(zeile);
    if (m && gueltigerNamensteil(m[1] as string))
      return { art: "rueckgabe", name: m[1] as string, rest: m[2] as string };
    return null;
  }
  if (zeile.startsWith("@")) {
    const m = /^@([^:]*):(.*)$/u.exec(zeile);
    if (m && gueltigerNamensteil(m[1] as string))
      return { art: "name", name: m[1] as string, rest: m[2] as string };
    return null;
  }
  if (zeile.startsWith("Fertig:")) return { art: "fertig", name: "", rest: zeile.slice(7) };
  if (zeile.startsWith("Frage an dich:"))
    return { art: "frage", name: "", rest: zeile.slice("Frage an dich:".length) };
  if (zeile.startsWith("Möglichkeiten:"))
    return { art: "moeglichkeiten", name: "", rest: zeile.slice("Möglichkeiten:".length) };
  return null;
}

function gueltigerNamensteil(name: string): boolean {
  return name.length > 0 && name.length <= MAX_NAME_ZEICHEN && !/^\s/u.test(name);
}

/** Zettel bereinigen: Steuer- und unsichtbare Formatzeichen (auch Bidi) raus, Tabulator wird Leerzeichen. */
function bereinige(text: string): string {
  return text
    .replace(/\t/gu, " ")
    .replace(UNSICHTBAR_ALLE, (z) => (z === "\n" ? "\n" : ""))
    .replace(/ {2,}/gu, " ")
    .trim();
}

function zaehleZeichen(text: string): number {
  let n = 0;
  for (const _ of text) n += 1;
  return n;
}

function anfang(text: string): string {
  return Array.from(text).slice(0, ANFANG_ZEICHEN).join("");
}

function kuerzeName(name: string): string {
  return Array.from(name.slice(0, 200)).slice(0, 60).join("");
}

function trenneFertigWenn(zettel: string): string | null {
  const marke = "Fertig, wenn:";
  const i = zettel.indexOf(marke);
  if (i < 0) return null;
  return zettel.slice(i + marke.length).trim();
}

interface Moeglichkeiten {
  readonly liste: readonly string[];
  readonly grund: MoeglichkeitenGrund | null;
}

const LINK = /(?:[a-z][a-z0-9+.-]*:\/\/|\bwww\.|\bmailto:|\]\(|<|>)/iu;

function parseMoeglichkeiten(rest: string): Moeglichkeiten {
  const teile = bereinige(rest)
    .split("|")
    .map((t) => t.trim());
  if (teile.some((t) => t === "")) return { liste: [], grund: "leer" };
  if (teile.length > MAX_MOEGLICHKEITEN) return { liste: [], grund: "zu_viele" };
  if (teile.some((t) => zaehleZeichen(t) > MAX_MOEGLICHKEIT_ZEICHEN))
    return { liste: [], grund: "zu_lang" };
  if (teile.some((t) => LINK.test(t))) return { liste: [], grund: "link" };
  return { liste: teile, grund: null };
}

interface Kandidat {
  /** Der Name, gegen den verglichen wird (Botname, bei `@Team` der Teamname). */
  readonly name: string;
  readonly bot: RaumBot;
  readonly teamName?: string;
}

/** Findet den Treffer zu einem Namen; Mehrdeutiges und Ähnliches wird nie geraten. */
function suche(
  segment: string,
  kandidaten: readonly Kandidat[],
): { readonly treffer: Kandidat } | { readonly hinweis: ZeilenHinweisGrund } {
  const name = vergleichsName(segment);
  const gleich = kandidaten.filter((k) => vergleichsName(k.name) === name);
  if (name !== "" && gleich.length === 1) return { treffer: gleich[0] as Kandidat };
  if (gleich.length > 1) return { hinweis: "mehrdeutig" };
  const form = aehnlichkeitsForm(segment);
  const aehnlich = kandidaten.some((k) => aehnlichkeitsForm(k.name) === form);
  return { hinweis: aehnlich && form !== "" ? "aehnlicher_name" : "unbekannt" };
}

interface Roh {
  readonly form: Form;
  readonly index: number;
  zettelZeilen: string[];
  /** Nur bei Fragen: die Zeile `Möglichkeiten:` direkt darunter. */
  moeglichkeitenRest: string | null;
}

function waehleWeg(
  eingabe: ZeilenEingabe,
  art: WegFakt["art"],
  ziel: WunschZiel | null,
  zielRolle: ZielRolle,
): WegFakt {
  const { geber, auftragArt, conversationKind } = eingabe;
  const sameTeam = ziel !== null && eingabe.mitglieder.some((m) => m.id === ziel.botId);
  const faden = conversationKind === "faden";
  const leitungArt = ["wurzel", "uebergabe", "rueckkehr", "sammeln"].includes(auftragArt);
  let code: WegCode;
  if (art === "team") {
    if (geber.rolle !== "stabschef") code = "verboten_team_von_nicht_pai";
    else if (conversationKind !== "direkt") code = "verboten_pai_nicht_im_direkt_chat";
    else if (auftragArt !== "keiner") code = "verboten_pai_nicht_auf_nachricht";
    else code = "pai_an_leitung";
  } else if (zielRolle === "selbst") {
    code = "verboten_an_sich_selbst";
  } else if (geber.rolle === "stabschef") {
    code = "verboten_pai_an_mitglied";
  } else if (art === "rueckgabe") {
    if (geber.rolle !== "leitung") code = "verboten_rueckgabe_von_nicht_leitung";
    else if (!faden) code = "verboten_leitung_nicht_im_faden";
    else if (!leitungArt) code = "verboten_leitung_auftragsart";
    else code = "leitung_gibt_zurueck";
  } else if (geber.rolle === "leitung") {
    if (!faden) code = "verboten_leitung_nicht_im_faden";
    else if (!leitungArt) code = "verboten_leitung_auftragsart";
    else code = "leitung_an_mitglied";
  } else {
    // Mitglied: nur eine Bitte an einen Kollegen
    if (auftragArt === "bitte") code = "verboten_zulieferer";
    else if (zielRolle === "leitung") code = "verboten_bitte_an_leitung";
    else if (!faden || auftragArt !== "uebergabe") code = "verboten_bitte_auftragsart";
    else code = "mitglied_bittet_kollegen";
  }
  const inTabelle = !code.startsWith("verboten_");
  return {
    code,
    inTabelle,
    geberRolle: geber.rolle,
    zielRolle,
    art,
    auftragArt,
    conversationKind,
    sameTeam,
    zielHatAuftrag:
      ziel === null || eingabe.botIdsMitAuftrag === undefined
        ? null
        : eingabe.botIdsMitAuftrag.includes(ziel.botId),
  };
}

/**
 * Erkennt die festen Zeilen in der fertigen Antwort eines Bots. Siehe Kopf der Datei für die
 * Regeln. Wirft nie; jede Eingabe, die nicht passt, ergibt keine Wünsche und einen Grund.
 */
export function erkenneZeilen(eingabe: ZeilenEingabe): ZeilenErgebnis {
  const text = typeof eingabe.text === "string" ? eingabe.text : "";
  const laenge = text.length;

  if (eingabe.abschluss?.laufStatus !== "succeeded" || eingabe.abschluss?.grund !== "stop") {
    return leer("nicht_normal_beendet", laenge);
  }
  const rolle = eingabe.geber?.rolle;
  if (rolle !== "stabschef" && rolle !== "leitung" && rolle !== "mitglied") {
    return leer("kein_ort", laenge);
  }
  const kind = eingabe.conversationKind;
  const ortOk = kind === "faden" || (kind === "direkt" && rolle === "stabschef");
  if (!ortOk) return leer("kein_ort", laenge);
  if (text.trim() === "") return leer("leer", laenge);
  if (laenge > (eingabe.maxAntwortZeichen ?? MAX_ANTWORT_ZEICHEN)) {
    return leer("antwort_zu_lang", laenge);
  }
  if (ANDERE_ZEILENTRENNER.test(text)) return leer("zeilentrenner", laenge, true);
  if (BIDI.test(text)) return leer("bidi", laenge, true);

  const zeilen = text.split("\n");
  const typen = klassifiziere(zeilen);
  if (enthaeltHtml(zeilen, typen)) return leer("html", laenge, true);

  // Feste Zeilen suchen (nur in Spalte 0 von Text-Zeilen).
  const rohe: Roh[] = [];
  const moegZeilen = new Set<number>();
  let i = 0;
  while (i < zeilen.length) {
    const form = typen[i] === "text" ? parseForm(zeilen[i] as string) : null;
    if (!form) {
      i += 1;
      continue;
    }
    if ((form.art === "name" || form.art === "rueckgabe") && UNSICHTBAR.test(form.name)) {
      return leer("unsichtbar_im_namen", laenge, true);
    }
    const roh: Roh = { form, index: i, zettelZeilen: [form.rest], moeglichkeitenRest: null };
    let j = i + 1;
    while (j < zeilen.length && typen[j] === "text" && parseForm(zeilen[j] as string) === null) {
      roh.zettelZeilen.push(zeilen[j] as string);
      j += 1;
    }
    if (form.art === "frage" && j < zeilen.length && typen[j] === "text") {
      const naechste = parseForm(zeilen[j] as string);
      if (naechste?.art === "moeglichkeiten") {
        roh.moeglichkeitenRest = naechste.rest;
        moegZeilen.add(j);
        j += 1;
        // Fortsetzungszeilen der Möglichkeiten gehören zu ihr; sie zählen nicht mit.
        while (
          j < zeilen.length &&
          typen[j] === "text" &&
          parseForm(zeilen[j] as string) === null
        ) {
          roh.moeglichkeitenRest += `\n${zeilen[j] as string}`;
          j += 1;
        }
      }
    }
    rohe.push(roh);
    i = Math.max(j, i + 1);
  }
  // `Möglichkeiten:` ohne Frage direkt darüber: erkannt, aber ohne Wirkung.
  const verworfen: VerworfeneZeile[] = [];
  for (let k = 0; k < zeilen.length; k++) {
    if (typen[k] !== "text" || moegZeilen.has(k)) continue;
    const form = parseForm(zeilen[k] as string);
    if (form?.art !== "moeglichkeiten") continue;
    const z = bereinige(form.rest);
    verworfen.push({
      grund: "moeglichkeiten_ohne_frage",
      zeile: k + 1,
      art: "moeglichkeiten",
      zettelLaenge: zaehleZeichen(z),
      zettelAnfang: anfang(z),
    });
  }

  // Wünsche bauen.
  const wuensche: Wunsch[] = [];
  const hinweise: ZeilenHinweis[] = [];
  const kandidatenImTeam: Kandidat[] = eingabe.mitglieder.map((bot) => ({ name: bot.name, bot }));
  const teams = eingabe.teams ?? [];
  const teamKandidaten: Kandidat[] = teams.map((t) => ({
    name: t.teamName,
    bot: t.leitung,
    teamName: t.teamName,
  }));
  const leitungsBots: Kandidat[] = teams.map((t) => ({ name: t.leitung.name, bot: t.leitung }));
  /** Zeilen, die als Zeile gelten, aber wegen der Zettel-Länge kein Wunsch sind. */
  const zuLang: ZeilenArt[] = [];

  for (const roh of rohe) {
    const { form } = roh;
    if (form.art === "moeglichkeiten") continue;
    const zettel = bereinige(roh.zettelZeilen.join("\n"));
    const zettelLaenge = zaehleZeichen(zettel);
    const zeile = roh.index + 1;
    let art: ZeilenArt;
    let ziel: WunschZiel | null = null;
    let zielRolle: ZielRolle = "mitglied";

    if (form.art === "fertig") art = "fertig";
    else if (form.art === "frage") art = "frage";
    else {
      const segment = form.name;
      if (form.art === "name" && /^team /u.test(vergleichsName(segment))) {
        art = "team";
        zielRolle = "team_fremd";
        if (eingabe.geber.rolle === "stabschef") {
          const teamName = segment.trim().slice(5);
          const gefunden = suche(teamName, teamKandidaten);
          if ("hinweis" in gefunden) {
            hinweise.push({ grund: gefunden.hinweis, zeile, geschrieben: kuerzeName(teamName) });
            continue;
          }
          ziel = {
            botId: gefunden.treffer.bot.id,
            name: gefunden.treffer.bot.name,
            pausiert: gefunden.treffer.bot.pausiert,
            ...(gefunden.treffer.teamName !== undefined
              ? { teamName: kuerzeName(gefunden.treffer.teamName) }
              : {}),
          };
          zielRolle = "leitung";
        }
      } else {
        art = form.art === "rueckgabe" ? "rueckgabe" : "uebergabe";
        const kandidaten =
          eingabe.geber.rolle === "stabschef"
            ? [...kandidatenImTeam, ...leitungsBots]
            : kandidatenImTeam;
        const gefunden = suche(segment, kandidaten);
        if ("hinweis" in gefunden) {
          hinweise.push({ grund: gefunden.hinweis, zeile, geschrieben: kuerzeName(segment) });
          continue;
        }
        const bot = gefunden.treffer.bot;
        ziel = { botId: bot.id, name: bot.name, pausiert: bot.pausiert };
        if (bot.id === eingabe.geber.botId) zielRolle = "selbst";
        else if (eingabe.leitungId !== null && bot.id === eingabe.leitungId) zielRolle = "leitung";
        else if (leitungsBots.some((k) => k.bot.id === bot.id)) zielRolle = "leitung";
        else zielRolle = "mitglied";
        if (art === "uebergabe" && eingabe.geber.rolle === "mitglied") art = "bitte";
      }
    }

    if (zettelLaenge > MAX_ZETTEL_ZEICHEN) {
      zuLang.push(art);
      verworfen.push({
        grund: "zettel_zu_lang",
        zeile,
        art,
        zettelLaenge,
        zettelAnfang: anfang(zettel),
      });
      continue;
    }
    let moeglichkeiten: readonly string[] = [];
    let moeglichkeitenGrund: MoeglichkeitenGrund | null = null;
    if (art === "frage" && roh.moeglichkeitenRest !== null) {
      const m = parseMoeglichkeiten(roh.moeglichkeitenRest);
      moeglichkeiten = m.liste;
      moeglichkeitenGrund = m.grund;
    }
    const weg =
      art === "fertig" || art === "frage" ? null : waehleWeg(eingabe, art, ziel, zielRolle);
    wuensche.push({
      art,
      zeile,
      ziel,
      zettel,
      zettelLaenge,
      fertigWenn: trenneFertigWenn(zettel),
      moeglichkeiten,
      moeglichkeitenGrund,
      weg,
    });
  }

  // Zeilen, die den Stab weitergeben wollen, zählen auch dann, wenn der Zettel zu lang ist.
  const alleArten: ZeilenArt[] = [...wuensche.map((w) => w.art), ...zuLang];
  const namenZeilen = alleArten.filter((a) => a === "uebergabe" || a === "bitte" || a === "team");
  const istNameZeile = (a: ZeilenArt) => a === "uebergabe" || a === "bitte" || a === "team";
  const arten = new Set<string>(alleArten.map((a) => (istNameZeile(a) ? "name" : a)));

  const abbruch = (grund: ZeilenGrund): ZeilenErgebnis => ({
    wuensche: [],
    verworfen,
    hinweise,
    grund,
    unklar: true,
    breite: 0,
    antwortLaenge: laenge,
  });

  if (arten.size >= 2) return abbruch("widerspruch");
  for (const einzel of ["rueckgabe", "fertig", "frage"] as const) {
    if (alleArten.filter((a) => a === einzel).length >= 2) return abbruch("mehrfach");
  }
  if (namenZeilen.length >= 2) {
    if (eingabe.geber.rolle === "mitglied") return abbruch("zwei_zeilen_mitglied");
    if (eingabe.geber.rolle === "leitung" && eingabe.faecher !== true)
      return abbruch("zwei_zeilen_leitung");
  }

  return {
    wuensche,
    verworfen,
    hinweise,
    grund: null,
    unklar: false,
    breite: wuensche.filter((w) => w.art !== "fertig" && w.art !== "frage").length,
    antwortLaenge: laenge,
  };
}
