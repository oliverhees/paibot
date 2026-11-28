/**
 * PaiBot – API: Team und Bots aus einem Entwurf anlegen (eine Transaktion).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

import { route } from "../../../../../lib/api/route";
import { teamEntwurfAnlegen } from "../../../../../lib/team/entwurf/verwaltung";

export const dynamic = "force-dynamic";

export const POST = route("teamEntwurfAnlegen", teamEntwurfAnlegen);
