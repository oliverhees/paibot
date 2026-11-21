/**
 * PaiBot – Format des Team-Entwurfs: ein Team aus Bots als streng geprüfter Text (JSON). Reine
 * Funktionen ohne Datenbank und ohne Netz: lesen und prüfen, Namen und Texte vereinheitlichen,
 * Aussehen der Reihe nach vergeben, Modelle nur aus der eigenen Liste zuordnen und einen Abdruck
 * über den Inhalt bilden.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { istAnzeigeText } from "@paibot/shared/anzeigetext";
import type { Sha256Digest } from "@paibot/shared/grundtypen";
import { LIMITS } from "@paibot/shared/konstanten";
import {
  AVATAR_SHAPES,
  type AvatarShape,
  avatarShapeSchema,
  BOT_COLORS,
  type BotColor,
  botColorSchema,
} from "@paibot/shared/objekte";
import { z } from "zod";

/** Kennung der aktuellen Fassung; steht in jeder neuen Entwurfs-Datei im Feld `format`. */
export const ENTWURF_FORMAT = "pb-teamentwurf/v2";

/** Kennung der ersten Fassung. Sie wird weiter gelesen, aber nicht mehr geschrieben. */
export const ENTWURF_FORMAT_V1 = "pb-teamentwurf/v1";

/**
 * Vorsatz des Abdrucks. Abdruck = `sha256:` + Hex klein von SHA-256 über die UTF-8-Bytes von
 * `ENTWURF_ABDRUCK_VORSATZ` + kanonisches JSON des geprüften Entwurfs (`entwurfAbdruck`).
 */
export const ENTWURF_ABDRUCK_VORSATZ = "pb-teamentwurf/v2\n";

/** Vorsatz des Abdrucks der ersten Fassung (`entwurfAbdruckV1`). */
export const ENTWURF_ABDRUCK_VORSATZ_V1 = "pb-teamentwurf/v1\n";

/** Wie das Team zusammenarbeitet: gar nicht untereinander oder so, dass die Leitung führt. */
export const ZUSAMMENARBEIT_WERTE = ["aus", "leitung_fuehrt"] as const;
export type Zusammenarbeit = (typeof ZUSAMMENARBEIT_WERTE)[number];

/** Wer Arbeit abnimmt: die Leitung, der Besitzer selbst oder niemand. */
export const ABNAHME_WERTE = ["leitung", "besitzer", "ohne"] as const;
export type Abnahme = (typeof ABNAHME_WERTE)[number];

/** Wert des Feldes `modell`, wenn der Bot dasselbe Modell wie Pai bekommen soll. */
export const WIE_PAI = "wie_pai";

/** Ausgabegrenze, wenn ein Bot keine eigene nennt; dieselbe wie der Standard der Tabelle `bots`. */
export const STANDARD_ANTWORTLAENGE = 4096;

/** Grenzen je Entwurf. Namen, Anweisung und Ausgabegrenze stammen aus `LIMITS` (wie die Tabelle `bots`). */
export const ENTWURF_GRENZEN = {
  botsMin: 1,
  botsMax: 6,
  titelZeichen: 100,
  beschreibungZeichen: 300,
  teamNameZeichen: 60,
  botNameZeichen: LIMITS.botNameChars,
  aufgabeZeichen: 200,
  anweisungZeichen: LIMITS.botInstructionsChars,
  modellSlugZeichen: LIMITS.modelSlugChars,
  antwortLaengeMax: LIMITS.maxOutputTokens,
  /** Größe des Textes (UTF-8), die `pruefeEntwurfText` noch liest. */
  textBytesMax: 512 * 1024,
  /** Höchstens so viele Fehler werden gemeldet. */
  fehlerMax: 50,
} as const;

/** Modell eines Bots: dasselbe wie Pai oder ein Modell über seine Kennung (`slug`). */
export type EntwurfModell = typeof WIE_PAI | { readonly slug: string };

