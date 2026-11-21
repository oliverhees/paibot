/**
 * PaiBot – API-Route `/api/notaus`: Not-Aus („Alle Bots anhalten“) über das Tor umschalten.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { route } from "../../../lib/api/route";
import { notAusUmschalten } from "../../../lib/notaus/notaus";

export const dynamic = "force-dynamic";

export const PUT = route("notausUmschalten", async (kontext) => ({
  daten: await notAusUmschalten(kontext),
}));
