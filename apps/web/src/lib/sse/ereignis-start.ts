/**
 * PaiBot – Startnummer des Ereignis-Stroms: aus `Last-Event-ID` oder dem Anfrage-Parameter.
 * Ohne Server-Abhängigkeiten, damit auch der Browser die Namen nutzen kann.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { lastEventIdSchema } from "@paibot/shared/eingaben";

/** Anfrage-Parameter für die Startnummer, wenn noch keine `Last-Event-ID` vorliegt. */
export const NACH_PARAMETER = "nach";
/** Kopfzeile, mit der der Browser nach einer Unterbrechung fortsetzt. */
export const LAST_EVENT_ID = "last-event-id";

const GANZZAHL = /^(0|[1-9][0-9]{0,15})$/;

/**
 * Startnummer aus `Last-Event-ID` (hat Vorrang) oder `?nach=`; ohne beides 0. Erlaubt sind nur
 * Ganzzahlen in Dezimalschreibweise ohne Vorzeichen, Leerzeichen oder führende Nullen.
 * `wert` ist `undefined`, wenn die Angabe ungültig ist; `feld` nennt, wo sie stand.
 */
export function startNummer(request: Request): { feld: string; wert: number | undefined } {
  const kopf = request.headers.get(LAST_EVENT_ID);
  const parameter = new URL(request.url).searchParams.get(NACH_PARAMETER);
  const feld = kopf !== null ? "Last-Event-ID" : NACH_PARAMETER;
  const roh = kopf ?? parameter;
  if (roh === null) return { feld, wert: 0 };
  if (!GANZZAHL.test(roh)) return { feld, wert: undefined };
  const geprueft = lastEventIdSchema.safeParse(roh);
  return { feld, wert: geprueft.success ? geprueft.data : undefined };
}
