/**
 * PaiBot – API-Route: Unterhaltungen auflisten und anlegen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { route } from "../../../lib/api/route";
import { unterhaltungAnlegen, unterhaltungenListe } from "../../../lib/chat/aktionen";

export const dynamic = "force-dynamic";

export const GET = route("unterhaltungen", unterhaltungenListe);
export const POST = route("unterhaltungAnlegen", unterhaltungAnlegen);
