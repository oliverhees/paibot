/**
 * PaiBot – Textformat des Ereignis-Stroms (Server-Sent Events): Ereignis, Herzschlag, Kopfzeilen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import {
  type ConversationEvent,
  encodeEvent,
  SSE_HEARTBEAT,
  SSE_PREAMBLE,
} from "@paibot/shared/ereignisse";

export { SSE_HEARTBEAT, SSE_PREAMBLE };

/** Kopfzeilen jeder Antwort mit Ereignis-Strom. Bewusst ohne CORS-Kopfzeilen. */
export const SSE_KOPFZEILEN: Readonly<Record<string, string>> = Object.freeze({
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-store, no-transform",
  "X-Accel-Buffering": "no",
  "X-Content-Type-Options": "nosniff",
});

/**
 * Ein Ereignis als SSE-Block: `id:` ist die Nummer, `event:` der Typ, `data:` das Ereignis als JSON
 * (immer eine Zeile, weil `JSON.stringify` keine Zeilenumbrüche erzeugt), danach eine Leerzeile.
 */
export function formatEreignis(event: ConversationEvent): string {
  return `id: ${event.seq}\nevent: ${event.type}\ndata: ${encodeEvent(event)}\n\n`;
}