export interface EntwurfBot {
  readonly name: string;
  /** Kurze Rolle in einem Satz. */
  readonly aufgabe: string;
  /** Anweisung im vollen Wortlaut; gibt kein Recht. */
  readonly anweisung: string;
  readonly modell: EntwurfModell;
  readonly form: AvatarShape;
  readonly farbe: BotColor;
  readonly antwortLaenge: number;
}

/** Nur Fassung 1: wer Aufträge für das Team annimmt. In Fassung 2 ersetzt durch die Leitung. */
export type EntwurfAnsprechpartner =
  | { readonly art: "pai" }
  | { readonly art: "bot"; readonly name: string };

/** Geprüfter und vereinheitlichter Entwurf der ersten Fassung (nur noch zum Lesen). */
export interface TeamEntwurfV1 {
  readonly format: typeof ENTWURF_FORMAT_V1;
  readonly titel: string;
  readonly beschreibung?: string;
  readonly team: {
    readonly name: string;
    readonly ansprechpartner: EntwurfAnsprechpartner;
  };
  readonly bots: readonly EntwurfBot[];
}

/**
 * Geprüfter und vereinheitlichter Entwurf. Nur Dinge, die diese Fassung anlegen kann: Team mit
 * genau einer Leitung (einem Bot des Teams), Zusammenarbeit und Abnahme als feste Auswahl, dazu
 * die Bots. Keine Rechte, keine Regeln für Übergaben, keine App-Zugriffe.
 */
export interface TeamEntwurf {
  readonly format: typeof ENTWURF_FORMAT;
  readonly titel: string;
  readonly beschreibung?: string;
  readonly team: {
    readonly name: string;
    /** Name eines Bots des Entwurfs, in der Schreibweise dieses Bots. */
    readonly leitung: { readonly name: string };
    readonly zusammenarbeit: Zusammenarbeit;
    readonly abnahme: Abnahme;
  };
  readonly bots: readonly EntwurfBot[];
}

export type EntwurfFehlerCode =
  | "zu_gross"
  | "kein_json"
  | "falscher_typ"
  | "unbekanntes_feld"
  | "ungueltiger_wert"
  | "leer"
  | "zu_lang"
  | "unzulaessiges_zeichen"
  | "zu_wenige"
  | "zu_viele"
  | "name_doppelt"
  | "name_reserviert"
  | "ansprechpartner_unbekannt"
  | "leitung_unbekannt"
  | "leitung_fehlt";

export interface EntwurfFehler {
  /** Stelle im Entwurf, z. B. `bots[1].anweisung`; leer für den Entwurf als Ganzes. */
  readonly pfad: string;
  readonly code: EntwurfFehlerCode;
}

export type EntwurfHinweis =
  | {
      readonly code: "modell_unbekannt" | "modell_ausgeschaltet" | "modell_mehrdeutig";
      readonly bot: string;
      readonly slug: string;
    }
  /** Ein Entwurf des Assistenten wollte „Leitung führt“; es gilt „aus“ (`quelle: "assistent"`). */
  | { readonly code: "zusammenarbeit_auf_aus" };

/** Ein Modell der eigenen Liste, wie `ordneModelleZu` es braucht. */
export interface ModellEintrag {
  readonly slug: string;
  readonly eingeschaltet: boolean;
}

// ---------------------------------------------------------------------------------------------
// Texte

/** Anzahl der Zeichen (Codepoints), wie `char_length` der Datenbank zählt. */
function zeichenZahl(text: string): number {
  let anzahl = 0;
  for (const _zeichen of text) anzahl += 1;
  return anzahl;
}

/** Einzelne Hälften von Ersatzpaaren (kein gültiges Unicode). */
const KAPUTTES_UNICODE = /\p{Cs}/u;
/** Steuerzeichen außer Zeilenumbruch und Tabulator. */
const STEUERZEICHEN = /[^\P{Cc}\n\t]/u;
/**
 * Unsichtbares, das einen Text anders aussehen lässt, als er ist: weiche Trennung, Null-Breite
 * (außer den Verbindern für Schrift und Emoji), Schreibrichtung, Zeilen-/Absatztrenner, Byte-Marke
 * und Tag-Zeichen.
 */
