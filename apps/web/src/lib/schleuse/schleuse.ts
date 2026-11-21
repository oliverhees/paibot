/**
 * PaiBot – Datenschleuse aus Sicht der Web-App: eingerichtet ja/nein, Ergebnis der letzten
 * geschützten Anfrage (aus den Belegen) und der Standard für neue Unterhaltungen.
 *
 * Die Web-App hängt nicht im Netz der Datenschleuse und fragt sie deshalb nie selbst ab. Was sie
 * weiß: den Zustand, den der Worker regelmäßig prüft und in die Datenbank schreibt
 * (`repo.schleuse`), ob die Datenschleuse in ihrer eigenen Umgebung eingerichtet ist, und was der
 * Worker bei der letzten Modell-Anfrage mit eingeschalteter Datenschleuse festgehalten hat.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { type Database, repo, type SchleuseZustandWert } from "@paibot/db";
import type { ReceiptEntry } from "@paibot/shared/belege";
import type { ErrorCode } from "@paibot/shared/fehler";
import type { SchleuseMode } from "@paibot/shared/objekte";
import type { RoutenKontext } from "../api/route";
import type { ZugangsDienste } from "../zugang/dienste";

/** Doku-Seite mit der Anleitung zum Zuschalten. */
export const DOKU_DATENSCHLEUSE =
  "https://github.com/oliverhees/paibot/blob/main/docs/funktion-datenschleuse.md";

/**
 * Ergebnis der letzten Modell-Anfrage mit eingeschalteter Datenschleuse:
 * - `bereit`: Datenschleuse bereit, Anfrage ging maskiert an das Modell;
 * - `blockiert`: Datenschleuse hat die Anfrage gestoppt (sie lief also);
 * - `nicht_bereit`: Worker fand die Datenschleuse nicht bereit (läuft nicht oder Schlüssel falsch);
 * - `anbieter`: Datenschleuse bereit, der Anbieter hat die Anfrage abgelehnt (`code`).
 */
export type LetzterLaufArt = "bereit" | "blockiert" | "nicht_bereit" | "anbieter";

export interface LetzterLauf {
  art: LetzterLaufArt;
  zeit: string;
  code?: ErrorCode;
}

/** Zustand, den der Worker zuletzt geprüft und gemeldet hat. */
export interface WorkerMeldung {
  zustand: SchleuseZustandWert;
  /** Wann der Worker geprüft hat (ISO). */
  geprueft: string;
  /** Länger als `VERALTET_NACH_MS` keine Meldung: Der Worker läuft vermutlich nicht. */
  veraltet: boolean;
}

export interface SchleuseZustand {
  eingerichtet: boolean;
  standard: SchleuseMode;
  /** Fehlt, solange der Worker noch nie gemeldet hat. */
  worker?: WorkerMeldung;
  letzterLauf?: LetzterLauf;
}

/**
 * Der Worker meldet alle 30 Sekunden. Kam seit fünf Minuten nichts, gilt die Meldung als veraltet
 * (Worker gestoppt oder ohne Verbindung zur Datenbank).
 */
export const VERALTET_NACH_MS = 5 * 60_000;

/** Meldung des Workers mit Alter; rein, damit sie sich ohne Datenbank prüfen lässt. */
export function workerMeldungAus(
  meldung: { state: SchleuseZustandWert; checkedAt: Date } | undefined,
  jetzt: Date,
): WorkerMeldung | undefined {
  if (meldung === undefined) return undefined;
  return {
    zustand: meldung.state,
    geprueft: meldung.checkedAt.toISOString(),
    veraltet: jetzt.getTime() - meldung.checkedAt.getTime() > VERALTET_NACH_MS,
  };
}

/**
 * Ist die Datenschleuse eingerichtet? Ja, wenn der Worker sie in seiner Umgebung hat (seine letzte
 * Meldung ist nicht „aus“) oder wenn sie in der Umgebung der Web-App steht (Entwicklung). Im Betrieb
 * mit Compose kennt nur der Worker die Datenschleuse; die Web-App hat bewusst keinen Weg dorthin.
 */
export function eingerichtetAus(webUmgebung: boolean, worker: WorkerMeldung | undefined): boolean {
  return webUmgebung || (worker !== undefined && worker.zustand !== "aus");
}

