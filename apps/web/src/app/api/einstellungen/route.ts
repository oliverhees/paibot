/**
 * PaiBot – API-Route `/api/einstellungen`: Grenzen lesen und über das Tor ändern.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { route } from "../../../lib/api/route";
import { einstellungenAendern, einstellungenLesen } from "../../../lib/einstellungen/grenzen";

export const dynamic = "force-dynamic";

export const GET = route("einstellungen", async (kontext) => ({
  daten: await einstellungenLesen(kontext),
}));

export const PATCH = route("einstellungenAendern", async (kontext) => ({
  daten: await einstellungenAendern(kontext),
}));
