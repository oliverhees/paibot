/**
 * PaiBot – ermittelt den Zustand der Datenbank für Startseite und Health-Endpunkt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-18
 */

import { pingDatabase } from "@paibot/db/migrate";

export type DbState = "ok" | "down" | "not_configured";

/** Zustand der Datenbank: erreichbar, nicht erreichbar oder nicht eingerichtet. */
export async function databaseState(): Promise<DbState> {
  const url = process.env.DATABASE_URL;
  if (!url) return "not_configured";
  return (await pingDatabase(url)) ? "ok" : "down";
}
