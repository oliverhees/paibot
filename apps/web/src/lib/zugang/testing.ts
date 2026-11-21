/**
 * PaiBot – Test-Hilfen für Zugang und API-Rahmen: Dienste mit Test-Datenbank, feste Uhr,
 * Anfragen mit Cookies, Herkunft und Prüfzeichen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { randomBytes } from "node:crypto";
import type { Database } from "@paibot/db";
import { createTestDb } from "@paibot/db/testing";
import type { ConnectionTestResult, RoutingRuleCheck, RoutingRulesRead } from "@paibot/llm";
import { CSRF } from "@paibot/shared/konstanten";
import type { ListedRule } from "@paibot/shared/regelliste";
import { erstelleRahmen, type RoutenAktion } from "../api/route";
import { pruefzeichenVorab, pruefzeichenZuCookie } from "../csrf";
import { belegSchluesselAus } from "../gate";
import type { RoutenName } from "../routen";
import { schluesselAus } from "../umgebung";
import type { ZugangsDienste } from "./dienste";
import { erstelleCodeHalter } from "./einrichtungs-code";

export const TEST_ORIGIN = "http://paibot.test";
export const TEST_CODE = "K7QD-9M2F-XW4H";
export const TEST_PASSWORT = "Fahrrad-Kaffee-Mond-42";
export const TEST_SCHLUESSEL = "beispiel-schluessel-0001";
/** Routing-Regeln, die der Ersatz für den Anbieter kennt, mit dem Anbieter, der antwortet. */
export const TEST_REGELN: Record<string, { provider: string; model: string }> = {
  "Beispiel-Regel": { provider: "beispiel-nord", model: "beispiel/modell-1" },
  "Zweite Regel": { provider: "beispiel-zwei", model: "beispiel/modell-2" },
  "Regel ohne Vorgabe": { provider: "beispiel-nord", model: "beispiel/modell-1" },
  "Regel mit anderem Wert": { provider: "beispiel-nord", model: "beispiel/modell-1" },
  "Regel nur Name": { provider: "beispiel-nord", model: "beispiel/modell-1" },
};
/** Zweiter Schlüssel (nur zum Lesen der Regel-Liste), den der Ersatz für den Anbieter annimmt. */
export const TEST_VERWALTUNGSSCHLUESSEL = "beispiel-verwaltung-0002";
/** Adresse der Vorlagen im Test (eigener Rechner, damit die Prüfung der Adresse greift). */
export const TEST_VORLAGEN_URL = "http://127.0.0.1:10/v1";
export const TEST_MODELLE = [
  { slug: "beispiel/modell-a", displayName: "Beispiel-Modell A", contextWindow: 32000 },
  { slug: "beispiel/modell-b", displayName: "Beispiel-Modell B" },
];

/** Ein frisches, zufälliges `PAIBOT_SECRET` (nur im Test erzeugt). */
export function testGeheimnis(): string {
  return randomBytes(32).toString("base64");
}

export interface TestUmgebungOptionen {
  db?: Database;
  /** `TRUST_PROXY=1`? Standard: ja (Adresse bekannt). */
  hinterProxy?: boolean;
  schleuseInstalliert?: boolean;
  geheimnis?: string;
}

