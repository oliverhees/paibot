/**
 * PaiBot – Verzeichnis fertiger Apps (Vorlagen): feste Daten zu Notion, Linear, Atlassian und
 * GitHub mit einem strengen Schema. Eine Vorlage nennt Adresse, Name, Kurzname, den Weg der
 * Anmeldung und einen Link zur Doku des Anbieters; Texte stehen als Schlüssel des Text-Systems.
 *
 * Das Verzeichnis ist Code, nicht Einstellung: Es wird beim Laden des Moduls gegen das Schema
 * geprüft und tief eingefroren. Es liest keine Umgebungsvariable, keine Einstellung, keine Datei und
 * nichts aus dem Netz. Nur für den Server: Das Browser-Bündel sperrt das Modul
 * (`apps/web/src/lib/routen-browser-buendel.test.ts`).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-23
 */

import { newId } from "@paibot/shared/ids";
import { isTextKey, type TextKey, t } from "@paibot/shared/texte";
import { z } from "zod";
import { zielAus } from "./adresse";
import { KURZNAME_MUSTER } from "./eingaben";

/**
 * Höchste Länge des Kurznamens einer Vorlage: Das Muster der Eingabe erlaubt 32 Zeichen; vier
 * bleiben frei für einen Zähler (`-2` … `-999`), wenn eine Vorlage mehrmals verbunden wird.
 */
export const MAX_VORLAGE_KURZNAME = 28;

/** Arten einer Adresse: `voll` (alle Werkzeuge des Dienstes) oder `nur_lesen` (nur lesende). */
export const VORLAGE_ADRESS_ARTEN = Object.freeze(["voll", "nur_lesen"] as const);
export type VorlageAdressArt = (typeof VORLAGE_ADRESS_ARTEN)[number];

/** Stand eines Anmelde-Wegs: `ja` oder `eingeschraenkt` (geht nur unter einer Bedingung). */
export const VORLAGE_ANMELDE_STAENDE = Object.freeze(["ja", "eingeschraenkt"] as const);

/**
 * Wörter, die in keinem Text einer Vorlage stehen dürfen: Sie würden etwas versprechen, das
 * PaiBot nicht belegt hat. Die Suche achtet nicht auf Groß- und Kleinschreibung und findet das Wort
 * auch als Teil eines längeren Worts („Sicherheit“ enthält „sicher“).
 */
export const VERBOTENE_WOERTER = Object.freeze([
  "DSGVO",
  "Open Source",
  "sicher",
  "empfohlen",
  "funktioniert",
  "geprüft",
] as const);

/**
 * Die verbotenen Wörter, die in `text` vorkommen, in der Reihenfolge von `VERBOTENE_WOERTER`.
 * Leer, wenn der Text keines enthält.
 */
export function verboteneWoerterIn(text: string): string[] {
  const klein = text.toLocaleLowerCase("de");
  return VERBOTENE_WOERTER.filter((wort) => klein.includes(wort.toLocaleLowerCase("de")));
}

/**
 * Verletzte Adress-Prüfungen einer Adresse, gerechnet mit `zielAus`: die Namen der verletzten
 * Fakten (`addressHttps`, `addressPublic`, `addressPort443`, `addressUserinfo`, `addressQuery`,
 * `addressFragment`), dazu `schraegstrich` bei einem Schrägstrich am Ende, `umgeformt`, wenn die
 * gespeicherte Form von der Eingabe abweicht, und `unlesbar`, wenn `zielAus` die Adresse ablehnt.
 * Leer, wenn die Adresse alle Prüfungen besteht.
 */
export function adressMaengel(adresse: string): string[] {
  let ziel: ReturnType<typeof zielAus>;
  try {
    // Die Kennung geht nur in den Abdruck; der wird hier nicht gebraucht.
    ziel = zielAus(adresse, newId("app"));
  } catch {
    return ["unlesbar"];
  }
  const { fakten } = ziel;
  const maengel: string[] = [];
  if (!fakten.addressHttps) maengel.push("addressHttps");
  if (!fakten.addressPublic) maengel.push("addressPublic");
  if (!fakten.addressPort443) maengel.push("addressPort443");
  if (fakten.addressUserinfo) maengel.push("addressUserinfo");
  if (fakten.addressQuery) maengel.push("addressQuery");
  if (fakten.addressFragment) maengel.push("addressFragment");
  if (adresse.endsWith("/")) maengel.push("schraegstrich");
  else if (ziel.url !== adresse) maengel.push("umgeformt");
  return maengel;
}

