/**
 * PaiBot – alle API-Routen der Web-App mit Methode, Pfad, Zugang, Eingabe und Aktion des Tors;
 * gemeinsame Quelle für Routen, Oberfläche und Tests.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { ActionType, Credential } from "@paibot/shared/aktionen";
import {
  botInput,
  connectionTestInput,
  conversationCreateInput,
  conversationRenameInput,
  conversationSearchQuery,
  killSwitchInput,
  loginInput,
  managementKeyInput,
  modelChoiceInput,
  passwordChangeInput,
  providerInput,
  receiptChainQuery,
  receiptListQuery,
  routingRuleInput,
  ruleRecheckInput,
  schleuseInput,
  sendMessageInput,
  settingsInput,
  setupCodeCheckInput,
  setupConnectionTestInput,
  setupInput,
} from "@paibot/shared/eingaben";
import type { z } from "zod";
import { GROESSTER_KOERPER_BYTES, STANDARD_KOERPER_BYTES } from "./api/koerper";
import type { LimitName } from "./rate-limit";

export type Methode = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * Wer eine Route aufrufen darf: `oeffentlich` ohne alles, `vorab` ohne Sitzung, aber mit
 * Vorab-Prüfzeichen (Einrichtung und Anmelden), `besitzer` nur mit gültiger Sitzung.
 */
export type Zugang = "oeffentlich" | "vorab" | "besitzer";

/** Antwortform: JSON-Hülle `{ ok, daten | fehler }`, Ereignis-Strom oder Datei-Download. */
export type Antwort = "json" | "health" | "sse" | "download";

export interface RoutenDefinition {
  methode: Methode;
  /** Pfad mit Parametern als `:name`, z. B. `/api/unterhaltungen/:id`. */
  pfad: string;
  zugang: Zugang;
  antwort: Antwort;
  /** Verändert die Route Daten? Dann prüft sie CSRF und geht über `gate.run` mit `aktion`. */
  veraendernd: boolean;
  /** Aktion des Tors; bei jeder verändernden Route Pflicht. */
  aktion?: ActionType;
  /** Schema des Körpers (bei GET: der Abfrage). */
  eingabe?: z.ZodType;
  /**
   * Nachweis, den die Route dem Tor als Fakt `credential` meldet. Er stammt aus der geprüften
   * Anfrage (Sitzung, Passwort oder Einrichtungs-Code), nie aus dem Körper. Ohne Angabe bei
   * Zugang `besitzer`: `sitzung`.
   */
  nachweis?: Credential;
  /**
   * Rate-Limits (`LIMIT_DEFINITIONEN`), die die Route vor jeder weiteren Arbeit zählt, in dieser
   * Reihenfolge. Bei `verzoegern` wartet die Anfrage, bei `sperren` antwortet sie mit
   * `zu_viele_versuche`.
   */
  limits?: readonly LimitName[];
  /** Über einem sperrenden Limit endet zusätzlich die Sitzung der Anfrage (Cookie gelöscht). */
  beiLimitAbmelden?: true;
  /** Nur bis zum Ende der Einrichtung erreichbar; danach `einrichtung_fertig` (409). */
  nurVorEinrichtung?: true;
  /**
   * Größter Körper der Anfrage in Byte (Standard `STANDARD_KOERPER_BYTES`). Der Proxy weist
   * größere Anfragen schon an der angegebenen Länge ab, der Rahmen bricht das Lesen ab, sobald mehr
   * ankommt.
   */
  koerperBytes?: number;
}

export { GROESSTER_KOERPER_BYTES, STANDARD_KOERPER_BYTES };

/**
 * Aktionen ohne eigene Route: Sie laufen nur als Folge einer anderen Route über das Tor
 * („Gerät hinzugefügt“ nach Anmelden, Einrichtung und Passwort ändern).
 */
export const FOLGE_AKTIONEN = ["geraet.hinzufuegen"] as const;