/** Dienste mit Test-Datenbank, steuerbarer Uhr, gezähltem Warten und Ersatz für den Anbieter. */
export async function testUmgebung(optionen: TestUmgebungOptionen = {}) {
  const db = optionen.db ?? (await createTestDb()).db;
  const geheimnis = optionen.geheimnis ?? testGeheimnis();
  const schluessel = schluesselAus({ PAIBOT_SECRET: geheimnis });
  let jetzt = new Date("2026-11-20T10:00:00.000Z");
  const gewartet: number[] = [];
  const log: string[] = [];
  const anbieterAufrufe: string[] = [];
  /** Namen der Regeln, die der Ersatz für den Anbieter prüfen sollte. */
  const regelAufrufe: string[] = [];
  let naechsterCode = TEST_CODE;
  const code = erstelleCodeHalter(() => naechsterCode);
  /** Noch laufendes `neuerCode`; `anfrage` wartet darauf. */
  let ausstehend: Promise<unknown> = Promise.resolve();
  const belegSchluessel = belegSchluesselAus(db, schluessel.belege);
  /** Schlüssel, mit denen der Ersatz die Regel-Liste lesen sollte (nur im Test sichtbar). */
  const listeAufrufe: string[] = [];
  const zustand = {
    hinterProxy: optionen.hinterProxy ?? true,
    schleuseInstalliert: optionen.schleuseInstalliert ?? false,
    /** Regeln im Konto, wie die Regel-Liste sie liefert (nur eingeschaltete). */
    kontoRegeln: [
      { name: "Beispiel-Regel", policy: { data_residency: "EU", eu_owned: true } },
      { name: "Zweite Regel", policy: { data_residency: "US" } },
    ] as ListedRule[],
    unvollstaendig: false,
    /** Setzt eine feste Antwort (z. B. Fehler); sonst gilt `kontoRegeln`. */
    listeErsatz: undefined as RoutingRulesRead | undefined,
  };
  const dienste: ZugangsDienste = {
    db: () => db,
    appOrigin: () => TEST_ORIGIN,
    hinterProxy: () => zustand.hinterProxy,
    schluessel: () => schluessel,
    belegSchluessel: () => belegSchluessel,
    uhr: { now: () => new Date(jetzt.getTime()) },
    warten: async (ms) => {
      gewartet.push(ms);
    },
    code,
    einrichtungsAnbieter: () => ({
      templateKey: "eigener",
      name: "Beispiel-Anbieter",
      baseUrl: "http://127.0.0.1:9/v1",
      region: "local",
    }),
    vorlage: (schluessel) => ({
      templateKey: schluessel,
      name: schluessel === "eurouter" ? "EUrouter" : "Mistral AI",
      baseUrl: schluessel === "eurouter" ? TEST_VORLAGEN_URL : "http://127.0.0.1:11/v1",
      region: "local",
    }),
    regelPruefen: async (_anbieter, apiKey, name): Promise<RoutingRuleCheck> => {
      regelAufrufe.push(name);
      if (apiKey !== TEST_SCHLUESSEL) return { ok: false, code: "schluessel_ungueltig" };
      const regel = TEST_REGELN[name];
      return regel === undefined
        ? { ok: false, code: "regel_unbekannt" }
        : { ok: true, servedBy: { ...regel } };
    },
    kontoRegelnLesen: async (_anbieter, key): Promise<RoutingRulesRead> => {
      listeAufrufe.push(key);
      if (zustand.listeErsatz !== undefined) return zustand.listeErsatz;
      if (key !== TEST_VERWALTUNGSSCHLUESSEL) return { ok: false, code: "schluessel_ungueltig" };
      return {
        ok: true,
        regeln: zustand.kontoRegeln.map((r) => ({ name: r.name, policy: { ...r.policy } })),
        unvollstaendig: zustand.unvollstaendig,
        uebersprungen: 0,
      };
    },
    unterAnbieter: async (anbieter) =>
      anbieter?.templateKey === "eurouter"
        ? {
            abgerufen: "2026-11-20T09:00:00.000Z",
            eintraege: { "beispiel-nord": { name: "Beispiel Nord", sitz: "NL" } },
          }
        : undefined,
    schleuseInstalliert: () => zustand.schleuseInstalliert,
    verbindungTesten: async (_anbieter, apiKey): Promise<ConnectionTestResult> => {
      anbieterAufrufe.push(apiKey);
      return apiKey === TEST_SCHLUESSEL
        ? { ok: true, models: TEST_MODELLE }
        : { ok: false, code: "schluessel_ungueltig" };
    },
    stand: () => "0.3.0+test",
    log: {
      info: (z) => log.push(z),
      warn: (z) => log.push(z),
      error: (z) => log.push(z),
    },
  };
  const rahmen = erstelleRahmen(() => dienste);
  return {
    db,
    dienste,
    schluessel,
    zustand,
    gewartet,
    log,
    anbieterAufrufe,
    regelAufrufe,
    listeAufrufe,
    rahmen,
    /**
     * Erzeugt einen neuen Code (der alte gilt nicht mehr) und speichert seinen Prüfwert. Die
     * nächste `anfrage` wartet, bis er gespeichert ist; wer selbst weiterprüft, wartet auf das
     * Ergebnis.
     */
    neuerCode(wert: string): Promise<string | undefined> {
      naechsterCode = wert;
      const neu = ausstehend.then(() => code.ersetzen(db, jetzt));
      ausstehend = neu.catch(() => undefined);
      return neu;
    },
    /** Wartet, bis ein laufendes `neuerCode` fertig ist. */
    bereit(): Promise<unknown> {
      return ausstehend;
    },
    zeit(): Date {
      return jetzt;
    },
    spaeter(ms: number) {
      jetzt = new Date(jetzt.getTime() + ms);
    },
    handler<N extends RoutenName>(name: N, aktion: RoutenAktion<N>) {
      return rahmen(name, aktion);
    },
  };
}