const UNSICHTBAR =
  /[\u00AD\u200B\u200E\u200F\u2028\u2029\u202A-\u202E\u2060-\u2069\uFEFF\u{E0000}-\u{E007F}]/u;

/** Text in einer Zeile (Name, Titel, Aufgabe, Kennung): vereinheitlicht und streng geprüft. */
function einzeilig(max: number) {
  return z
    .string()
    .transform((wert) => wert.normalize("NFC").trim())
    .pipe(
      z.string().superRefine((wert, ctx) => {
        if (wert === "") ctx.addIssue({ code: "custom", message: "leer" });
        else if (zeichenZahl(wert) > max) ctx.addIssue({ code: "custom", message: "zu_lang" });
        else if (KAPUTTES_UNICODE.test(wert) || !istAnzeigeText(wert, max)) {
          ctx.addIssue({ code: "custom", message: "unzulaessiges_zeichen" });
        }
      }),
    );
}

/** Text über mehrere Zeilen (Anweisung): im vollen Wortlaut, nur vereinheitlicht, nie gekürzt. */
function mehrzeilig(max: number) {
  return z
    .string()
    .transform((wert) => wert.normalize("NFC").replace(/\r\n?/g, "\n"))
    .pipe(
      z.string().superRefine((wert, ctx) => {
        if (wert.trim() === "") ctx.addIssue({ code: "custom", message: "leer" });
        else if (zeichenZahl(wert) > max) ctx.addIssue({ code: "custom", message: "zu_lang" });
        else if (KAPUTTES_UNICODE.test(wert) || STEUERZEICHEN.test(wert) || UNSICHTBAR.test(wert)) {
          ctx.addIssue({ code: "custom", message: "unzulaessiges_zeichen" });
        }
      }),
    );
}

// ---------------------------------------------------------------------------------------------
// Schema

const modellSchema = z.union([
  z.literal(WIE_PAI),
  z.strictObject({ slug: einzeilig(ENTWURF_GRENZEN.modellSlugZeichen) }),
]);

const botSchema = z.strictObject({
  name: einzeilig(ENTWURF_GRENZEN.botNameZeichen),
  aufgabe: einzeilig(ENTWURF_GRENZEN.aufgabeZeichen),
  anweisung: mehrzeilig(ENTWURF_GRENZEN.anweisungZeichen),
  modell: modellSchema.default(WIE_PAI),
  form: avatarShapeSchema.optional(),
  farbe: botColorSchema.optional(),
  antwortLaenge: z
    .number()
    .int()
    .min(1)
    .max(ENTWURF_GRENZEN.antwortLaengeMax)
    .default(STANDARD_ANTWORTLAENGE),
});

/** Fassung 1: Ansprechpartner statt Leitung. */
const ansprechpartnerSchema = z.union([
  z.strictObject({ art: z.literal("pai") }),
  z.strictObject({ art: z.literal("bot"), name: einzeilig(ENTWURF_GRENZEN.botNameZeichen) }),
]);

const entwurfSchemaV1 = z.strictObject({
  format: z.literal(ENTWURF_FORMAT_V1),
  titel: einzeilig(ENTWURF_GRENZEN.titelZeichen),
  beschreibung: einzeilig(ENTWURF_GRENZEN.beschreibungZeichen).optional(),
  team: z.strictObject({
    name: einzeilig(ENTWURF_GRENZEN.teamNameZeichen),
    ansprechpartner: ansprechpartnerSchema,
  }),
  bots: z.array(botSchema).min(ENTWURF_GRENZEN.botsMin).max(ENTWURF_GRENZEN.botsMax),
});

