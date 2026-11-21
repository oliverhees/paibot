/**
 * PaiBot – API: Verbindungstest nach der Anmeldung.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { route } from "../../../../lib/api/route";
import { anbieterVerbindungstest } from "../../../../lib/modelle/anbieter";

export const dynamic = "force-dynamic";

export const POST = route("anbieterVerbindungstest", anbieterVerbindungstest);