export type TestUmgebung = Awaited<ReturnType<typeof testUmgebung>>;

/** Einfacher Cookie-Speicher wie im Browser (nur Name und Wert, Löschen über `Max-Age=0`). */
export class Keksdose {
  readonly werte = new Map<string, string>();
  readonly zeilen: string[] = [];

  aufnehmen(antwort: Response): void {
    for (const zeile of antwort.headers.getSetCookie()) {
      this.zeilen.push(zeile);
      const [paar = ""] = zeile.split(";");
      const gleich = paar.indexOf("=");
      const name = paar.slice(0, gleich);
      const wert = paar.slice(gleich + 1);
      if (/;\s*Max-Age=0/i.test(zeile) || wert === "") this.werte.delete(name);
      else this.werte.set(name, wert);
    }
  }

  kopf(): string {
    return [...this.werte].map(([n, w]) => `${n}=${w}`).join("; ");
  }
}

export interface AnfrageOptionen {
  koerper?: unknown;
  dose?: Keksdose;
  /** `null`: keine Herkunft senden. Standard: `TEST_ORIGIN`. */
  origin?: string | null;
  /** Prüfzeichen; Standard: passend zur Dose (Sitzung, sonst Vorab). `null`: keins. */
  pruefzeichen?: string | null;
  adresse?: string;
  kopf?: Record<string, string>;
  params?: Record<string, string>;
}

/** Prüfzeichen, das die Seite für diese Cookies im Kopf hätte. */
export function pruefzeichenFuer(u: TestUmgebung, dose: Keksdose): string | undefined {
  const sitzung = dose.werte.get("pb_sitzung");
  if (sitzung) return pruefzeichenZuCookie(u.schluessel.sitzung, sitzung);
  const vorab = dose.werte.get("pb_vorab");
  return vorab ? pruefzeichenVorab(u.schluessel.sitzung, vorab) : undefined;
}

type Handler = ReturnType<TestUmgebung["rahmen"]>;

/** Schickt eine Anfrage an einen Handler und nimmt die Cookies der Antwort in die Dose. */
export async function anfrage(
  u: TestUmgebung,
  handler: Handler,
  methode: string,
  pfad: string,
  optionen: AnfrageOptionen = {},
): Promise<{
  status: number;
  body: { ok: boolean; daten?: unknown; fehler?: { code: string } };
  antwort: Response;
}> {
  await u.bereit();
  const dose = optionen.dose ?? new Keksdose();
  const kopf = new Headers(optionen.kopf);
  if (optionen.origin !== null) kopf.set("origin", optionen.origin ?? TEST_ORIGIN);
  const zeichen =
    optionen.pruefzeichen === undefined ? pruefzeichenFuer(u, dose) : optionen.pruefzeichen;
  if (zeichen) kopf.set(CSRF.header, zeichen);
  if (dose.werte.size > 0) kopf.set("cookie", dose.kopf());
  kopf.set("x-forwarded-for", optionen.adresse ?? "203.0.113.7");
  if (optionen.koerper !== undefined) kopf.set("content-type", "application/json");
  const request = new Request(`${TEST_ORIGIN}${pfad}`, {
    method: methode,
    headers: kopf,
    ...(optionen.koerper === undefined ? {} : { body: JSON.stringify(optionen.koerper) }),
  });
  const antwort = await handler(request, { params: Promise.resolve(optionen.params ?? {}) });
  dose.aufnehmen(antwort);
  const body = await antwort.clone().json();
  return { status: antwort.status, body, antwort };
}

/** Eine Dose mit frischem Vorab-Cookie (wie nach dem Laden von `/einrichtung`). */
export function vorabDose(): Keksdose {
  const dose = new Keksdose();
  dose.werte.set("pb_vorab", randomBytes(32).toString("base64url"));
  return dose;
}
