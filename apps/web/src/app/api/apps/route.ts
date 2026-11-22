/**
 * PaiBot – API: Apps auflisten und verbinden.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { route } from "../../../lib/api/route";
import { appsListe, appVerbinden } from "../../../lib/apps/verwaltung";

export const dynamic = "force-dynamic";

export const GET = route("appsListe", appsListe);
export const POST = route("appVerbinden", appVerbinden);
