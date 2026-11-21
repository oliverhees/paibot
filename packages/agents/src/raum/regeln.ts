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
 * Regeln im Teamchat als reine Funktionen: wer antwortet auf eine Nachricht der Person, wer hat
 * den Staffelstab nach einem Lauf, wann wird gesammelt. Keine KI, kein Zugriff auf Datenbank oder
 * Uhr. Die Funktionen liefern Vorschläge und Fakten; ob ein Lauf wirklich beginnt (Grenzen,
 * Budget, Zeit, Not-Aus), entscheidet allein das Tor. Wer dran ist, bestimmt nie ein Modell.
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
  /** Die Leitung des Teams, wenn eine Nachricht keine Erwähnung hat; `null` = keine gesetzt. */
  readonly leitungId: string | null;
  /** Bots außerhalb des Teams; nur für den Hinweis „gehört nicht zum Team“. */
  readonly andereBots?: readonly RaumBot[];
  readonly hoechstensErwaehnungen?: number;
}

export type AntwortHinweis =
  | ErwaehnungsHinweis
  | { readonly grund: "keine_leitung" }
  | { readonly grund: "leitung_pausiert"; readonly botId: string }
  | { readonly grund: "zu_viele_erwaehnungen" }
  | { readonly grund: "text_gekuerzt" };

export interface Antwortvorschlag {
  readonly art: "erwaehnt" | "leitung" | "niemand";
  /** Bots, die antworten sollen, in der Reihenfolge, in der sie dran sind. */
  readonly antworter: readonly RaumBot[];
  /**
   * Nach den Erwähnten geht der Stab an diese Leitung (Kennung); `null`, wenn keine gesetzt ist
   * oder niemand erwähnt war (dann antwortet die Leitung selbst).
   */
  readonly danachLeitungId: string | null;
  readonly hinweise: readonly AntwortHinweis[];
  /** Die Nachricht darf nicht gesendet werden (zu viele Erwähnungen). */
  readonly abgelehnt: boolean;
}

const NIEMAND: Antwortvorschlag = {
  art: "niemand",
  antworter: [],
  danachLeitungId: null,
  hinweise: [],
  abgelehnt: false,
};

/**
 * Wer antwortet auf eine Nachricht der Person im Faden?
 *
 * - Nur die Nachricht des Besitzers wird nach `@` durchsucht. Von einem Bot (und von jedem
 *   unbekannten Absender) antwortet niemand durch Erwähnung; was Bots weitergeben wollen, steht
 *   allein in ihren festen Zeilen (`zeilen.ts`) und geht durch das Tor.
 * - Mit Erwähnung: genau die erwähnten, nicht pausierten Mitglieder, in Reihenfolge der Erwähnung;
 *   danach geht der Stab an die Leitung. Sind alle Erwähnungen ungültig, antwortet niemand (die
 *   Person hat jemand anderen gemeint).
 * - Ohne Erwähnung: die Leitung (feste Regel), wenn sie Mitglied und nicht pausiert ist.
 * - Mehr als die erlaubte Zahl gültiger Erwähnungen: abgelehnt.
 */