const entwurfSchema = z.strictObject({
  format: z.literal(ENTWURF_FORMAT),
  titel: einzeilig(ENTWURF_GRENZEN.titelZeichen),
  beschreibung: einzeilig(ENTWURF_GRENZEN.beschreibungZeichen).optional(),
  team: z.strictObject({
    name: einzeilig(ENTWURF_GRENZEN.teamNameZeichen),
    leitung: z.strictObject({ name: einzeilig(ENTWURF_GRENZEN.botNameZeichen) }),
    zusammenarbeit: z.enum(ZUSAMMENARBEIT_WERTE),
    abnahme: z.enum(ABNAHME_WERTE),
  }),
  bots: z.array(botSchema).min(ENTWURF_GRENZEN.botsMin).max(ENTWURF_GRENZEN.botsMax),
});

/** Ein Bot-Name, der mit „Team “ beginnt, würde wie die Zeile für ein ganzes Team aussehen. */
const NAME_WIE_TEAM = /^team\s/iu;

// ---------------------------------------------------------------------------------------------
// Fehler

const EIGENE_CODES: ReadonlySet<string> = new Set<EntwurfFehlerCode>([
  "leer",
  "zu_lang",
  "unzulaessiges_zeichen",
]);

function pfadText(pfad: readonly PropertyKey[]): string {
  let text = "";
  for (const teil of pfad) {
    if (typeof teil === "number") text += `[${teil}]`;
    else text += text === "" ? String(teil) : `.${String(teil)}`;
  }
  return text.slice(0, 120);
}

function fehlerAus(fehler: z.ZodError): EntwurfFehler[] {
  const liste: EntwurfFehler[] = [];
  for (const meldung of fehler.issues) {
    const pfad = pfadText(meldung.path);
    if (meldung.code === "unrecognized_keys") {
      for (const schluessel of meldung.keys) {
        liste.push({ pfad: pfadText([...meldung.path, schluessel]), code: "unbekanntes_feld" });
      }
    } else if (meldung.code === "custom" && EIGENE_CODES.has(meldung.message)) {
      liste.push({ pfad, code: meldung.message as EntwurfFehlerCode });
    } else if (meldung.code === "invalid_type") {
      liste.push({ pfad, code: "falscher_typ" });
    } else if (meldung.code === "too_big") {
      liste.push({ pfad, code: meldung.origin === "array" ? "zu_viele" : "ungueltiger_wert" });
    } else if (meldung.code === "too_small") {
      liste.push({ pfad, code: meldung.origin === "array" ? "zu_wenige" : "ungueltiger_wert" });
    } else {
      liste.push({ pfad, code: "ungueltiger_wert" });
    }
    if (liste.length >= ENTWURF_GRENZEN.fehlerMax) break;
  }
  return liste.slice(0, ENTWURF_GRENZEN.fehlerMax);
}

// ---------------------------------------------------------------------------------------------
// Lesen und vereinheitlichen

export type EntwurfHerkunft = "v1" | "v2";

export type LeseErgebnis =
  | {
      readonly ok: true;
      readonly entwurf: TeamEntwurf;
      /** `v1`: der Text war in Fassung 1 geschrieben und wurde in Fassung 2 überführt. */
      readonly herkunft: EntwurfHerkunft;
    }
  | { readonly ok: false; readonly fehler: readonly EntwurfFehler[] };

export type LeseErgebnisV1 =
  | { readonly ok: true; readonly entwurf: TeamEntwurfV1 }
  | { readonly ok: false; readonly fehler: readonly EntwurfFehler[] };

export interface LeseOptionen {
  /**
   * Nur für Entwürfe in Fassung 1 mit „Pai“ als Ansprechpartner: Name des Bots, der die Leitung
   * wird. Ohne Angabe ist so ein Entwurf nicht überführbar (`leitung_fehlt`); es wird nie ein Bot
   * erraten. Hat der Entwurf einen Bot als Ansprechpartner, gilt dieser und die Angabe wird nicht
   * beachtet.
   */
  readonly leitungFuerV1?: string;
}

function nimm<T>(liste: readonly T[], index: number): T {
  return liste[index % liste.length] as T;
}

