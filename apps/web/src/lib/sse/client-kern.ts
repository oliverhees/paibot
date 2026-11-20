/**
 * PaiBot – Ereignis-Strom im Browser ohne React: Ereignisse annehmen und entdoppeln,
 * Verbindungszustand führen, nach endgültigem Abbruch selbst neu verbinden.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import {
  CONVERSATION_EVENT_TYPES,
  type ConversationEvent,
  SSE_RETRY_MS,
  safeDecodeEvent,
} from "@paibot/shared/ereignisse";
import type { ConversationId } from "@paibot/shared/ids";
import { routenPfad } from "../routen";
import { NACH_PARAMETER } from "./ereignis-start";

/** Zustand der Verbindung für die Oberfläche. */
export type VerbindungsZustand = "verbunden" | "verbindet_neu" | "getrennt";

/** Was den Zustand ändert. */
export type VerbindungsAnlass =
  | "geoeffnet"
  | "unterbrochen"
  | "neuer_versuch"
  | "aufgegeben"
  | "geschlossen";

/** Reiner Zustandswechsel. Nach `geschlossen` bleibt die Verbindung getrennt. */
export function naechsterZustand(
  zustand: VerbindungsZustand,
  anlass: VerbindungsAnlass,
): VerbindungsZustand {
  switch (anlass) {
    case "geoeffnet":
      return "verbunden";
    case "unterbrochen":
    case "neuer_versuch":
      return "verbindet_neu";
    case "aufgegeben":
    case "geschlossen":
      return "getrennt";
    default:
      return zustand;
  }
}

/** Kern: letzte angenommene Nummer der Unterhaltung. */
export interface EreignisKern {
  conversationId: ConversationId;
  letzteSeq: number;
}

/**
 * Nimmt rohe `data:`-Inhalte an. Liefert das Ereignis, wenn es gültig ist, zur Unterhaltung gehört
 * und eine höhere Nummer hat als alles bisher; sonst `undefined` (Doppel, alt, fremd, kaputt).
 */
export function annehmen(
  kern: EreignisKern,
  daten: unknown,
): { kern: EreignisKern; ereignis?: ConversationEvent } {
  if (typeof daten !== "string") return { kern };
  const ereignis = safeDecodeEvent(daten);
  if (ereignis === undefined) return { kern };
  if (ereignis.conversationId !== kern.conversationId) return { kern };
  if (ereignis.seq <= kern.letzteSeq) return { kern };
  return { kern: { ...kern, letzteSeq: ereignis.seq }, ereignis };
}

/** Adresse des Stroms; `nachSeq > 0` setzt nach dieser Nummer fort. */
export function ereignisUrl(conversationId: ConversationId, nachSeq = 0): string {
  const pfad = routenPfad("ereignisse", { id: conversationId });
  return nachSeq > 0 ? `${pfad}?${NACH_PARAMETER}=${nachSeq}` : pfad;
}

/** Was vom Browser-`EventSource` gebraucht wird. */
export interface EreignisQuelle {
  readonly readyState: number;
  onopen: ((ereignis: Event) => unknown) | null;
  onerror: ((ereignis: Event) => unknown) | null;
  addEventListener(typ: string, hoerer: (ereignis: MessageEvent) => void): void;
  close(): void;
}

/** `EventSource.CLOSED`. */
export const GESCHLOSSEN = 2;

export interface VerbindungsOptionen {
  conversationId: ConversationId;
  /** Nummer, nach der begonnen wird (z. B. letzte Nummer aus dem geladenen Verlauf). */
  nachSeq?: number;
  onEvent: (ereignis: ConversationEvent) => void;
  onZustand?: (zustand: VerbindungsZustand) => void;
  /** Erzeugt die Quelle; Standard `new EventSource(url)`. */
  erzeugen?: (url: string) => EreignisQuelle;
  /** Wartezeit vor dem eigenen Neuverbinden nach `versuch` Fehlschlägen. */
  wartenMs?: (versuch: number) => number;
  /** Nach so vielen erfolglosen eigenen Versuchen in Folge: getrennt. */
  maxVersuche?: number;
  uhr?: {
    setTimeout(fn: () => void, ms: number): unknown;
    clearTimeout(handle: unknown): void;
  };
}