export function bestimmeAntworter(
  autor: RaumAutor | string,
  text: string,
  lage: RaumLage,
): Antwortvorschlag {
  if (autor !== "besitzer") return NIEMAND;
  const erwaehnungen: ErwaehnungsErgebnis = erkenneErwaehnungen(text, lage.mitglieder, {
    ...(lage.andereBots ? { andereBots: lage.andereBots } : {}),
    ...(lage.hoechstensErwaehnungen !== undefined
      ? { hoechstens: lage.hoechstensErwaehnungen }
      : {}),
  });
  const hinweise: AntwortHinweis[] = [...erwaehnungen.hinweise];
  if (erwaehnungen.textGekuerzt) hinweise.push({ grund: "text_gekuerzt" });

  const leitung =
    lage.leitungId === null ? undefined : lage.mitglieder.find((m) => m.id === lage.leitungId);

  if (erwaehnungen.zuViele) {
    return {
      art: "niemand",
      antworter: [],
      danachLeitungId: null,
      hinweise: [...hinweise, { grund: "zu_viele_erwaehnungen" }],
      abgelehnt: true,
    };
  }
  if (erwaehnungen.gueltig.length > 0) {
    return {
      art: "erwaehnt",
      antworter: erwaehnungen.gueltig,
      danachLeitungId: leitung?.id ?? null,
      hinweise,
      abgelehnt: false,
    };
  }
  if (erwaehnungen.hinweise.length > 0) {
    // Es gab Erwähnungen, aber keine gültige: nicht stillschweigend jemand anderen antworten lassen.
    return { art: "niemand", antworter: [], danachLeitungId: null, hinweise, abgelehnt: false };
  }
  if (!leitung)
    return {
      art: "niemand",
      antworter: [],
      danachLeitungId: null,
      hinweise: [...hinweise, { grund: "keine_leitung" }],
      abgelehnt: false,
    };
  if (leitung.pausiert) {
    return {
      art: "niemand",
      antworter: [],
      danachLeitungId: null,
      hinweise: [...hinweise, { grund: "leitung_pausiert", botId: leitung.id }],
      abgelehnt: false,
    };
  }
  return {
    art: "leitung",
    antworter: [leitung],
    danachLeitungId: null,
    hinweise,
    abgelehnt: false,
  };
}

/** Was die Antwort des beendeten Laufs am Ende bewirkt hat, nachdem das Tor entschieden hat. */
export type StabZeile = "keine" | "weitergegeben" | "fertig" | "frage";

/** Der Lauf, der gerade zu Ende ging. */
export interface StabBeendet {
  readonly botId: string;
  readonly rolle: "stabschef" | "leitung" | "mitglied";
  /** Der Bot, der diesen Auftrag gegeben hat (Leitung bzw. Bittender); `null` bei der Person. */
  readonly geberBotId: string | null;
  /** Art des Auftrags (`wurzel`, `uebergabe`, `bitte`, `rueckkehr`, …). */
  readonly auftragArt: string;
  readonly ergebnis: "normal" | "fehlgeschlagen" | "abgebrochen";
  /**
   * `weitergegeben`: das Tor hat eine Übergabe, Bitte oder Rückgabe zugelassen; der Stab geht mit
   * dem neuen Auftrag an den Empfänger. `keine` auch dann, wenn eine Zeile abgelehnt wurde.
   */
  readonly zeile: StabZeile;
}

export interface StabStand {
  readonly notAus: boolean;
  /** Die Wurzel des Baums ist abgebrochen (z. B. weil die Person übernommen hat). */
  readonly wurzelAbgebrochen: boolean;
  /** Im Baum läuft gerade ein Lauf (ein Lauf je Auftragsbaum). */
  readonly laeuft: boolean;
  readonly beendet: StabBeendet;
  /** Mitglieder, die der Fächer der Leitung noch nicht erreicht hat, in der Reihenfolge der Zeilen. */
  readonly wartendeFaecher: readonly string[];
  /** Bots des Teams, wie sie jetzt sind (zum Zeitpunkt des Starts, nicht der Nachricht). */
  readonly mitglieder: readonly RaumBot[];
  /** Abnahme-Art des Fadens; `ohne`: die Leitung endet den Faden ohne Abnahme. Standard `leitung`. */
  readonly abnahme?: "leitung" | "besitzer" | "ohne";
}

/**
 * Vorschlag, wer nach einem Lauf den Staffelstab hat. „starten“ heißt nur: dieser Bot ist als
 * Nächster dran; ob der Lauf wirklich beginnt, entscheidet das Tor.
 */
export type NaechsterSchritt =
  | { readonly aktion: "warten"; readonly grund: "lauf_aktiv" }
  | { readonly aktion: "beim_empfaenger" }
  | {
      readonly aktion: "stab_an_bot";
      readonly botId: string;
      readonly grund: "rueckkehr_zum_geber" | "naechstes_im_faecher";
    }
  | {
      readonly aktion: "ueberspringen";
      readonly botId: string;
      readonly grund: "pausiert" | "kein_mitglied";
    }
  | {
      readonly aktion: "stab_an_besitzer";
      readonly grund:
        | "leitung_ohne_zeile"
        | "rueckfrage"
        | "geber_unbekannt"
        | "geber_nicht_bereit";
    }
  | {
      readonly aktion: "ende";
      readonly grund:
        | "fertig"
        | "not_aus"
        | "wurzel_abgebrochen"
        | "vorheriger_lauf_fehlgeschlagen"
        | "vorheriger_lauf_abgebrochen"
        | "ohne_weitergabe";
    };