/** Namen der Bots ohne Rücksicht auf Groß- und Kleinschreibung eindeutig; Name → Schreibweise. */
function sammleNamen(
  bots: readonly { readonly name: string }[],
  fehler: EntwurfFehler[],
): Map<string, string> {
  const gesehen = new Map<string, string>();
  bots.forEach((bot, index) => {
    const schluessel = bot.name.toLowerCase();
    if (gesehen.has(schluessel)) fehler.push({ pfad: `bots[${index}].name`, code: "name_doppelt" });
    else gesehen.set(schluessel, bot.name);
  });
  return gesehen;
}

type GeleseneBots = z.infer<typeof botSchema>[];

function vereinheitlicheBots(bots: GeleseneBots): EntwurfBot[] {
  return bots.map((bot, index) => ({
    name: bot.name,
    aufgabe: bot.aufgabe,
    anweisung: bot.anweisung,
    modell: bot.modell === WIE_PAI ? WIE_PAI : { slug: bot.modell.slug },
    form: bot.form ?? nimm(AVATAR_SHAPES, index),
    farbe: bot.farbe ?? nimm(BOT_COLORS, index),
    antwortLaenge: bot.antwortLaenge,
  }));
}

/**
 * Prüft einen Entwurf der ersten Fassung (nur zum Lesen alter Entwürfe): unbekannte Felder sind
 * Fehler, Texte sind in NFC, Namen ohne Leerraum an den Enden, fehlendes Modell ist „wie Pai“,
 * fehlende Form und Farbe werden der Reihe nach vergeben. Ein Ansprechpartner muss ein Bot des
 * Entwurfs oder Pai sein. Verändert die Eingabe nicht.
 */
export function leseEntwurfV1(roh: unknown): LeseErgebnisV1 {
  const gelesen = entwurfSchemaV1.safeParse(roh);
  if (!gelesen.success) return { ok: false, fehler: fehlerAus(gelesen.error) };
  const eingabe = gelesen.data;
  const fehler: EntwurfFehler[] = [];
  const gesehen = sammleNamen(eingabe.bots, fehler);

  let ansprechpartner: EntwurfAnsprechpartner;
  const wunsch = eingabe.team.ansprechpartner;
  if (wunsch.art === "pai") ansprechpartner = { art: "pai" };
  else {
    const name = gesehen.get(wunsch.name.toLowerCase());
    if (name === undefined) {
      fehler.push({ pfad: "team.ansprechpartner.name", code: "ansprechpartner_unbekannt" });
      ansprechpartner = { art: "bot", name: wunsch.name };
    } else ansprechpartner = { art: "bot", name };
  }
  if (fehler.length > 0) return { ok: false, fehler };

  const entwurf: TeamEntwurfV1 = {
    format: ENTWURF_FORMAT_V1,
    titel: eingabe.titel,
    ...(eingabe.beschreibung === undefined ? {} : { beschreibung: eingabe.beschreibung }),
    team: { name: eingabe.team.name, ansprechpartner },
    bots: vereinheitlicheBots(eingabe.bots),
  };
  return { ok: true, entwurf };
}

/**
 * Prüft einen Entwurf der aktuellen Fassung streng und liefert ihn vereinheitlicht: unbekannte
 * Felder und unbekannte Werte sind Fehler, Texte sind in NFC, Namen ohne Leerraum an den Enden,
 * fehlendes Modell ist „wie Pai“, fehlende Form und Farbe werden der Reihe nach vergeben. Namen
 * der Bots sind ohne Rücksicht auf Groß- und Kleinschreibung eindeutig und beginnen nicht mit
 * „Team “; die Leitung muss ein Bot des Entwurfs sein. Nichts wird gekürzt oder still repariert.
 * Verändert die Eingabe nicht.
 */
