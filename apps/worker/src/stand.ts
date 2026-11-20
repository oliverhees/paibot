/**
 * PaiBot – Stand der Software für den Worker: aus `PAIBOT_BUILD` oder `<version>+dev`.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { notImplemented } from "@paibot/stub";

/** Name der Umgebungsvariable mit dem Stand, z. B. `0.3.0+20261205.3f9c2ab`. */
export const STAND_ENV = "PAIBOT_BUILD";

/**
 * Stand der Software: der Wert von `PAIBOT_BUILD`, wenn gesetzt; sonst `<version>+dev` mit
 * `version` aus dem `package.json` im Projektstamm (beim Bündeln fest eingesetzt).
 */
export function readStand(env: Readonly<Record<string, string | undefined>>): string {
  return notImplemented("worker.readStand", env);
}
