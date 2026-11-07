import { pingDatabase } from "@paibot/db/migrate";
import { APP_NAME } from "@paibot/shared";

export const dynamic = "force-dynamic";

type DbState = "ok" | "down" | "not_configured";

export async function GET() {
  const url = process.env.DATABASE_URL;
  let db: DbState = "not_configured";
  if (url) db = (await pingDatabase(url)) ? "ok" : "down";

  const healthy = db !== "down";
  return Response.json(
    { status: healthy ? "ok" : "degraded", app: APP_NAME, db, time: new Date().toISOString() },
    { status: healthy ? 200 : 503 },
  );
}