/**
 * Der rohe Text zu einem Schlüssel, ohne Platzhalter einzusetzen. Die Umwandlung nimmt `t` die
 * Pflicht zu Platzhalter-Werten: Für die Suche nach verbotenen Wörtern zählt der Text, wie er im
 * Katalog steht.
 */
export const katalogText = t as (key: TextKey) => string;

/** Schlüssel eines Textes im Text-System, der keines der verbotenen Wörter enthält. */
const textSchluessel = z
  .string()
  .refine(isTextKey, { message: "kein Schlüssel im Text-Katalog" })
  // `isTextKey` erneut: Zod prüft die zweite Regel auch, wenn die erste schon fehlschlug.
  .refine((key) => isTextKey(key) && verboteneWoerterIn(katalogText(key)).length === 0, {
    message: "Text enthält ein verbotenes Wort",
  })
  .transform((key) => key as TextKey);

/** Eine Adresse einer Vorlage. Genau eine Adresse einer Vorlage ist `standard`. */
const adressSchema = z.strictObject({
  adresse: z.string().superRefine((adresse, ctx) => {
    for (const mangel of adressMaengel(adresse)) {
      ctx.addIssue({ code: "custom", message: `Adresse verletzt: ${mangel}` });
    }
  }),
  art: z.enum(VORLAGE_ADRESS_ARTEN),
  standard: z.boolean(),
});

/** Ein Weg der Anmeldung. Heute nur `token` (als `Authorization: Bearer …`). */
const anmeldungSchema = z.strictObject({
  art: z.literal("token"),
  stand: z.enum(VORLAGE_ANMELDE_STAENDE),
  /** Fester Satz zum Token, bei `eingeschraenkt` mit der Bedingung. */
  hinweis: textSchluessel,
});

/** Ist `doku` eine https-Adresse ohne Benutzer-Teil und Port auf einem Host aus `hosts`? */
function dokuErlaubt(doku: string, hosts: readonly string[]): boolean {
  let url: URL;
  try {
    url = new URL(doku);
  } catch {
    return false;
  }
  return (
    url.protocol === "https:" &&
    url.username === "" &&
    url.password === "" &&
    url.port === "" &&
    hosts.includes(url.hostname)
  );
}

/**
 * Schema einer Vorlage. Unbekannte Felder, eine leere Adressliste, keine oder mehrere
 * Standard-Adressen, zwei Adressen derselben Art, ein Kurzname außerhalb des Musters oder über
 * `MAX_VORLAGE_KURZNAME` Zeichen und ein Doku-Link auf einen Host außerhalb von `dokuHosts` sind
 * Fehler.
 */
export const vorlageSchema = z
  .strictObject({
    /** Kennung der Vorlage, fest über alle Fassungen. */
    id: z.string().regex(KURZNAME_MUSTER),
    /** Fassung der Vorlage; jede Änderung an den Daten bekommt eine neue. */
    fassung: z.int().positive(),
    /** Name der App (Schlüssel im Text-System). */
    name: textSchluessel,
    /** Kurzname der App, Teil der Modell-Namen ihrer Werkzeuge. */
    kurzname: z
      .string()
      .max(MAX_VORLAGE_KURZNAME)
      .regex(KURZNAME_MUSTER)
      .refine((k) => !k.includes("__"), { message: "kein doppelter Unterstrich" }),
    adressen: z.array(adressSchema).min(1),
    anmeldung: z.array(anmeldungSchema).min(1),
    /** Link zur Doku-Seite des Anbieters. */
    doku: z.string(),
    /** Hosts, auf die der Doku-Link zeigen darf. */
    dokuHosts: z.array(z.string().min(1)).min(1),
    /** Wann und wie die Vorlage ausprobiert wurde; leer, solange das nicht geschehen ist. */
    pruefung: z.null(),
  })
  .superRefine((vorlage, ctx) => {
    const standard = vorlage.adressen.filter((a) => a.standard).length;
    if (standard !== 1) {
      ctx.addIssue({
        code: "custom",
        path: ["adressen"],
        message: "genau eine Adresse ist die Standard-Adresse",
      });
    }
    const arten = vorlage.adressen.map((a) => a.art);
    if (new Set(arten).size !== arten.length) {
      ctx.addIssue({ code: "custom", path: ["adressen"], message: "jede Art nur einmal" });
    }
    if (!dokuErlaubt(vorlage.doku, vorlage.dokuHosts)) {
      ctx.addIssue({
        code: "custom",
        path: ["doku"],
        message: "nur https auf einem Host aus dokuHosts",
      });
    }
  });

