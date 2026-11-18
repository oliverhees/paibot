import { pingDatabase } from "@paibot/db/migrate";

export type DbState = "ok" | "down" | "not_configured";

/** Zustand der Datenbank: erreichbar, nicht erreichbar oder nicht eingerichtet. */
export async function databaseState(): Promise<DbState> {
  const url = process.env.DATABASE_URL;
  if (!url) return "not_configured";
  return (await pingDatabase(url)) ? "ok" : "down";
}
