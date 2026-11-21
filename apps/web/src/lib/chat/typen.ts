/**
 * PaiBot – Daten des Chats, wie sie vom Server zur Oberfläche gehen: Unterhaltung, Verlauf,
 * kurze Belege und Bereitschaft (Modell, Schlüssel, Datenschleuse). Nur Typen, keine Laufzeit.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import type { ActionType } from "@paibot/shared/aktionen";
import type { ConversationEvent } from "@paibot/shared/ereignisse";
import type { ErrorCode } from "@paibot/shared/fehler";
import type { BotColor, Message, Run, SchleuseMode } from "@paibot/shared/objekte";
import type { Outcome } from "@paibot/shared/tor";
import type { AnbieterKurz, UnterAnbieterListe } from "../modelle/herkunft";
import type { RegelVorgabe } from "../modelle/vorgabe";

/** Modell mit Herkunft, z. B. „Beispiel-Modell A · EU“. */
export interface ModellInfo {
  name: string;
  /** Belegbare Herkunft des Anbieters in Worten (`anbieterHerkunft`); nie ein pauschales „EU“. */
  herkunft?: string;
  /** Anbieter des Modells, für die Herkunft einer einzelnen Antwort (`antwortHerkunft`). */
  anbieter?: AnbieterKurz;
  /**
   * Nur bei einer Routing-Regel mit gelesenen Vorgaben (zweiter Schlüssel): die Vorgaben mit
   * Zeitpunkt der Prüfung. Nur daraus kann die Kennzeichnung „EU“ kommen.
   */
  vorgabe?: RegelVorgabe;
}

/** Eintrag der Seitenleiste. */
export interface UnterhaltungKurz {
  id: string;
  titel: string;
  /** Letzte Nachricht, sonst Anlegen (ISO). */
  zuletzt: string;
}

/** Unterhaltung mit dem Modus der Datenschleuse, der für sie gilt. */
export interface UnterhaltungInfo {
  id: string;
  titel: string;
  /** Gilt für diese Unterhaltung: eigener Modus, sonst der Standard. */
  schleuse: SchleuseMode;
}

/**
 * Ein Beleg in kurzer Form für die Arbeitsfläche. Nur Kennungen, Zeiten und Ergebnisse, nie
 * Inhalte. Ein Beleg, den bisher nur ein Ereignis angekündigt hat, ist `vollstaendig: false`.
 */
export interface BelegKurz {
  id: string;
  vollstaendig: boolean;
  aktion: ActionType;
  /** ISO-Zeit. */
  zeit: string;
  runId?: string;
  messageId?: string;
  seq?: number;
  art?: "decision" | "result";
  akteur?: "besitzer" | "bot";
  entscheidung?: {
    outcome: Outcome;
    regeln: { id: string; version: number }[];
    grund: string;
  };
  ergebnis?: { status: "ok" | "error" | "cancelled" | "denied"; code?: ErrorCode };
}

/** Alles, was die Chat-Ansicht beim Öffnen einer Unterhaltung braucht (ein Lesestand). */
export interface ChatVerlauf {
  unterhaltung: UnterhaltungInfo;
  nachrichten: Message[];
  /** Beendete Läufe (neueste zuerst, begrenzt) für Hinweise ohne Antwort. */
  laeufe: Run[];
  /** Der aktive Lauf, falls es einen gibt. */
  aktiverLauf?: Run;
  /** Ereignisse des aktiven Laufs ab `run.queued` (Text, der noch streamt). */
  ereignisse: ConversationEvent[];
  /** Höchste Nummer im Ereignis-Strom zu diesem Lesestand. */
  letzteSeq: number;
  /** Belege dieser Unterhaltung, neueste zuerst. */
  belege: BelegKurz[];
  /** Modelle der Antworten (nach Modell-ID). */
  modelle: Record<string, ModellInfo>;
}

/** Ein Modell, mit dem der Bot antworten kann (für „neu erzeugen mit anderem Modell“). */
export interface ModellWahl extends ModellInfo {
  id: string;
}

/** Ob der Bot antworten kann und was die Eingabe zeigen soll. */
export interface ChatBereitschaft {
  botName: string;
  botFarbe: BotColor;
  /** Modell des Bots; fehlt, wenn keins gewählt ist. */
  modell?: ModellInfo;
  /** Ist für den Anbieter des Modells ein Schlüssel eingetragen? */
  schluessel: boolean;
  schleuseInstalliert: boolean;
  /** Standard der Datenschleuse für neue Unterhaltungen. */
  schleuseStandard: SchleuseMode;
  zeitzone: string;
  /**
   * Zahl der Belege in der Kette (Nummer des letzten Belegs: die Kette beginnt bei 1, jeder Beleg
   * ist der nächste, nichts wird gelöscht). 0 bei leerer Kette.
   */
  belegeGesamt: number;
  /** Kennung des Modells des Bots. */
  modellId?: string;
  /** Modelle, die sich wählen lassen (Anbieter an, Schlüssel da oder lokal), nach Namen. */
  waehlbar?: ModellWahl[];
  /** Anbieter-Liste von EUrouter (Namen, Sitz) für die Herkunft der Antworten, wenn geholt. */
  unterAnbieter?: UnterAnbieterListe;
}