/** Alle API-Routen der Basis. */
export const API_ROUTEN = {
  health: {
    methode: "GET",
    pfad: "/api/health",
    zugang: "oeffentlich",
    antwort: "health",
    veraendernd: false,
  },

  einrichtungStatus: {
    methode: "GET",
    pfad: "/api/einrichtung",
    zugang: "vorab",
    antwort: "json",
    veraendernd: false,
  },
  /**
   * Prüft einen neuen Schlüssel vor dem Abschluss der Einrichtung. Verlangt den Einrichtungs-Code
   * (falscher Code zählt auf `einrichtungIp` wie beim Abschließen) und zählt jeden Aufruf auf
   * `verbindungstestIp`. Nimmt keinen gespeicherten Anbieter an.
   */
  einrichtungVerbindungstest: {
    methode: "POST",
    pfad: "/api/einrichtung/verbindungstest",
    zugang: "vorab",
    antwort: "json",
    veraendernd: false,
    eingabe: setupConnectionTestInput,
    nachweis: "einrichtungs_code",
    limits: ["verbindungstestIp", "einrichtungIp"],
    nurVorEinrichtung: true,
  },
  /**
   * Prüft nur den Einrichtungs-Code, damit ein falscher Code schon im ersten Schritt auffällt.
   * Speichert nichts. Ein falscher Code zählt auf `einrichtungIp`, dasselbe Limit wie beim
   * Abschließen und beim Verbindungstest; das Raten wird dadurch nicht erleichtert.
   */
  einrichtungCodePruefen: {
    methode: "POST",
    pfad: "/api/einrichtung/code-pruefen",
    zugang: "vorab",
    antwort: "json",
    veraendernd: false,
    eingabe: setupCodeCheckInput,
    nachweis: "einrichtungs_code",
    limits: ["einrichtungIp"],
    nurVorEinrichtung: true,
  },
  einrichtungAbschliessen: {
    methode: "POST",
    pfad: "/api/einrichtung",
    zugang: "vorab",
    antwort: "json",
    veraendernd: true,
    aktion: "einrichtung.abschliessen",
    eingabe: setupInput,
    nachweis: "einrichtungs_code",
    limits: ["einrichtungIp"],
    nurVorEinrichtung: true,
  },

  /**
   * Limits je Adresse sperren (15 Minuten, dann bis zu 24 Stunden); das Gesamt-Limit bremst alle
   * zusammen auf einen Versuch je Takt, bekannte Geräte ausgenommen (siehe `rate-limit.ts`).
   */
  anmelden: {
    methode: "POST",
    pfad: "/api/zugang/anmelden",
    zugang: "vorab",
    antwort: "json",
    veraendernd: true,
    aktion: "zugang.anmelden",
    eingabe: loginInput,
    nachweis: "passwort",
    limits: ["anmeldenIp", "anmeldenIpTag", "anmeldenGesamt"],
  },
  abmelden: {
    methode: "POST",
    pfad: "/api/zugang/abmelden",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: true,
    aktion: "zugang.abmelden",
  },
  alleAbmelden: {
    methode: "POST",
    pfad: "/api/zugang/alle-abmelden",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: true,
    aktion: "zugang.alle_abmelden",
  },
  sitzungen: {
    methode: "GET",
    pfad: "/api/zugang/sitzungen",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: false,
  },
  geraete: {
    methode: "GET",
    pfad: "/api/zugang/geraete",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: false,
  },
  geraetEntfernen: {
    methode: "POST",
    pfad: "/api/zugang/geraete/:id/entfernen",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: true,
    aktion: "geraet.entfernen",
  },
  passwortAendern: {
    methode: "POST",
    pfad: "/api/zugang/passwort",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: true,
    aktion: "zugang.passwort_aendern",
    eingabe: passwordChangeInput,
    limits: ["passwortAendern"],
    beiLimitAbmelden: true,
  },

  unterhaltungen: {
    methode: "GET",
    pfad: "/api/unterhaltungen",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: false,
  },
  unterhaltungAnlegen: {
    methode: "POST",
    pfad: "/api/unterhaltungen",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: true,
    aktion: "unterhaltung.anlegen",
    eingabe: conversationCreateInput,
  },
  unterhaltung: {
    methode: "GET",
    pfad: "/api/unterhaltungen/:id",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: false,
  },
  unterhaltungUmbenennen: {
    methode: "PATCH",
    pfad: "/api/unterhaltungen/:id",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: true,
    aktion: "unterhaltung.umbenennen",
    eingabe: conversationRenameInput,
  },
  unterhaltungLoeschen: {
    methode: "DELETE",
    pfad: "/api/unterhaltungen/:id",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: true,
    aktion: "unterhaltung.loeschen",
  },
  nachrichten: {
    methode: "GET",
    pfad: "/api/unterhaltungen/:id/nachrichten",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: false,
  },
  nachrichtSenden: {
    methode: "POST",
    pfad: "/api/unterhaltungen/:id/nachrichten",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: true,
    aktion: "nachricht.senden",
    eingabe: sendMessageInput,
    limits: ["nachricht"],
    koerperBytes: GROESSTER_KOERPER_BYTES,
  },
  ereignisse: {
    methode: "GET",
    pfad: "/api/unterhaltungen/:id/ereignisse",
    zugang: "besitzer",
    antwort: "sse",
    veraendernd: false,
  },
  unterhaltungSchleuse: {
    methode: "PUT",
    pfad: "/api/unterhaltungen/:id/schleuse",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: true,
    aktion: "schleuse.umschalten",
    eingabe: schleuseInput,
  },
  laufAbbrechen: {
    methode: "POST",
    pfad: "/api/unterhaltungen/:id/laeufe/:laufId/abbrechen",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: true,
    aktion: "lauf.abbrechen",
  },

  bot: {
    methode: "GET",
    pfad: "/api/bot",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: false,
  },
  botAendern: {
    methode: "PUT",
    pfad: "/api/bot",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: true,
    aktion: "bot.aendern",
    eingabe: botInput,
    koerperBytes: 64 * 1024,
  },
  botModell: {
    methode: "PUT",
    pfad: "/api/bot/modell",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: true,
    aktion: "modell.waehlen",
    eingabe: modelChoiceInput,
  },

  anbieterListe: {
    methode: "GET",
    pfad: "/api/anbieter",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: false,
  },
  anbieterAnlegen: {
    methode: "POST",
    pfad: "/api/anbieter",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: true,
    aktion: "anbieter.speichern",
    eingabe: providerInput,
  },
  anbieterAendern: {
    methode: "PUT",
    pfad: "/api/anbieter/:id",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: true,
    aktion: "anbieter.speichern",
    eingabe: providerInput,
  },
  anbieterLoeschen: {
    methode: "DELETE",
    pfad: "/api/anbieter/:id",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: true,
    aktion: "anbieter.loeschen",
  },
  anbieterVerbindungstest: {
    methode: "POST",
    pfad: "/api/anbieter/verbindungstest",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: false,
    eingabe: connectionTestInput,
    limits: ["verbindungstest"],
  },
  /** Holt die Modell-Liste beim Anbieter und gleicht sie mit den gespeicherten Modellen ab. */
  anbieterModelle: {
    methode: "POST",
    pfad: "/api/anbieter/:id/modelle",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: true,
    aktion: "anbieter.speichern",
  },
  /**
   * Routing-Regel (nur EUrouter) prüfen und als wählbaren Eintrag speichern. Die Prüfung ist eine
   * sehr kleine echte Anfrage an ein Modell; sie zählt auf das Limit des Verbindungstests.
   */
  anbieterRegelHinzufuegen: {
    methode: "POST",
    pfad: "/api/anbieter/:id/regeln",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: true,
    aktion: "anbieter.speichern",
    eingabe: routingRuleInput,
    limits: ["verbindungstest"],
  },
  /** Gespeicherte Routing-Regel entfernen. */
  anbieterRegelEntfernen: {
    methode: "DELETE",
    pfad: "/api/anbieter/:id/regeln/:modellId",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: true,
    aktion: "anbieter.speichern",
  },
  /**
   * Zweiter Schlüssel eines EUrouter-Eintrags, nur zum Lesen der Routing-Regeln des Kontos. Wird
   * nur gespeichert, wenn die Regel-Liste damit gelesen werden kann.
   */
  anbieterVerwaltungsschluesselSetzen: {
    methode: "PUT",
    pfad: "/api/anbieter/:id/verwaltungsschluessel",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: true,
    aktion: "anbieter.speichern",
    eingabe: managementKeyInput,
    limits: ["verbindungstest"],
  },
  /** Zweiten Schlüssel entfernen; gelesene Vorgaben der Regeln gehen mit. */
  anbieterVerwaltungsschluesselEntfernen: {
    methode: "DELETE",
    pfad: "/api/anbieter/:id/verwaltungsschluessel",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: true,
    aktion: "anbieter.speichern",
  },
  /** Regel-Liste des Kontos lesen (mit dem zweiten Schlüssel); schreibt nichts. */
  anbieterRegelListe: {
    methode: "POST",
    pfad: "/api/anbieter/:id/regeln/liste",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: false,
    limits: ["verbindungstest"],
  },
  /** Gelesene Vorgaben einer oder aller gespeicherten Regeln erneut prüfen und speichern. */
  anbieterRegelNeuPruefen: {
    methode: "POST",
    pfad: "/api/anbieter/:id/regeln/neu-pruefen",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: true,
    aktion: "anbieter.speichern",
    eingabe: ruleRecheckInput,
    limits: ["verbindungstest"],
  },
  /** Modell-Liste beim Anbieter lesen, ohne etwas zu speichern (Seite öffnen schreibt nichts). */
  anbieterModelleLesen: {
    methode: "POST",
    pfad: "/api/anbieter/:id/modelle/lesen",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: false,
  },

  datenschleuse: {
    methode: "GET",
    pfad: "/api/datenschleuse",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: false,
  },
  datenschleuseStandard: {
    methode: "PUT",
    pfad: "/api/datenschleuse/standard",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: true,
    aktion: "schleuse.umschalten",
    eingabe: schleuseInput,
  },

  einstellungen: {
    methode: "GET",
    pfad: "/api/einstellungen",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: false,
  },
  einstellungenAendern: {
    methode: "PATCH",
    pfad: "/api/einstellungen",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: true,
    aktion: "einstellung.aendern",
    eingabe: settingsInput,
  },

  belege: {
    methode: "GET",
    pfad: "/api/belege",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: false,
    eingabe: receiptListQuery,
  },
  beleg: {
    methode: "GET",
    pfad: "/api/belege/:id",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: false,
  },
  belegPruefung: {
    methode: "GET",
    pfad: "/api/belege/:id/pruefung",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: false,
  },
  belegeKette: {
    methode: "GET",
    pfad: "/api/belege/kette",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: false,
    eingabe: receiptChainQuery,
  },
  belegeSchluessel: {
    methode: "GET",
    pfad: "/api/belege/schluessel",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: false,
  },
  belegeExport: {
    methode: "POST",
    pfad: "/api/belege/export",
    zugang: "besitzer",
    antwort: "download",
    veraendernd: true,
    aktion: "belege.exportieren",
  },
  regeln: {
    methode: "GET",
    pfad: "/api/regeln",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: false,
  },

  // Bekannte Geräte: Hinweis bei Anmeldung von einem neuen Gerät
  /** „Das war ich“: schließt auf diesem Gerät den Hinweis auf neue Anmeldungen. */
  geraeteHinweisBestaetigen: {
    methode: "POST",
    pfad: "/api/zugang/geraete/hinweis",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: true,
    aktion: "geraet.bestaetigen",
  },
  /**
   * Not-Aus an oder aus. Einschalten genügt die Sitzung; Aufheben verlangt das aktuelle Passwort
   * (Vorbedingung V-10). Versuche mit Passwort zählen auf `passwortAendern` (in der Route, damit
   * das Einschalten nie zählt).
   */
  notausUmschalten: {
    methode: "PUT",
    pfad: "/api/notaus",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: true,
    aktion: "notaus.umschalten",
    eingabe: killSwitchInput,
  },
  /** Selbsttest der Installation: liest nur, nennt keine Geheimnisse und keine Adressen. */
  selbsttest: {
    methode: "GET",
    pfad: "/api/selbsttest",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: false,
  },

  /** Sucht in Titeln und Nachrichten aller Unterhaltungen (seitenweise, gezählt je Besitzer). */
  suche: {
    methode: "GET",
    pfad: "/api/suche",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: false,
    eingabe: conversationSearchQuery,
    limits: ["suche"],
  },
  /** Eine Unterhaltung als Markdown-Datei; der Export selbst bekommt Belege. */
  unterhaltungExport: {
    methode: "POST",
    pfad: "/api/unterhaltungen/:id/export",
    zugang: "besitzer",
    antwort: "download",
    veraendernd: true,
    aktion: "unterhaltung.exportieren",
  },
  /** Die letzte Antwort neu erzeugen: neuer Lauf zur selben Nachricht, die alte bleibt erhalten. */
  antwortNeuErzeugen: {
    methode: "POST",
    pfad: "/api/unterhaltungen/:id/antworten/:antwortId/neu",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: true,
    aktion: "antwort.neu_erzeugen",
    limits: ["nachricht"],
  },
} as const satisfies Record<string, RoutenDefinition>;

