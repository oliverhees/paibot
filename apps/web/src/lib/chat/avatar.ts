/**
 * PaiBot – Zustand und Ausdruck des Avatars im Chat, nur aus echten Ereignissen: dem Lauf-Strom,
 * der Eingabe und dem Not-Aus. Reine Funktionen und ein kleiner Merker für die zwei kurzen
 * Momente „fertig“ und „Fehler“; kein React, die Uhr kommt von außen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import type { ConversationEvent } from "@paibot/shared/ereignisse";
import type { AnsichtNachricht, ChatAnsicht } from "./ansicht";

/** Zustände des Avatars (wie im Baustein, hier ohne Abhängigkeit zur Oberfläche). */
export type ChatAvatarZustand =
  | "ruhig"
  | "hoert_zu"
  | "denkt"
  | "schreibt"
  | "wartet"
  | "fertig"
  | "fehler"
  | "angehalten";

/** Einmalige Ausdrücke des Avatars. */
export type ChatAvatarAusdruck =
  | "nicken"
  | "kopfschuetteln"
  | "anpacken"
  | "einverstanden"
  | "zwinkern"
  | "staunen";

/** Ab so vielen Ausgabe-Token einer Antwort staunt der Avatar. */
export const STAUNEN_AB_TOKEN = 1500;
/** So lange bleibt „fertig“ stehen, danach geht der Avatar auf „ruhig“ zurück. */
export const FERTIG_MS = 1800;

/** Hat die Antwort des aktiven Laufs schon Text? Erst dann „schreibt“ der Bot. */
export function antwortHatText(ansicht: ChatAnsicht): boolean {
  const lauf = ansicht.lauf;
  if (lauf === undefined) return false;
  return ansicht.eintraege.some(
    (e): e is AnsichtNachricht =>
      e.art === "nachricht" && e.rolle === "bot" && e.runId === lauf.id && e.text !== "",
  );
}

export interface AvatarEingabe {
  /** Not-Aus ist an. */
  notAus: boolean;
  /** Ein Lauf ist unterwegs (angefragt, in der Schlange oder am Schreiben). */
  lauf: boolean;
  /** Der Lauf hat schon Text geliefert (`antwortHatText`). */
  text: boolean;
  /** Der letzte Lauf endete mit einem Fehler und seither ist nichts Neues passiert. */
  fehler: boolean;
  /** Eine Antwort ist gerade fertig geworden (kurzer Moment). */
  fertig: boolean;
  /** Im Eingabefeld steht Text. */
  hoertZu: boolean;
}

/**
 * Der Zustand des Avatars. Vorrang: angehalten, Fehler, schreibt, denkt, hört zu, fertig, ruhig.
 * „wartet auf dich“ löst die App nicht aus (es gibt noch keine Freigaben); „wartet in der
 * Schlange“ ist ein Lauf, der noch nicht begonnen hat, und zählt als „denkt“.
 */
export function avatarZustand(e: AvatarEingabe): ChatAvatarZustand {
  if (e.notAus) return "angehalten";
  if (e.fehler && !e.lauf) return "fehler";
  if (e.lauf) return e.text ? "schreibt" : "denkt";
  if (e.hoertZu) return "hoert_zu";
  if (e.fertig) return "fertig";
  return "ruhig";
}

/** Das Wort neben dem Avatar zu seinem Zustand (Text-Schlüssel). */
export function avatarWort(
  z: ChatAvatarZustand,
):
  | "chat.bot.bereit"
  | "chat.bot.hoert_zu"
  | "chat.bot.denkt"
  | "chat.lauf.schreibt"
  | "chat.bot.wartet"
  | "chat.bot.fertig"
  | "chat.bot.fehler"
  | "chat.bot.angehalten" {
  switch (z) {
    case "hoert_zu":
      return "chat.bot.hoert_zu";
    case "denkt":
      return "chat.bot.denkt";
    case "schreibt":
      return "chat.lauf.schreibt";
    case "wartet":
      return "chat.bot.wartet";
    case "fertig":
      return "chat.bot.fertig";
    case "fehler":
      return "chat.bot.fehler";
    case "angehalten":
      return "chat.bot.angehalten";
    default:
      return "chat.bot.bereit";
  }
}

