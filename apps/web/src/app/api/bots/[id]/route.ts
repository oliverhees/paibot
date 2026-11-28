/**
 * PaiBot – API: einen Bot löschen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

import { route } from "../../../../lib/api/route";
import { botLoeschen } from "../../../../lib/teams/verwaltung";

export const dynamic = "force-dynamic";

export const DELETE = route("botLoeschen", botLoeschen);
