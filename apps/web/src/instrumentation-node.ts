/**
 * PaiBot – wendet beim Serverstart die Datenbank-Migrationen an, mit Wiederholversuchen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-07
 */

import path from "node:path";
import { runMigrations } from "@paibot/db/migrate";

const ATTEMPTS = 5;
const DELAY_MS = 3000;

/**
 * Wendet offene Datenbank-Migrationen an, mit Wiederholversuchen.
 * Scheitert das, startet die App trotzdem; /api/health meldet dann "degraded".
 * Ohne DATABASE_URL startet die App ohne Datenbank (z. B. für die UI-Entwicklung).
 */
export async function applyMigrations() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.warn("[paibot] DATABASE_URL fehlt – Migrationen übersprungen.");
    return;
  }
  const folder =
    process.env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), "../../packages/db/drizzle");

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      await runMigrations(url, folder);
      console.log("[paibot] Datenbank-Migrationen angewendet.");
      return;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error(
        `[paibot] Migration fehlgeschlagen (Versuch ${attempt}/${ATTEMPTS}): ${reason}`,
      );
      if (attempt < ATTEMPTS) await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
    }
  }
  console.error("[paibot] Datenbank nicht erreichbar – App startet ohne Migrationen.");
}
