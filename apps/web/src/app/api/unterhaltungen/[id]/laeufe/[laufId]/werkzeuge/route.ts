/**
 * PaiBot – API-Route: Werkzeug-Aufrufe eines Laufs lesen (für die Anzeige der Schritte im Chat).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { route } from "../../../../../../../lib/api/route";
import { laufWerkzeugeLesen } from "../../../../../../../lib/chat/aktionen";

export const dynamic = "force-dynamic";

export const GET = route("laufWerkzeuge", laufWerkzeugeLesen);