export function leseEntwurfV2(roh: unknown): LeseErgebnis {
  const gelesen = entwurfSchema.safeParse(roh);
  if (!gelesen.success) return { ok: false, fehler: fehlerAus(gelesen.error) };
  const eingabe = gelesen.data;
  const fehler: EntwurfFehler[] = [];
  const gesehen = sammleNamen(eingabe.bots, fehler);
  eingabe.bots.forEach((bot, index) => {
    if (NAME_WIE_TEAM.test(bot.name))
      fehler.push({ pfad: `bots[${index}].name`, code: "name_reserviert" });
  });

  const leitungName = gesehen.get(eingabe.team.leitung.name.toLowerCase());
  if (leitungName === undefined) {
    fehler.push({ pfad: "team.leitung.name", code: "leitung_unbekannt" });
  }
  if (fehler.length > 0 || leitungName === undefined) return { ok: false, fehler };

  const entwurf: TeamEntwurf = {
    format: ENTWURF_FORMAT,
    titel: eingabe.titel,
    ...(eingabe.beschreibung === undefined ? {} : { beschreibung: eingabe.beschreibung }),
    team: {
      name: eingabe.team.name,
      leitung: { name: leitungName },
      zusammenarbeit: eingabe.team.zusammenarbeit,
      abnahme: eingabe.team.abnahme,
    },
    bots: vereinheitlicheBots(eingabe.bots),
  };
  return { ok: true, entwurf, herkunft: "v2" };
}

/**
 * Überführt einen geprüften Entwurf der ersten Fassung in die zweite, ohne etwas zu verlieren
 * außer dem Ansprechpartner „Pai“, den es dort nicht mehr gibt:
 * - Titel, Beschreibung, Teamname und alle Bots (Texte, Modell, Aussehen, Länge) bleiben gleich.
 * - Ein Bot als Ansprechpartner wird die Leitung. Bei „Pai“ muss die Person die Leitung nennen
 *   (`leitungName`); sonst `leitung_fehlt`, es wird nie ein Bot erraten.
 * - Zusammenarbeit wird `aus` (die erste Fassung kannte keine Übergaben zwischen Bots), Abnahme
 *   wird `besitzer` (die Person behält sie; ohne Zusammenarbeit wirkt sie noch nicht).
 * Das Ergebnis wird wie jeder Entwurf der zweiten Fassung geprüft; ein Bot-Name, den sie nicht
 * zulässt (z. B. „Team …“), ist ein Fehler.
 */
export function ueberfuehreV1(alt: TeamEntwurfV1, leitungName?: string): LeseErgebnis {
  const leitung =
    alt.team.ansprechpartner.art === "bot" ? alt.team.ansprechpartner.name : leitungName;
  if (leitung === undefined) {
    return { ok: false, fehler: [{ pfad: "team.leitung", code: "leitung_fehlt" }] };
  }
  const roh = {
    format: ENTWURF_FORMAT,
    titel: alt.titel,
    ...(alt.beschreibung === undefined ? {} : { beschreibung: alt.beschreibung }),
    team: {
      name: alt.team.name,
      leitung: { name: leitung },
      zusammenarbeit: "aus",
      abnahme: "besitzer",
    },
    bots: alt.bots.map((bot) => ({
      name: bot.name,
      aufgabe: bot.aufgabe,
      anweisung: bot.anweisung,
      modell: bot.modell === WIE_PAI ? WIE_PAI : { slug: bot.modell.slug },
      form: bot.form,
      farbe: bot.farbe,
      antwortLaenge: bot.antwortLaenge,
    })),
  };
  const gelesen = leseEntwurfV2(roh);
  return gelesen.ok ? { ...gelesen, herkunft: "v1" } : gelesen;
}

/**
 * Liest einen Entwurf in Fassung 2 oder, überführt, in Fassung 1; das Feld `format` entscheidet.
 * Das Ergebnis ist immer ein Entwurf der aktuellen Fassung (`herkunft` sagt, woher er kam).
 */
export function leseEntwurf(roh: unknown, optionen: LeseOptionen = {}): LeseErgebnis {
  const format =
    typeof roh === "object" && roh !== null && !Array.isArray(roh)
      ? (roh as { format?: unknown }).format
      : undefined;
  if (format === ENTWURF_FORMAT_V1) {
    const alt = leseEntwurfV1(roh);
    if (!alt.ok) return alt;
    return ueberfuehreV1(alt.entwurf, optionen.leitungFuerV1);
  }
  return leseEntwurfV2(roh);
}

