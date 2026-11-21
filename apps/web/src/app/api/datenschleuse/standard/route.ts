/**
 * PaiBot – API: Standard der Datenschleuse für neue Unterhaltungen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { route } from "../../../../lib/api/route";
import { datenschleuseStandard } from "../../../../lib/schleuse/schleuse";

export const dynamic = "force-dynamic";

export const PUT = route("datenschleuseStandard", datenschleuseStandard);
