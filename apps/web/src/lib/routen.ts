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
  loginInput,
  modelChoiceInput,
  passwordChangeInput,
  providerInput,
  receiptListQuery,
  schleuseInput,
  sendMessageInput,
  settingsInput,
  setupConnectionTestInput,
  setupInput,
} from "@paibot/shared/eingaben";
import type { RateLimitName } from "@paibot/shared/konstanten";
import type { z } from "zod";

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
   * Rate-Limits (`RATE_LIMITS`), die die Route vor jeder weiteren Arbeit zählt, in dieser
   * Reihenfolge. Bei `verzoegern` wartet die Anfrage, bei `sperren` antwortet sie mit
   * `zu_viele_versuche`.
   */
  limits?: readonly RateLimitName[];
  /** Nur bis zum Ende der Einrichtung erreichbar; danach `einrichtung_fertig` (409). */
  nurVorEinrichtung?: true;
}

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

  /** Limit je Adresse sperrt, das Gesamt-Limit verzögert nur (siehe `RATE_LIMITS`). */
  anmelden: {
    methode: "POST",
    pfad: "/api/zugang/anmelden",
    zugang: "vorab",
    antwort: "json",
    veraendernd: true,
    aktion: "zugang.anmelden",
    eingabe: loginInput,
    nachweis: "passwort",
    limits: ["anmeldenIp", "anmeldenGesamt"],
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
  passwortAendern: {
    methode: "POST",
    pfad: "/api/zugang/passwort",
    zugang: "besitzer",
    antwort: "json",
    veraendernd: true,
    aktion: "zugang.passwort_aendern",
    eingabe: passwordChangeInput,
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
  anbieterModelle: {
    methode: "GET",
    pfad: "/api/anbieter/:id/modelle",
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