/** Liest die Meldung des Workers und leitet daraus „eingerichtet“ ab. */
export async function schleuseEingerichtet(
  db: Database,
  d: ZugangsDienste,
  jetzt = new Date(),
): Promise<boolean> {
  return eingerichtetAus(
    d.schleuseInstalliert(),
    workerMeldungAus(await repo.schleuse.get(db), jetzt),
  );
}

/** Wie viele Belege der Aktion `modell.anfragen` höchstens durchsucht werden. */
const SUCHTIEFE = 200;

interface Fakten {
  requestedMode?: unknown;
  schleuseReachable?: unknown;
}

/**
 * Liest aus den Belegen der Aktion `modell.anfragen` die letzte Anfrage mit eingeschalteter
 * Datenschleuse: Entscheidung (mit dem vom Worker gemeldeten Fakt `schleuseReachable`) und
 * Ergebnis derselben Aktion. Inhalte stehen in Belegen nicht, nur Fakten und Codes.
 */
export async function letzterSchleusenLauf(db: Database): Promise<LetzterLauf | undefined> {
  const seite = await repo.belege.listPage(db, { action: "modell.anfragen", limit: SUCHTIEFE });
  return letzterLaufAus(seite.items);
}

/** Wie `letzterSchleusenLauf`, rein über eine Liste von Belegen (neueste zuerst). */
export function letzterLaufAus(items: readonly ReceiptEntry[]): LetzterLauf | undefined {
  const seite = { items };
  const ergebnisse = new Map<string, { status: string; code?: ErrorCode }>();
  for (const eintrag of seite.items) {
    const body = eintrag.body;
    if (body.type === "result") ergebnisse.set(body.action.actionId, body.result);
  }
  for (const eintrag of seite.items) {
    const body = eintrag.body;
    if (body.type !== "decision") continue;
    const fakten = body.facts as Fakten;
    if (fakten.requestedMode !== "on") continue;
    const zeit = body.time;
    if (fakten.schleuseReachable !== true) return { art: "nicht_bereit", zeit };
    const ergebnis = ergebnisse.get(body.action.actionId);
    if (body.decision.outcome !== "allow" || ergebnis === undefined) {
      return { art: "nicht_bereit", zeit };
    }
    if (ergebnis.status === "ok") return { art: "bereit", zeit };
    if (ergebnis.code === "schleuse_blockiert") return { art: "blockiert", zeit };
    return { art: "anbieter", zeit, code: ergebnis.code ?? "intern" };
  }
  return undefined;
}

export async function schleuseZustand(
  db: Database,
  d: ZugangsDienste,
  jetzt = new Date(),
): Promise<SchleuseZustand> {
  const einstellungen = await repo.settings.get(db);
  const letzterLauf = await letzterSchleusenLauf(db);
  const worker = workerMeldungAus(await repo.schleuse.get(db), jetzt);
  return {
    eingerichtet: eingerichtetAus(d.schleuseInstalliert(), worker),
    standard: einstellungen?.schleuseModeDefault ?? "off",
    ...(worker === undefined ? {} : { worker }),
    ...(letzterLauf === undefined ? {} : { letzterLauf }),
  };
}

/** `GET /api/datenschleuse`. */
export async function datenschleuseLesen(k: RoutenKontext<"datenschleuse">) {
  return { daten: await schleuseZustand(k.db, k.dienste) };
}

/**
 * `PUT /api/datenschleuse/standard`: Standard für neue Unterhaltungen. „An“ nur, wenn die
 * Datenschleuse eingerichtet ist; das prüft das Tor (Vorbedingung V-04) mit dem Fakt
 * `schleuseInstalled`, die Oberfläche bietet es vorher gar nicht erst an.
 */
export async function datenschleuseStandard(k: RoutenKontext<"datenschleuseStandard">) {
  const einstellungen = await repo.settings.get(k.db);
  const vorher = einstellungen?.schleuseModeDefault ?? "off";
  const mode = k.eingabe.mode;
  await k.tor(
    k.nachweis,
    { type: "schleuse.umschalten", target: {} },
    {
      scope: "standard",
      mode,
      previousMode: vorher,
      schleuseInstalled: await schleuseEingerichtet(k.db, k.dienste),
    },
    async () => {
      await repo.settings.update(k.db, { schleuseModeDefault: mode });
      return { value: undefined, result: { status: "ok" } };
    },
  );
  return { daten: { standard: mode } };
}
