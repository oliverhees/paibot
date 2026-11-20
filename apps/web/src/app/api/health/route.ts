/**
 * PaiBot – Health-Endpunkt: meldet, ob App und Datenbank laufen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-07
 */

import { APP_NAME } from "@paibot/shared";
import { readStand, versionOf } from "@paibot/shared/stand";
import { databaseState } from "../../../lib/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = await databaseState();
  const healthy = db !== "down";
  return Response.json(
    {
      status: healthy ? "ok" : "degraded",
      app: APP_NAME,
      db,
      time: new Date().toISOString(),
      version: versionOf(readStand(process.env)),
    },
    { status: healthy ? 200 : 503 },
  );
}
