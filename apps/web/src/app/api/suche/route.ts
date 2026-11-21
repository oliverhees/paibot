/**
 * PaiBot – API-Route: in Titeln und Nachrichten aller Unterhaltungen suchen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { route } from "../../../lib/api/route";
import { unterhaltungenSuchen } from "../../../lib/chat/suche";

export const dynamic = "force-dynamic";

export const GET = route("suche", unterhaltungenSuchen);
