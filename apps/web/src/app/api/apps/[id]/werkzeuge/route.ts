/**
 * PaiBot – API: Werkzeuge einer App lesen und neu abrufen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { route } from "../../../../../lib/api/route";
import { appWerkzeuge, appWerkzeugeAbrufen } from "../../../../../lib/apps/verwaltung";

export const dynamic = "force-dynamic";

export const GET = route("appWerkzeuge", appWerkzeuge);
export const POST = route("appWerkzeugeAbrufen", appWerkzeugeAbrufen);