/**
 * Wer hat den Stab, wenn ein Lauf zu Ende ist? Genau einer arbeitet je Auftragsbaum:
 *
 * 1. Not-Aus und abgebrochene Wurzel: nichts startet. Läuft noch ein Lauf im Baum: warten.
 * 2. Ein fehlgeschlagener oder abgebrochener Lauf stoppt die Kette.
 * 3. Wurde eine Zeile weitergegeben, liegt der Stab beim Empfänger (nichts zu tun).
 * 4. `Frage an dich:` und eine Leitung ohne gültige Zeile geben den Stab an die Person
 *    (nie wieder an die Leitung, sonst liefe sie bis zur Grenze im Kreis). Bei Abnahme `ohne`
 *    endet der Faden stattdessen.
 * 5. Ein Mitglied gibt nach seinem Schritt den Stab an den Geber zurück; hat die Leitung noch
 *    Mitglieder im Fächer, kommt zuerst das nächste. Ein Zulieferer geht immer zum Bittenden.
 *
 * Grenzen des Auftrags prüft diese Funktion nicht (siehe `grenzen.ts`).
 */
export function ermittleNaechstenSchritt(stand: StabStand): NaechsterSchritt {
  if (stand.notAus) return { aktion: "ende", grund: "not_aus" };
  if (stand.wurzelAbgebrochen) return { aktion: "ende", grund: "wurzel_abgebrochen" };
  if (stand.laeuft) return { aktion: "warten", grund: "lauf_aktiv" };
  const b = stand.beendet;
  if (b.ergebnis === "fehlgeschlagen")
    return { aktion: "ende", grund: "vorheriger_lauf_fehlgeschlagen" };
  if (b.ergebnis === "abgebrochen") return { aktion: "ende", grund: "vorheriger_lauf_abgebrochen" };
  if (b.zeile === "weitergegeben") return { aktion: "beim_empfaenger" };
  if (b.zeile === "frage") return { aktion: "stab_an_besitzer", grund: "rueckfrage" };
  if (b.rolle === "stabschef") return { aktion: "ende", grund: "ohne_weitergabe" };
  if (b.rolle === "leitung") {
    if (b.zeile === "fertig" || stand.abnahme === "ohne") {
      return { aktion: "ende", grund: "fertig" };
    }
    return { aktion: "stab_an_besitzer", grund: "leitung_ohne_zeile" };
  }
  // Mitglied: erst der Fächer der Leitung, dann zurück an den Geber.
  if (b.auftragArt !== "bitte") {
    const naechster = stand.wartendeFaecher[0];
    if (naechster !== undefined) {
      const bot = stand.mitglieder.find((m) => m.id === naechster);
      if (!bot) return { aktion: "ueberspringen", botId: naechster, grund: "kein_mitglied" };
      if (bot.pausiert) return { aktion: "ueberspringen", botId: naechster, grund: "pausiert" };
      return { aktion: "stab_an_bot", botId: naechster, grund: "naechstes_im_faecher" };
    }
  }
  if (b.geberBotId === null) return { aktion: "stab_an_besitzer", grund: "geber_unbekannt" };
  const geber = stand.mitglieder.find((m) => m.id === b.geberBotId);
  if (!geber || geber.pausiert) return { aktion: "stab_an_besitzer", grund: "geber_nicht_bereit" };
  return { aktion: "stab_an_bot", botId: geber.id, grund: "rueckkehr_zum_geber" };
}

