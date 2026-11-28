/**
 * PaiBot – API: einen Team-Entwurf lesen oder verwerfen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

import { route } from "../../../../lib/api/route";
import { teamEntwurfLesen, teamEntwurfVerwerfen } from "../../../../lib/team/entwurf/verwaltung";

export const dynamic = "force-dynamic";

export const GET = route("teamEntwurfLesen", teamEntwurfLesen);
export const DELETE = route("teamEntwurfVerwerfen", teamEntwurfVerwerfen);
