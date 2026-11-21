/**
 * PaiBot – Wer antwortet im Teamchat und was kommt als Nächstes
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

/**
 * Regeln im Teamchat als reine Funktionen: wer antwortet auf eine Nachricht, und was kommt als
 * Nächstes in einer Runde. Keine KI, kein Zugriff auf Datenbank oder Uhr.
 */

import {
  type ErwaehnungsErgebnis,
  type ErwaehnungsHinweis,
  erkenneErwaehnungen,
} from "./erwaehnungen";
import type { RaumBot } from "./namen";

/** Wer eine Nachricht im Raum geschrieben hat. Alles außer `besitzer` gilt wie ein Bot. */
export type RaumAutor = "besitzer" | "bot";

export interface RaumLage {
  /** Bots des Teams (nur sie können gerufen werden). */
  readonly mitglieder: readonly RaumBot[];
  /** Ansprechpartner, wenn eine Nachricht keine Erwähnung hat; `null` = keiner gesetzt. */
  readonly ansprechpartnerId: string | null;
  /** Bots außerhalb des Teams; nur für den Hinweis „gehört nicht zum Team“. */
  readonly andereBots?: readonly RaumBot[];
  readonly hoechstensErwaehnungen?: number;
}

export type AntwortHinweis =
  | ErwaehnungsHinweis
  | { readonly grund: "kein_ansprechpartner" }
  | { readonly grund: "ansprechpartner_pausiert"; readonly botId: string }
  | { readonly grund: "zu_viele_erwaehnungen" }
  | { readonly grund: "text_gekuerzt" };

export interface Antwortplan {
  readonly art: "erwaehnt" | "ansprechpartner" | "niemand";
  /** Bots, die antworten sollen, in der Reihenfolge, in der sie dran sind. */
  readonly antworter: readonly RaumBot[];
  readonly hinweise: readonly AntwortHinweis[];
  /** Die Nachricht darf nicht gesendet werden (zu viele Erwähnungen). */
  readonly abgelehnt: boolean;
}

const NIEMAND: Antwortplan = { art: "niemand", antworter: [], hinweise: [], abgelehnt: false };

/**
 * Wer antwortet auf eine Nachricht im Teamchat?
 *
 * - Nur die Nachricht des Besitzers wird gelesen. Von einem Bot (und von jedem unbekannten
 *   Absender) antwortet niemand; sein Text wird nicht einmal nach `@` durchsucht.
 * - Mit Erwähnung: genau die erwähnten, nicht pausierten Mitglieder, in Reihenfolge der Erwähnung.
 *   Sind alle Erwähnungen ungültig, antwortet niemand (die Person hat jemand anderen gemeint).
 * - Ohne Erwähnung: der Ansprechpartner, wenn gesetzt, Mitglied und nicht pausiert.
 * - Mehr als die erlaubte Zahl gültiger Erwähnungen: abgelehnt.
 */
export function bestimmeAntworter(
  autor: RaumAutor | string,
  text: string,
  lage: RaumLage,
): Antwortplan {
  if (autor !== "besitzer") return NIEMAND;
  const erwaehnungen: ErwaehnungsErgebnis = erkenneErwaehnungen(text, lage.mitglieder, {
    ...(lage.andereBots ? { andereBots: lage.andereBots } : {}),
    ...(lage.hoechstensErwaehnungen !== undefined
      ? { hoechstens: lage.hoechstensErwaehnungen }
      : {}),
  });
  const hinweise: AntwortHinweis[] = [...erwaehnungen.hinweise];
  if (erwaehnungen.textGekuerzt) hinweise.push({ grund: "text_gekuerzt" });

  if (erwaehnungen.zuViele) {
    return {
      art: "niemand",
      antworter: [],
      hinweise: [...hinweise, { grund: "zu_viele_erwaehnungen" }],
      abgelehnt: true,
    };
  }
  if (erwaehnungen.gueltig.length > 0) {
    return { art: "erwaehnt", antworter: erwaehnungen.gueltig, hinweise, abgelehnt: false };
  }
  if (erwaehnungen.hinweise.length > 0) {
    // Es gab Erwähnungen, aber keine gültige: nicht stillschweigend jemand anderen antworten lassen.
    return { art: "niemand", antworter: [], hinweise, abgelehnt: false };
  }
  const lead =
    lage.ansprechpartnerId === null
      ? undefined
      : lage.mitglieder.find((m) => m.id === lage.ansprechpartnerId);
  if (!lead)
    return {
      art: "niemand",
      antworter: [],
      hinweise: [...hinweise, { grund: "kein_ansprechpartner" }],
      abgelehnt: false,
    };
  if (lead.pausiert) {
    return {
      art: "niemand",
      antworter: [],
      hinweise: [...hinweise, { grund: "ansprechpartner_pausiert", botId: lead.id }],
      abgelehnt: false,
    };
  }
  return { art: "ansprechpartner", antworter: [lead], hinweise, abgelehnt: false };
}