export interface Verbindung {
  readonly zustand: VerbindungsZustand;
  readonly letzteSeq: number;
  /** Baut sofort eine neue Verbindung ab der letzten Nummer auf (z. B. nach „getrennt“). */
  neuVerbinden(): void;
  /** Trennt endgültig und räumt auf. */
  schliessen(): void;
}

/** Standard-Wartezeit: wie `retry`, dann verdoppelt, höchstens 30 s. */
export function standardWarten(versuch: number): number {
  return Math.min(30_000, SSE_RETRY_MS * 2 ** Math.max(0, versuch - 1));
}

/**
 * Verbindet mit dem Strom. Kleine Unterbrechungen überbrückt der Browser selbst (mit
 * `Last-Event-ID`). Gibt er auf (z. B. nach einer Fehlerantwort), verbindet diese Funktion nach
 * einer Wartezeit selbst neu und nennt dabei die letzte Nummer.
 */
export function verbindeEreignisse(optionen: VerbindungsOptionen): Verbindung {
  const erzeugen =
    optionen.erzeugen ?? ((url: string) => new EventSource(url) as unknown as EreignisQuelle);
  const wartenMs = optionen.wartenMs ?? standardWarten;
  const maxVersuche = optionen.maxVersuche ?? 8;
  const uhr = optionen.uhr ?? {
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  };

  let kern: EreignisKern = {
    conversationId: optionen.conversationId,
    letzteSeq: optionen.nachSeq ?? 0,
  };
  let zustand: VerbindungsZustand = "verbindet_neu";
  let quelle: EreignisQuelle | undefined;
  let zeitgeber: unknown;
  let versuche = 0;
  let beendet = false;

  function wechseln(anlass: VerbindungsAnlass): void {
    const neu = naechsterZustand(zustand, anlass);
    if (neu === zustand) return;
    zustand = neu;
    optionen.onZustand?.(neu);
  }

  function beiDaten(nachricht: MessageEvent): void {
    if (beendet) return;
    const ergebnis = annehmen(kern, nachricht.data);
    kern = ergebnis.kern;
    if (ergebnis.ereignis) optionen.onEvent(ergebnis.ereignis);
  }

  function schliesseQuelle(): void {
    if (quelle === undefined) return;
    quelle.onopen = null;
    quelle.onerror = null;
    quelle.close();
    quelle = undefined;
  }

  function oeffnen(): void {
    if (beendet) return;
    schliesseQuelle();
    const neu = erzeugen(ereignisUrl(kern.conversationId, kern.letzteSeq));
    quelle = neu;
    neu.onopen = () => {
      if (quelle !== neu) return;
      versuche = 0;
      wechseln("geoeffnet");
    };
    neu.onerror = () => {
      if (quelle !== neu) return;
      if (neu.readyState !== GESCHLOSSEN) {
        wechseln("unterbrochen");
        return;
      }
      schliesseQuelle();
      versuche += 1;
      if (versuche > maxVersuche) {
        wechseln("aufgegeben");
        return;
      }
      wechseln("neuer_versuch");
      zeitgeber = uhr.setTimeout(() => {
        zeitgeber = undefined;
        oeffnen();
      }, wartenMs(versuche));
    };
    for (const typ of CONVERSATION_EVENT_TYPES) neu.addEventListener(typ, beiDaten);
  }

  oeffnen();

  return {
    get zustand() {
      return zustand;
    },
    get letzteSeq() {
      return kern.letzteSeq;
    },
    neuVerbinden() {
      if (beendet) return;
      if (zeitgeber !== undefined) uhr.clearTimeout(zeitgeber);
      zeitgeber = undefined;
      versuche = 0;
      wechseln("neuer_versuch");
      oeffnen();
    },
    schliessen() {
      if (beendet) return;
      if (zeitgeber !== undefined) uhr.clearTimeout(zeitgeber);
      zeitgeber = undefined;
      schliesseQuelle();
      wechseln("geschlossen");
      beendet = true;
    },
  };
}
