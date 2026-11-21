/**
 * PaiBot – API: Anbieter auflisten und anlegen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { route } from "../../../lib/api/route";
import { anbieterAnlegen, anbieterListe } from "../../../lib/modelle/anbieter";

export const dynamic = "force-dynamic";

export const GET = route("anbieterListe", anbieterListe);
export const POST = route("anbieterAnlegen", anbieterAnlegen);