/** Eine geprüfte Vorlage, wie sie das Verzeichnis liefert. */
export type Vorlage = DeepReadonly<z.output<typeof vorlageSchema>>;

type DeepReadonly<T> = T extends readonly (infer E)[]
  ? readonly DeepReadonly<E>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;

function tiefEinfrieren<T>(wert: T): T {
  if (wert !== null && typeof wert === "object") {
    for (const teil of Object.values(wert)) tiefEinfrieren(teil);
    Object.freeze(wert);
  }
  return wert;
}

/**
 * Prüft eine Liste roher Vorlagen gegen das Schema, verlangt eindeutige Kennungen und Kurznamen und
 * liefert sie tief eingefroren. Wirft bei einem Fehler: Das Verzeichnis ist Code, ein Fehler darin
 * ist ein Programmfehler.
 */
export function vorlageAus(roh: readonly unknown[]): readonly Vorlage[] {
  const liste = z.array(vorlageSchema).parse(roh);
  if (new Set(liste.map((v) => v.id)).size !== liste.length) {
    throw new TypeError("Kennungen der Vorlagen sind nicht eindeutig");
  }
  if (new Set(liste.map((v) => v.kurzname)).size !== liste.length) {
    throw new TypeError("Kurznamen der Vorlagen sind nicht eindeutig");
  }
  return tiefEinfrieren(liste) as readonly Vorlage[];
}

/** Alle Text-Schlüssel, die eine Vorlage nennt (Name und Hinweise der Anmeldung). */
export function vorlageTextSchluessel(vorlage: Vorlage): TextKey[] {
  return [vorlage.name, ...vorlage.anmeldung.map((weg) => weg.hinweis)];
}

/**
 * Das Verzeichnis der Vorlagen, in fester Reihenfolge. Die Werte stammen aus der Doku der
 * Anbieter; ausprobiert ist noch keine Vorlage (`pruefung` ist leer).
 */
export const VORLAGEN: readonly Vorlage[] = vorlageAus([
  {
    id: "notion",
    fassung: 1,
    name: "apps.vorlage.notion.name",
    kurzname: "notion",
    adressen: [{ adresse: "https://mcp.notion.com/mcp", art: "voll", standard: true }],
    anmeldung: [
      { art: "token", stand: "eingeschraenkt", hinweis: "apps.vorlage.notion.token.hinweis" },
    ],
    doku: "https://developers.notion.com/guides/mcp/get-started-with-mcp",
    dokuHosts: ["developers.notion.com"],
    pruefung: null,
  },
  {
    id: "linear",
    fassung: 1,
    name: "apps.vorlage.linear.name",
    kurzname: "linear",
    adressen: [
      { adresse: "https://mcp.linear.app/mcp/readonly", art: "nur_lesen", standard: true },
      { adresse: "https://mcp.linear.app/mcp", art: "voll", standard: false },
    ],
    anmeldung: [{ art: "token", stand: "ja", hinweis: "apps.vorlage.linear.token.hinweis" }],
    doku: "https://linear.app/docs/mcp",
    dokuHosts: ["linear.app"],
    pruefung: null,
  },
  {
    id: "atlassian",
    fassung: 1,
    name: "apps.vorlage.atlassian.name",
    kurzname: "atlassian",
    adressen: [{ adresse: "https://mcp.atlassian.com/v2/mcp", art: "voll", standard: true }],
    anmeldung: [
      {
        art: "token",
        stand: "eingeschraenkt",
        hinweis: "apps.vorlage.atlassian.token.hinweis",
      },
    ],
    doku: "https://github.com/atlassian/atlassian-mcp-server",
    dokuHosts: ["github.com"],
    pruefung: null,
  },
  {
    id: "github",
    fassung: 1,
    name: "apps.vorlage.github.name",
    kurzname: "github",
    adressen: [{ adresse: "https://api.githubcopilot.com/mcp", art: "voll", standard: true }],
    anmeldung: [{ art: "token", stand: "ja", hinweis: "apps.vorlage.github.token.hinweis" }],
    doku: "https://github.com/github/github-mcp-server",
    dokuHosts: ["github.com"],
    pruefung: null,
  },
]);
