/**
 * PaiBot – Filter der Beleg-Liste nach Aktion und Unterhaltung: Auswahl für die Seite (nur Server)
 * und Lesen aus der Adresse (`/belege?aktion=…&unterhaltung=…`).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { type Database, repo } from "@paibot/db";
import { type ActionType, STORED_ACTION_TYPES } from "@paibot/shared/aktionen";
import { receiptListQuery } from "@paibot/shared/eingaben";
import type { ConversationId } from "@paibot/shared/ids";
import { isTextKey, t } from "@paibot/shared/texte";

/** Eine Wahl im Filter: Wert für die Abfrage und Text für die Anzeige. */
export interface FilterWahl {
  wert: string;
  text: string;
}

/** Aktiver Filter der Liste; fehlt ein Teil, gilt „alle“. */
export interface BelegFilter {
  aktion?: ActionType;
  unterhaltung?: ConversationId;
}

/** So viele Unterhaltungen bietet der Filter an (die zuletzt benutzten). */
export const FILTER_UNTERHALTUNGEN = 200;

/**
 * Aktionen, nach denen sich filtern lässt: alle, für die es Belege geben kann. Werkzeug-Aufrufe
 * des Bots gehören nicht zu dieser Version und stehen deshalb nicht in der Auswahl.
 */
export function aktionsWahl(): FilterWahl[] {
  return STORED_ACTION_TYPES.filter((typ) => !typ.startsWith("werkzeug.")).map((typ) => {
    const schluessel = `aktion.${typ}`;
    return {
      wert: typ,
      text: isTextKey(schluessel) ? t(schluessel as "aktion.lauf.abbrechen") : typ,
    };
  });
}

/** Unterhaltungen für den Filter, zuletzt benutzte zuerst. */
export async function unterhaltungsWahl(db: Database): Promise<FilterWahl[]> {
  const liste = await repo.conversations.list(db, { limit: FILTER_UNTERHALTUNGEN });
  return liste.map((u) => ({ wert: u.id, text: u.title }));
}

/**
 * Filter aus der Adresse. Ungültige Werte (unbekannte Aktion, kaputte Kennung, mehrfach
 * angegeben) fallen weg; die Liste zeigt dann alle Belege statt eines Fehlers.
 */
export function filterAusAdresse(
  abfrage: Readonly<Record<string, string | string[] | undefined>>,
): BelegFilter {
  const filter: BelegFilter = {};
  const aktion = receiptListQuery.safeParse({ action: abfrage.aktion });
  if (aktion.success && aktion.data.action !== undefined) filter.aktion = aktion.data.action;
  const unterhaltung = receiptListQuery.safeParse({ conversationId: abfrage.unterhaltung });
  if (unterhaltung.success && unterhaltung.data.conversationId !== undefined) {
    filter.unterhaltung = unterhaltung.data.conversationId;
  }
  return filter;
}
