/**
 * PaiBot – was der Zugang und der Rahmen der API-Routen zum Arbeiten brauchen: Datenbank,
 * Umgebung, Schlüssel, Uhr, Einrichtungs-Code; im Betrieb einmal je Prozess, in Tests ersetzbar.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { Database } from "@paibot/db";
import {
  type ConnectionTestResult,
  checkRoutingRule,
  type RoutingRuleCheck,
  schleuseFromEnv,
  testConnection,
} from "@paibot/llm";
import type { ReceiptKeys } from "@paibot/receipts";
import { datenbank } from "../datenbank";
import { belegSchluesselAus, type Uhr } from "../gate";
import type { UnterAnbieterListe } from "../modelle/herkunft";
import { unterAnbieterListe } from "../modelle/unter-anbieter";
import { stand } from "../stand";
import {
  appOrigin,
  type EinrichtungsAnbieter,
  einrichtungsAnbieter,
  hinterProxy,
  prozessSchluessel,
  type Schluessel,
  type VorlagenSchluessel,
  vorlageAnbieter,
} from "../umgebung";
import { type CodeHalter, prozessCodeHalter } from "./einrichtungs-code";

export interface ZugangsLog {
  info(zeile: string): void;
  warn(zeile: string): void;
  error(zeile: string): void;
}

export interface ZugangsDienste {
  db(): Database;
  /** Origin aus `APP_URL`; ohne ihn werden verändernde Anfragen abgelehnt. */
  appOrigin(): string | undefined;
  /** `TRUST_PROXY=1`: Adresse des Clients aus dem rechten Eintrag von `X-Forwarded-For`. */
  hinterProxy(): boolean;
  schluessel(): Schluessel;
  /** Signaturschlüssel der Belege (nach der Einrichtung). */
  belegSchluessel(): ReceiptKeys;
  uhr: Uhr;
  warten(ms: number): Promise<void>;
  code: CodeHalter;
  einrichtungsAnbieter(): EinrichtungsAnbieter;
  /** Anbieter einer Vorlage (EUrouter, Mistral) für Auswahl, Anlegen und Prüfung der Adresse. */
  vorlage(schluessel: VorlagenSchluessel): EinrichtungsAnbieter;
  /** Prüft eine Routing-Regel mit einer sehr kleinen echten Anfrage (kostet wenige Token). */
  regelPruefen(
    anbieter: EinrichtungsAnbieter,
    schluessel: string,
    name: string,
  ): Promise<RoutingRuleCheck>;
  /** Öffentliche Anbieter-Liste von EUrouter (Namen, Sitz), zwischengespeichert. */
  unterAnbieter(
    anbieter: Pick<EinrichtungsAnbieter, "templateKey" | "baseUrl" | "region"> | undefined,
  ): Promise<UnterAnbieterListe | undefined>;
  schleuseInstalliert(): boolean;
  verbindungTesten(
    anbieter: EinrichtungsAnbieter,
    schluessel: string,
  ): Promise<ConnectionTestResult>;
  stand(): string;
  log: ZugangsLog;
}

const konsole: ZugangsLog = {
  info: (zeile) => console.log(zeile),
  warn: (zeile) => console.warn(`[paibot] ${zeile}`),
  error: (zeile) => console.error(`[paibot] ${zeile}`),
};

const SCHLUESSEL = Symbol.for("paibot.web.zugangs-dienste");
const ERSATZ = Symbol.for("paibot.web.zugangs-dienste.ersatz");
type Halter = {
  [SCHLUESSEL]?: { url: string; schluessel: ReceiptKeys };
  [ERSATZ]?: ZugangsDienste;
};

/**
 * Nur für Tests: ersetzt die Dienste des Prozesses (z. B. durch eine Test-Datenbank), damit die
 * echten Routen-Module und der Proxy geprüft werden können. `undefined` setzt zurück.
 */
export function _ersetzeProzessDienste(dienste: ZugangsDienste | undefined): void {
  (globalThis as Halter)[ERSATZ] = dienste;
}

/** Die Dienste des laufenden Prozesses (Umgebung aus `process.env`). */
export function prozessDienste(): ZugangsDienste {
  const ersatz = (globalThis as Halter)[ERSATZ];
  if (ersatz !== undefined) return ersatz;
  return {
    db: datenbank,
    appOrigin: () => appOrigin(process.env),
    hinterProxy: () => hinterProxy(process.env),
    schluessel: prozessSchluessel,
    belegSchluessel() {
      const url = process.env.DATABASE_URL ?? "";
      const halter = globalThis as Halter;
      const vorhanden = halter[SCHLUESSEL];
      if (vorhanden && vorhanden.url === url) return vorhanden.schluessel;
      const schluessel = belegSchluesselAus(datenbank(), prozessSchluessel().belege);
      halter[SCHLUESSEL] = { url, schluessel };
      return schluessel;
    },
    uhr: { now: () => new Date() },
    warten: (ms) => new Promise((fertig) => setTimeout(fertig, ms)),
    code: prozessCodeHalter(),
    einrichtungsAnbieter: () => einrichtungsAnbieter(process.env),
    vorlage: (schluessel) => vorlageAnbieter(schluessel, process.env),
    regelPruefen: (anbieter, schluessel, name) => checkRoutingRule(anbieter, schluessel, name),
    unterAnbieter: (anbieter) => unterAnbieterListe(anbieter),
    schleuseInstalliert: () => {
      try {
        return schleuseFromEnv(process.env) !== undefined;
      } catch {
        return false;
      }
    },
    verbindungTesten: (anbieter, schluessel) =>
      testConnection({ baseUrl: anbieter.baseUrl, region: anbieter.region }, schluessel),
    stand,
    log: konsole,
  };
}
