/**
 * PaiBot – API-Route: Verlauf einer Unterhaltung lesen und eine Nachricht senden.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { route } from "../../../../../lib/api/route";
import { nachrichtenLesen, nachrichtSenden } from "../../../../../lib/chat/aktionen";
import { prozessEinreihen } from "../../../../../lib/warteschlange";

export const dynamic = "force-dynamic";

export const GET = route("nachrichten", nachrichtenLesen);
export const POST = route("nachrichtSenden", nachrichtSenden(prozessEinreihen));
