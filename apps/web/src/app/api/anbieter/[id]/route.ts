/**
 * PaiBot – API: einen Anbieter ändern oder entfernen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { route } from "../../../../lib/api/route";
import { anbieterAendern, anbieterLoeschen } from "../../../../lib/modelle/anbieter";

export const dynamic = "force-dynamic";

export const PUT = route("anbieterAendern", anbieterAendern);
export const DELETE = route("anbieterLoeschen", anbieterLoeschen);