// ---------------------------------------------------------------------------------------------
// Modelle

/**
 * Ordnet die Modelle des Entwurfs der eigenen Liste zu. Ein Modell bleibt nur, wenn genau ein
 * eingeschaltetes Modell mit dieser Kennung existiert; sonst wird der Bot „wie Pai“ und ein Hinweis
 * nennt den Grund. Es werden nie Modelle oder Anbieter angelegt.
 */
export function ordneModelleZu<T extends TeamEntwurf | TeamEntwurfV1>(
  entwurf: T,
  modelle: readonly ModellEintrag[],
): { entwurf: T; hinweise: EntwurfHinweis[] } {
  const hinweise: EntwurfHinweis[] = [];
  const bots = entwurf.bots.map((bot): EntwurfBot => {
    if (bot.modell === WIE_PAI) return bot;
    const slug = bot.modell.slug;
    const gleich = modelle.filter((modell) => modell.slug === slug);
    const an = gleich.filter((modell) => modell.eingeschaltet);
    if (an.length === 1) return bot;
    const code =
      an.length > 1
        ? "modell_mehrdeutig"
        : gleich.length > 0
          ? "modell_ausgeschaltet"
          : "modell_unbekannt";
    hinweise.push({ code, bot: bot.name, slug });
    return { ...bot, modell: WIE_PAI };
  });
  return { entwurf: { ...entwurf, bots }, hinweise };
}

// ---------------------------------------------------------------------------------------------
// Abdruck

/**
 * Kanonisches JSON (nach RFC 8785, eingeschränkt auf die Werte des Entwurfs): Schlüssel nach
 * UTF-16-Code-Units sortiert, keine Leerzeichen, Texte wie `JSON.stringify`, nur sichere
 * Ganzzahlen, Felder ohne Wert fallen weg. Andere Werte werfen einen `TypeError`.
 */
function kanonisch(wert: unknown): string {
  if (typeof wert === "string") return JSON.stringify(wert);
  if (typeof wert === "boolean") return wert ? "true" : "false";
  if (typeof wert === "number") {
    if (!Number.isSafeInteger(wert)) throw new TypeError("Entwurf enthält keine Ganzzahl");
    return Object.is(wert, -0) ? "0" : String(wert);
  }
  if (Array.isArray(wert)) return `[${wert.map(kanonisch).join(",")}]`;
  if (typeof wert === "object" && wert !== null) {
    const art = Object.getPrototypeOf(wert);
    if (art !== Object.prototype && art !== null) {
      throw new TypeError("Entwurf enthält ein unbekanntes Objekt");
    }
    const satz = wert as Record<string, unknown>;
    const teile = Object.keys(satz)
      .filter((schluessel) => satz[schluessel] !== undefined)
      .sort()
      .map((schluessel) => `${JSON.stringify(schluessel)}:${kanonisch(satz[schluessel])}`);
    return `{${teile.join(",")}}`;
  }
  throw new TypeError("Entwurf enthält einen unbekannten Wert");
}

/**
 * Abdruck über den Inhalt eines geprüften Entwurfs (`leseEntwurf`): gleicher Inhalt ergibt immer
 * denselben Abdruck, unabhängig von der Reihenfolge der Felder; jede Änderung an einem Text, einer
 * Zahl, am Aussehen oder an der Reihenfolge der Bots ergibt einen anderen.
 */
export async function entwurfAbdruck(entwurf: TeamEntwurf): Promise<Sha256Digest> {
  return abdruckMit(ENTWURF_ABDRUCK_VORSATZ, entwurf);
}

/**
 * Abdruck eines Entwurfs der ersten Fassung, mit dem Vorsatz der ersten Fassung. Derselbe Inhalt
 * hat in Fassung 1 und Fassung 2 verschiedene Abdrücke: Der Abdruck bindet die Fassung.
 */