/** Was eine Nachricht der Person mitten im Faden für den Auftragsbaum bedeutet. */
export interface BesitzerNachrichtFakten {
  /** Die Nachricht beginnt eine neue Wurzel (neuer Baum, frische Zähler). */
  readonly neueWurzel: boolean;
  /** Was mit dem bisherigen Baum geschieht. */
  readonly alterBaum: "keiner" | "bleibt" | "endet_abgebrochen";
  readonly grund: "erste_nachricht" | "antwort_auf_frage" | "du_hast_uebernommen";
  /** Noch nicht gestartete Schritte der Bots fallen weg. */
  readonly wartendeSchritteFallenWeg: boolean;
}

/**
 * Eine Nachricht der Person im Faden: Beantwortet sie eine offene Frage dieses Fadens, läuft der
 * alte Baum weiter. Sonst übernimmt die Person: neue Wurzel, der alte Baum endet `abgebrochen`
 * („du hast übernommen“), wartende Schritte fallen weg.
 */
export function bewerteBesitzerNachricht(stand: {
  readonly offeneFrageImFaden: boolean;
  readonly baumOffen: boolean;
}): BesitzerNachrichtFakten {
  if (stand.offeneFrageImFaden) {
    return {
      neueWurzel: false,
      alterBaum: "bleibt",
      grund: "antwort_auf_frage",
      wartendeSchritteFallenWeg: false,
    };
  }
  if (!stand.baumOffen) {
    return {
      neueWurzel: true,
      alterBaum: "keiner",
      grund: "erste_nachricht",
      wartendeSchritteFallenWeg: false,
    };
  }
  return {
    neueWurzel: true,
    alterBaum: "endet_abgebrochen",
    grund: "du_hast_uebernommen",
    wartendeSchritteFallenWeg: true,
  };
}

/** Endzustände eines Unter-Auftrags; alles andere (auch ein unbekannter Wert) gilt als offen. */
const ENDZUSTAENDE: ReadonlySet<string> = new Set([
  "fertig",
  "gescheitert",
  "abgelehnt",
  "abgebrochen",
]);

export interface UnterAuftrag {
  readonly id: string;
  readonly status: string;
}

export interface SammelStand {
  readonly notAus: boolean;
  /** Die Person hat den Eltern-Faden gestoppt. */
  readonly elternGestoppt: boolean;
  /** Die Frist des Fächers ist abgelaufen. */
  readonly fristAbgelaufen: boolean;
  readonly unterAuftraege: readonly UnterAuftrag[];
}

export type SammelAusloeser =
  | {
      readonly aktion: "sammeln";
      readonly grund: "alle_endzustand" | "frist";
      /** Offene Unter-Aufträge, die mit Grund „Zeit“ enden, bevor gesammelt wird. */
      readonly offeneAbbrechen: readonly string[];
    }
  | { readonly aktion: "warten"; readonly offen: number }
  | {
      readonly aktion: "nie";
      readonly grund: "not_aus" | "eltern_gestoppt" | "keine_unterauftraege";
    };

/**
 * Wann sammelt der Fragende die Antworten eines Fächers? Nur (1) wenn alle Unter-Aufträge einen
 * Endzustand haben oder (2) wenn die Frist abgelaufen ist. Scheitern, Ablehnen und das Stoppen
 * eines Unter-Fadens zählen als Endzustand und halten die anderen nicht an. Nach Not-Aus und
 * nach dem Stoppen des Eltern-Fadens wird nie gesammelt.
 */
export function ermittleSammelAusloeser(stand: SammelStand): SammelAusloeser {
  if (stand.notAus) return { aktion: "nie", grund: "not_aus" };
  if (stand.elternGestoppt) return { aktion: "nie", grund: "eltern_gestoppt" };
  if (stand.unterAuftraege.length === 0) return { aktion: "nie", grund: "keine_unterauftraege" };
  const offen = stand.unterAuftraege.filter((u) => !ENDZUSTAENDE.has(u.status));
  if (offen.length === 0)
    return { aktion: "sammeln", grund: "alle_endzustand", offeneAbbrechen: [] };
  if (stand.fristAbgelaufen) {
    return { aktion: "sammeln", grund: "frist", offeneAbbrechen: offen.map((u) => u.id) };
  }
  return { aktion: "warten", offen: offen.length };
}
