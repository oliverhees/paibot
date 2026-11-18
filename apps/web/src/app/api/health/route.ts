import { APP_NAME } from "@paibot/shared";
import { databaseState } from "../../../lib/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = await databaseState();
  const healthy = db !== "down";
  return Response.json(
    { status: healthy ? "ok" : "degraded", app: APP_NAME, db, time: new Date().toISOString() },
    { status: healthy ? 200 : 503 },
  );
}