/** Was ein Ereignis am Avatar auslöst. Leer, wenn es ihn nicht betrifft. */
export interface AvatarAktion {
  /** Ein Text-Stück dieser Länge ist angekommen (bewegt den Mund, nur im Zustand „schreibt“). */
  textStueck?: number;
  /** Einmaliger Ausdruck. */
  ausdruck?: ChatAvatarAusdruck;
  /** Eine Antwort ist fertig: kurzer Moment „fertig“. */
  fertig?: true;
  /** Setzt den Fehler-Zustand (`true`) oder hebt ihn auf (`false`). */
  fehler?: boolean;
}

/**
 * Ereignis des Lauf-Stroms → Aktion am Avatar:
 * - `text.delta`: Mund bewegt sich um die Länge des Stücks
 * - `message.completed`: „fertig“, bei mindestens `STAUNEN_AB_TOKEN` Ausgabe-Token auch „staunen“
 * - `run.cancelled` durch den Besitzer: „einverstanden“, kein Fehler; mit Code `angehalten`
 *   (Not-Aus) nichts, den Zustand liefert der Not-Aus selbst
 * - `run.failed`, `run.denied`, `schleuse.blockiert`: Fehler
 * - `run.queued`, `run.started`: ein neuer Lauf hebt Fehler und „fertig“ auf
 */
export function avatarAufEreignis(e: ConversationEvent): AvatarAktion {
  switch (e.type) {
    case "text.delta":
      return { textStueck: e.data.text.length };
    case "message.completed":
      return e.data.tokens.output >= STAUNEN_AB_TOKEN
        ? { fertig: true, ausdruck: "staunen" }
        : { fertig: true };
    case "run.cancelled":
      return e.data.code === "angehalten" ? {} : { ausdruck: "einverstanden" };
    case "run.failed":
    case "run.denied":
    case "schleuse.blockiert":
      return { fehler: true };
    case "run.queued":
    case "run.started":
      return { fehler: false };
    default:
      return {};
  }
}

/** Uhr, die der Merker braucht (im Browser `setTimeout`, in Tests eine falsche Uhr). */
export interface AvatarUhr {
  setze(fn: () => void, ms: number): unknown;
  loesche(zeitgeber: unknown): void;
}

export interface AvatarMerkmale {
  fertig: boolean;
  fehler: boolean;
}

/**
 * Merkt die zwei Dinge, die aus dem Strom allein nicht folgen: „fertig“ gilt nur einen kurzen
 * Moment, „Fehler“ gilt, bis etwas Neues passiert (neuer Lauf oder Tippen).
 */
export class AvatarMerker {
  private stand: AvatarMerkmale = { fertig: false, fehler: false };
  private zeitgeber: unknown;
  private beendet = false;

  constructor(
    private readonly aenderung: (m: AvatarMerkmale) => void,
    private readonly uhr: AvatarUhr,
  ) {}

  get merkmale(): AvatarMerkmale {
    return this.stand;
  }

  private setze(neu: Partial<AvatarMerkmale>): void {
    const next = { ...this.stand, ...neu };
    if (next.fertig === this.stand.fertig && next.fehler === this.stand.fehler) return;
    this.stand = next;
    this.aenderung(next);
  }

  private fertigLoeschen(): void {
    if (this.zeitgeber !== undefined) this.uhr.loesche(this.zeitgeber);
    this.zeitgeber = undefined;
  }

  /** Wendet die Aktion eines Ereignisses an. */
  anwenden(a: AvatarAktion): void {
    if (this.beendet) return;
    if (a.fehler !== undefined) {
      this.setze({ fehler: a.fehler });
      if (a.fehler === false) {
        this.fertigLoeschen();
        this.setze({ fertig: false });
      }
    }
    if (a.fertig === true) {
      this.fertigLoeschen();
      this.setze({ fertig: true, fehler: false });
      this.zeitgeber = this.uhr.setze(() => {
        this.zeitgeber = undefined;
        this.setze({ fertig: false });
      }, FERTIG_MS);
    }
  }

  /** Der Besitzer fängt etwas Neues an (tippt oder sendet): ein Fehler ist damit erledigt. */
  neuesAnfangen(): void {
    if (this.beendet) return;
    this.setze({ fehler: false });
  }

  /** Räumt den Zeitgeber ab; danach tut der Merker nichts mehr. */
  stop(): void {
    this.beendet = true;
    this.fertigLoeschen();
  }
}
