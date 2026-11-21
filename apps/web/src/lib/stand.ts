/**
 * PaiBot – Stand der Software für Kopfzeilen und Belege.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { readStand } from "@paibot/shared/stand";

/** Stand dieses Prozesses: `PAIBOT_BUILD` oder `<version>+dev`. */
export function stand(): string {
  return readStand(process.env);
}
