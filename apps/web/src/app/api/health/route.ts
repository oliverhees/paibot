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
import { databaseHealth } from "../../../lib/health";

const ROLLE_GEMELDET = Symbol.for("paibot.web.health-rolle-gemeldet");

export const dynamic = "force-dynamic";

export async function GET() {
  const { db, role } = await databaseHealth();
  const healthy = db !== "down";
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  // Zu viele Rechte stehen nur im Log (einmal je Prozess), nie in der Antwort an Fremde.
  const halter = globalThis as { [ROLLE_GEMELDET]?: true };
  if (role === "zu_viele_rechte" && !halter[ROLLE_GEMELDET]) {
    halter[ROLLE_GEMELDET] = true;
    console.warn("[paibot] WARNUNG: Die App-Verbindung zur Datenbank hat zu viele Rechte.");
  }
  return Response.json(
    {
      status: healthy ? "ok" : "degraded",
      app: APP_NAME,
      db,
      time: new Date().toISOString(),
      version: versionOf(readStand(process.env)),
    },
    { status: healthy ? 200 : 503, headers },
  );
}
