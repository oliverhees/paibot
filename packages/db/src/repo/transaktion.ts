/**
 * PaiBot – Kleine Hilfe für Transaktionen, die mit postgres-js und PGlite gleich funktioniert.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { Database } from "../client";

/**
 * Führt `arbeit` in einer Transaktion aus: Gelingt sie, wird bestätigt, wirft sie, wird alles
 * zurückgenommen. Ist `db` selbst schon eine Transaktion, entsteht ein Sicherungspunkt.
 */
export function withTransaction<T>(db: Database, arbeit: (tx: Database) => Promise<T>): Promise<T> {
  return db.transaction((tx) => arbeit(tx));
}
