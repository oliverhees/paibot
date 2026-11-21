/**
 * PaiBot – API-Route `/api/einrichtung/verbindungstest`: Schlüssel vor dem Abschluss prüfen (nur mit Einrichtungs-Code).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { route } from "../../../../lib/api/route";
import { einrichtungVerbindungstest } from "../../../../lib/zugang/einrichtung";

export const dynamic = "force-dynamic";

export const POST = route("einrichtungVerbindungstest", async (kontext) => ({
  daten: await einrichtungVerbindungstest(kontext),
}));
