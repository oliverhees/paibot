/**
 * PaiBot – API-Route `/api/selbsttest`: Ist die Installation richtig eingestellt? Liest nur.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { route } from "../../../lib/api/route";
import { selbsttestLesen } from "../../../lib/selbsttest/selbsttest";

export const dynamic = "force-dynamic";

export const GET = route("selbsttest", async (kontext) => ({
  daten: await selbsttestLesen(kontext),
}));