export async function entwurfAbdruckV1(entwurf: TeamEntwurfV1): Promise<Sha256Digest> {
  return abdruckMit(ENTWURF_ABDRUCK_VORSATZ_V1, entwurf);
}

async function abdruckMit(
  vorsatz: string,
  entwurf: TeamEntwurf | TeamEntwurfV1,
): Promise<Sha256Digest> {
  const text = `${vorsatz}${kanonisch(entwurf)}`;
  // Nur Web Crypto (`globalThis.crypto.subtle`): läuft in Node und im Browser gleich.
  const summe = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  const hex = Array.from(new Uint8Array(summe), (byte) => byte.toString(16).padStart(2, "0"));
  return `sha256:${hex.join("")}` as Sha256Digest;
}

// ---------------------------------------------------------------------------------------------
// Alles zusammen

export type PruefErgebnis =
  | {
      readonly ok: true;
      readonly entwurf: TeamEntwurf;
      /** Abdruck des Entwurfs, wie er nach der Zuordnung der Modelle aussieht. */
      readonly abdruck: Sha256Digest;
      readonly hinweise: readonly EntwurfHinweis[];
      /** `v1`: der Text war in Fassung 1 geschrieben; `entwurf` und `abdruck` gelten für Fassung 2. */
      readonly herkunft: EntwurfHerkunft;
    }
  | { readonly ok: false; readonly fehler: readonly EntwurfFehler[] };

export interface PruefOptionen extends LeseOptionen {
  /** Eigene Modelle; ohne Angabe bleiben Modelle, wie sie im Entwurf stehen. */
  readonly modelle?: readonly ModellEintrag[];
  /**
   * Woher der Entwurf kommt. Von `assistent` (ein Modell hat ihn geschrieben) gilt die
   * Zusammenarbeit immer als `aus`, auch wenn dort etwas anderes steht; ein Hinweis sagt es.
   * Vorlagen und Dateien behalten, was drinsteht; angezeigt wird der Wert immer.
   */
  readonly quelle?: "assistent";
}

/** Prüft einen Entwurf, ordnet die Modelle zu (falls Liste da) und bildet den Abdruck. */
export async function pruefeEntwurf(
  roh: unknown,
  optionen: PruefOptionen = {},
): Promise<PruefErgebnis> {
  const gelesen = leseEntwurf(roh, optionen);
  if (!gelesen.ok) return gelesen;
  const hinweise: EntwurfHinweis[] = [];
  let entwurf = gelesen.entwurf;
  if (optionen.quelle === "assistent" && entwurf.team.zusammenarbeit !== "aus") {
    entwurf = { ...entwurf, team: { ...entwurf.team, zusammenarbeit: "aus" } };
    hinweise.push({ code: "zusammenarbeit_auf_aus" });
  }
  if (optionen.modelle !== undefined) {
    const zugeordnet = ordneModelleZu(entwurf, optionen.modelle);
    entwurf = zugeordnet.entwurf;
    hinweise.push(...zugeordnet.hinweise);
  }
  return {
    ok: true,
    entwurf,
    abdruck: await entwurfAbdruck(entwurf),
    hinweise,
    herkunft: gelesen.herkunft,
  };
}

/**
 * Wie `pruefeEntwurf`, aber für Text (Datei, Vorlage, Antwort eines Modells): zu großer Text und
 * alles, was kein JSON ist, werden vorher abgewiesen.
 */
export async function pruefeEntwurfText(
  text: string,
  optionen: PruefOptionen = {},
): Promise<PruefErgebnis> {
  const grenze = ENTWURF_GRENZEN.textBytesMax;
  if (text.length > grenze || new TextEncoder().encode(text).length > grenze) {
    return { ok: false, fehler: [{ pfad: "", code: "zu_gross" }] };
  }
  let roh: unknown;
  try {
    roh = JSON.parse(text);
  } catch {
    return { ok: false, fehler: [{ pfad: "", code: "kein_json" }] };
  }
  return pruefeEntwurf(roh, optionen);
}
