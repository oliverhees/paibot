/**
 * PaiBot – API-Route `/api/einrichtung`: Zustand der Einrichtung lesen und die Einrichtung abschließen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { route } from "../../../lib/api/route";
import { einrichtungAbschliessen, einrichtungsStatus } from "../../../lib/zugang/einrichtung";

export const dynamic = "force-dynamic";

export const GET = route("einrichtungStatus", async ({ db, dienste }) => ({
  daten: await einrichtungsStatus(db, dienste),
}));

export const POST = route("einrichtungAbschliessen", async (kontext) => ({
  daten: await einrichtungAbschliessen(kontext),
}));
