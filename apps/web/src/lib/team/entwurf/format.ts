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

/** Kennung des Formats; steht in jeder Entwurfs-Datei im Feld `format`. */
export const ENTWURF_FORMAT = "pb-teamentwurf/v1";

/**
 * Vorsatz des Abdrucks. Abdruck = `sha256:` + Hex klein von SHA-256 über die UTF-8-Bytes von
 * `ENTWURF_ABDRUCK_VORSATZ` + kanonisches JSON des geprüften Entwurfs (`entwurfAbdruck`).
 */
export const ENTWURF_ABDRUCK_VORSATZ = "pb-teamentwurf/v1\n";

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

export type EntwurfAnsprechpartner =
  | { readonly art: "pai" }
  | { readonly art: "bot"; readonly name: string };

/** Geprüfter und vereinheitlichter Entwurf. Nur Dinge, die diese Fassung anlegen kann. */
export interface TeamEntwurf {
  readonly format: typeof ENTWURF_FORMAT;
  readonly titel: string;
  readonly beschreibung?: string;
  readonly team: {
    readonly name: string;
    readonly ansprechpartner: EntwurfAnsprechpartner;
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
  | "ansprechpartner_unbekannt";

export interface EntwurfFehler {
  /** Stelle im Entwurf, z. B. `bots[1].anweisung`; leer für den Entwurf als Ganzes. */
  readonly pfad: string;
  readonly code: EntwurfFehlerCode;
}

export interface EntwurfHinweis {
  readonly code: "modell_unbekannt" | "modell_ausgeschaltet" | "modell_mehrdeutig";
  readonly bot: string;
  readonly slug: string;
}

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

const ansprechpartnerSchema = z.union([
  z.strictObject({ art: z.literal("pai") }),
  z.strictObject({ art: z.literal("bot"), name: einzeilig(ENTWURF_GRENZEN.botNameZeichen) }),
]);

const entwurfSchema = z.strictObject({
  format: z.literal(ENTWURF_FORMAT),
  titel: einzeilig(ENTWURF_GRENZEN.titelZeichen),
  beschreibung: einzeilig(ENTWURF_GRENZEN.beschreibungZeichen).optional(),
  team: z.strictObject({
    name: einzeilig(ENTWURF_GRENZEN.teamNameZeichen),
    ansprechpartner: ansprechpartnerSchema,
  }),
  bots: z.array(botSchema).min(ENTWURF_GRENZEN.botsMin).max(ENTWURF_GRENZEN.botsMax),
});

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

export type LeseErgebnis =
  | { readonly ok: true; readonly entwurf: TeamEntwurf }
  | { readonly ok: false; readonly fehler: readonly EntwurfFehler[] };

function nimm<T>(liste: readonly T[], index: number): T {
  return liste[index % liste.length] as T;
}

/**
 * Prüft einen Entwurf streng und liefert ihn vereinheitlicht: unbekannte Felder sind Fehler, Texte
 * sind in NFC, Namen ohne Leerraum an den Enden, fehlendes Modell ist „wie Pai“, fehlende Form und
 * Farbe werden der Reihe nach vergeben. Namen der Bots sind ohne Rücksicht auf Groß- und
 * Kleinschreibung eindeutig; ein Ansprechpartner muss ein Bot des Entwurfs oder Pai sein. Nichts
 * wird gekürzt oder still repariert. Verändert die Eingabe nicht.
 */
export function leseEntwurf(roh: unknown): LeseErgebnis {
  const gelesen = entwurfSchema.safeParse(roh);
  if (!gelesen.success) return { ok: false, fehler: fehlerAus(gelesen.error) };
  const eingabe = gelesen.data;
  const fehler: EntwurfFehler[] = [];

  const gesehen = new Map<string, string>();
  eingabe.bots.forEach((bot, index) => {
    const schluessel = bot.name.toLowerCase();
    if (gesehen.has(schluessel)) fehler.push({ pfad: `bots[${index}].name`, code: "name_doppelt" });
    else gesehen.set(schluessel, bot.name);
  });

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

  const bots: EntwurfBot[] = eingabe.bots.map((bot, index) => ({
    name: bot.name,
    aufgabe: bot.aufgabe,
    anweisung: bot.anweisung,
    modell: bot.modell === WIE_PAI ? WIE_PAI : { slug: bot.modell.slug },
    form: bot.form ?? nimm(AVATAR_SHAPES, index),
    farbe: bot.farbe ?? nimm(BOT_COLORS, index),
    antwortLaenge: bot.antwortLaenge,
  }));
  const entwurf: TeamEntwurf = {
    format: ENTWURF_FORMAT,
    titel: eingabe.titel,
    ...(eingabe.beschreibung === undefined ? {} : { beschreibung: eingabe.beschreibung }),
    team: { name: eingabe.team.name, ansprechpartner },
    bots,
  };
  return { ok: true, entwurf };
}

// ---------------------------------------------------------------------------------------------
// Modelle

/**
 * Ordnet die Modelle des Entwurfs der eigenen Liste zu. Ein Modell bleibt nur, wenn genau ein
 * eingeschaltetes Modell mit dieser Kennung existiert; sonst wird der Bot „wie Pai“ und ein Hinweis
 * nennt den Grund. Es werden nie Modelle oder Anbieter angelegt.
 */
export function ordneModelleZu(
  entwurf: TeamEntwurf,
  modelle: readonly ModellEintrag[],
): { entwurf: TeamEntwurf; hinweise: EntwurfHinweis[] } {
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
  const text = `${ENTWURF_ABDRUCK_VORSATZ}${kanonisch(entwurf)}`;
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
    }
  | { readonly ok: false; readonly fehler: readonly EntwurfFehler[] };

export interface PruefOptionen {
  /** Eigene Modelle; ohne Angabe bleiben Modelle, wie sie im Entwurf stehen. */
  readonly modelle?: readonly ModellEintrag[];
}

/** Prüft einen Entwurf, ordnet die Modelle zu (falls Liste da) und bildet den Abdruck. */
export async function pruefeEntwurf(
  roh: unknown,
  optionen: PruefOptionen = {},
): Promise<PruefErgebnis> {
  const gelesen = leseEntwurf(roh);
  if (!gelesen.ok) return gelesen;
  const zugeordnet =
    optionen.modelle === undefined
      ? { entwurf: gelesen.entwurf, hinweise: [] as EntwurfHinweis[] }
      : ordneModelleZu(gelesen.entwurf, optionen.modelle);
  return {
    ok: true,
    entwurf: zugeordnet.entwurf,
    abdruck: await entwurfAbdruck(zugeordnet.entwurf),
    hinweise: zugeordnet.hinweise,
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