export type RoutenName = keyof typeof API_ROUTEN;

/** Verändernde Routen, für die die Verträge noch keine Aktion des Tors kennen. */
export const ROUTEN_OHNE_AKTION = [] as const satisfies readonly RoutenName[];

type ParameterNamen<P extends string> = P extends `${string}:${infer Name}/${infer Rest}`
  ? Name | ParameterNamen<`/${Rest}`>
  : P extends `${string}:${infer Name}`
    ? Name
    : never;

/** Parameter, die der Pfad einer Route braucht, z. B. `{ id: string }`. */
export type RoutenParameter<N extends RoutenName> = {
  [K in ParameterNamen<(typeof API_ROUTEN)[N]["pfad"]>]: string;
};

/** Setzt die Parameter in den Pfad einer Route ein (URL-kodiert). */
export function routenPfad<N extends RoutenName>(name: N, parameter: RoutenParameter<N>): string {
  const werte = parameter as Record<string, string>;
  return API_ROUTEN[name].pfad.replace(/:([A-Za-z]+)/g, (_, key: string) => {
    const wert = werte[key];
    if (wert === undefined) throw new TypeError(`Parameter fehlt: ${key}`);
    return encodeURIComponent(wert);
  });
}

/** Ordner der Route unter `src/app`, z. B. `api/unterhaltungen/[id]/nachrichten`. */
export function routenOrdner(name: RoutenName): string {
  return API_ROUTEN[name].pfad.slice(1).replace(/:([A-Za-z]+)/g, "[$1]");
}

/** Grenze für den Körper einer Route (`koerperBytes`, sonst der Standard). */
export function koerperGrenze(def: Pick<RoutenDefinition, "koerperBytes">): number {
  return def.koerperBytes ?? STANDARD_KOERPER_BYTES;
}

const PFAD_MUSTER: readonly { muster: RegExp; methode: Methode; grenze: number }[] = Object.values(
  API_ROUTEN as Record<string, RoutenDefinition>,
).map((def) => ({
  muster: new RegExp(`^${def.pfad.replace(/:[A-Za-z]+/g, "[^/]+")}/?$`),
  methode: def.methode,
  grenze: koerperGrenze(def),
}));

/**
 * Grenze für den Körper einer Anfrage an `pfad` mit `methode`: die der passenden Route, sonst der
 * Standard. Für den Proxy, der vor jeder Route entscheidet.
 */
export function koerperGrenzeFuerPfad(pfad: string, methode: string): number {
  const gross = methode.toUpperCase();
  for (const eintrag of PFAD_MUSTER) {
    if (eintrag.methode === gross && eintrag.muster.test(pfad)) return eintrag.grenze;
  }
  return STANDARD_KOERPER_BYTES;
}
