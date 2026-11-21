/**
 * PaiBot – Eingaben der drei Fassungen des Startbereichs.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import type { ReactNode } from "react";
import type { Tageszeit } from "./gruss";

export const START_FASSUNGEN = ["begruessung", "startbrett", "stille"] as const;
export type StartFassung = (typeof START_FASSUNGEN)[number];

export type StartHerkunft = "eu" | "non_eu" | "local";

export interface StartUnterhaltung {
  id: string;
  titel: string;
  /** Fertige Zeitangabe, z. B. „heute“, „gestern“ oder „16.11.“. */
  zeit: string;
}

/**
 * Alle Daten kommen von außen; die Bausteine rufen nichts ab. Fehlt eine Angabe, fehlt ihre Zeile.
 */
export interface StartDaten {
  /** Avatar als Element; wird vom Baustein auf die passende Größe gebracht (Quadrat). */
  avatar: ReactNode;
  /** Avatar für den Zustand „angehalten“; ohne Angabe gilt `avatar`. */
  avatarNotAus?: ReactNode;
  /** Kleiner Avatar für die Karte „So arbeitet …“ (Startbrett); ohne Angabe ein Symbol. */
  avatarKlein?: ReactNode;
  botName?: string;
  modell?: string;
  herkunft?: StartHerkunft;
  /**
   * Belegbare Herkunft des Modells in Worten, genau wie im Kopf des Chats (z. B. „über EUrouter“).
   * Hat Vorrang vor `herkunft` und wird neutral gezeigt, nie als „EU“-Marke.
   */
  herkunftText?: string;
  schleuseAn?: boolean;
  notAus?: boolean;
  /** Zahl der Belege; nur mit Wert zeigt das Startbrett die Zeile. */
  belege?: number;
  unterhaltungen?: readonly StartUnterhaltung[];
  tageszeit?: Tageszeit;
  /** „Anfang gewählt“: Text für das Eingabefeld (Feld füllen, nicht absenden). */
  onAnfang: (text: string) => void;
  /** „Unterhaltung öffnen“. */
  onUnterhaltung?: (id: string) => void;
}
