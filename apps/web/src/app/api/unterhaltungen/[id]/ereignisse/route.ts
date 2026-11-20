/**
 * PaiBot – Ereignis-Strom einer Unterhaltung (Server-Sent Events), nur für den angemeldeten Besitzer.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { ereignisDienste } from "../../../../../lib/sse/dienste";
import { erstelleEreignisRoute, type RoutenKontext } from "../../../../../lib/sse/ereignis-route";
import { sitzungPruefen } from "../../../../../lib/sse/sitzung";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = erstelleEreignisRoute({ sitzungPruefen, dienste: ereignisDienste });

export function GET(request: Request, kontext: RoutenKontext): Promise<Response> {
  return handler(request, kontext);
}
