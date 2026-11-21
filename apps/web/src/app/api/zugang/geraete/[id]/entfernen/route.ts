/**
 * PaiBot – API-Route `/api/zugang/geraete/:id/entfernen`: ein bekanntes Gerät widerrufen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { route } from "../../../../../../lib/api/route";
import { geraetEntfernen } from "../../../../../../lib/zugang/anmeldung";

export const dynamic = "force-dynamic";

export const POST = route("geraetEntfernen", async (kontext) => ({
  daten: await geraetEntfernen(kontext),
}));