/** Zustand eines Laufs in der Runde. */
export type RundenStatus =
  | "wartend"
  | "aktiv"
  | "fertig"
  | "fehlgeschlagen"
  | "abgebrochen"
  | "uebersprungen";

export interface RundenEintrag {
  readonly botId: string;
  readonly status: RundenStatus;
}

export interface RundenStand {
  /** In der Reihenfolge der Erwähnung. */
  readonly eintraege: readonly RundenEintrag[];
  /** Not-Aus gesetzt: nichts startet mehr. */
  readonly notAus: boolean;
  /** Bots des Teams, wie sie jetzt sind (zum Zeitpunkt des Starts, nicht der Nachricht). */
  readonly mitglieder: readonly RaumBot[];
}

/**
 * Vorschlag für den nächsten Schritt einer Runde. „starten“ heißt nur: dieser Bot ist als
 * Nächster dran. Ob der Lauf wirklich beginnt (Grenzen des Auftrags, Budget, Zeit, Not-Aus des
 * Tors), entscheidet allein das Tor.
 */
export type NaechsterSchritt =
  | { readonly aktion: "starten"; readonly botId: string }
  | { readonly aktion: "warten"; readonly grund: "lauf_aktiv" }
  | {
      readonly aktion: "ueberspringen";
      readonly botId: string;
      readonly grund: "pausiert" | "kein_mitglied";
    }
  | {
      readonly aktion: "ende";
      readonly grund:
        | "fertig"
        | "not_aus"
        | "vorheriger_lauf_fehlgeschlagen"
        | "vorheriger_lauf_abgebrochen";
    };

/**
 * Was passiert als Nächstes in einer Runde? Immer nur ein Lauf zugleich: solange irgendein Eintrag
 * `aktiv` ist, wird nichts gestartet. Der nächste Bot startet erst, wenn alle vor ihm `fertig`
 * oder `uebersprungen` sind. Nach Not-Aus und nach einem gescheiterten oder abgebrochenen Lauf
 * startet nichts mehr; nach dem Aufheben des Not-Aus auch nicht von selbst, weil die Runde dann
 * schon geendet hat. Die Grenzen des Auftrags prüft diese Funktion nicht (siehe `grenzen.ts`).
 */
export function ermittleNaechstenSchritt(stand: RundenStand): NaechsterSchritt {
  if (stand.notAus) return { aktion: "ende", grund: "not_aus" };
  if (stand.eintraege.some((e) => e.status === "aktiv")) {
    return { aktion: "warten", grund: "lauf_aktiv" };
  }
  for (const eintrag of stand.eintraege) {
    if (eintrag.status === "fertig" || eintrag.status === "uebersprungen") continue;
    if (eintrag.status === "fehlgeschlagen") {
      return { aktion: "ende", grund: "vorheriger_lauf_fehlgeschlagen" };
    }
    if (eintrag.status === "abgebrochen") {
      return { aktion: "ende", grund: "vorheriger_lauf_abgebrochen" };
    }
    // wartend: der erste, vor dem alles erledigt ist
    const bot = stand.mitglieder.find((m) => m.id === eintrag.botId);
    if (!bot) return { aktion: "ueberspringen", botId: eintrag.botId, grund: "kein_mitglied" };
    if (bot.pausiert) return { aktion: "ueberspringen", botId: eintrag.botId, grund: "pausiert" };
    return { aktion: "starten", botId: eintrag.botId };
  }
  return { aktion: "ende", grund: "fertig" };
}
