import { APP_NAME } from "@paibot/shared";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json({ status: "ok", app: APP_NAME, time: new Date().toISOString() });
}
