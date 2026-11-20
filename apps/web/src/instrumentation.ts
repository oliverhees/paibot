/**
 * PaiBot – Einstiegspunkt beim Serverstart; startet die Migrationen nur in der Node-Laufzeit.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-07
 */

/** Läuft einmal beim Serverstart. Der Node-Teil liegt getrennt, damit die Edge-Laufzeit ihn nicht lädt. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { applyMigrations } = await import("./instrumentation-node");
    await applyMigrations();
  }
}
