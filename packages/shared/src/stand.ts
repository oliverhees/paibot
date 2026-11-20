/**
 * PaiBot – Version und Stand der Software: eine Stelle für Web-App, Worker und Belege.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import projekt from "../../../package.json";

/** Name der Umgebungsvariable mit dem Stand, z. B. `0.3.0+20261205.3f9c2ab`. */
export const STAND_ENV = "PAIBOT_BUILD";

/** Version aus dem `package.json` im Projektstamm (beim Bauen fest eingesetzt). */
export const PAIBOT_VERSION: string = projekt.version;

/**
 * Stand der Software: der Wert von `PAIBOT_BUILD`, wenn gesetzt; sonst `<version>+dev` mit der
 * Version aus dem `package.json` im Projektstamm.
 */
export function readStand(env: Readonly<Record<string, string | undefined>>): string {
  const stand = env[STAND_ENV]?.trim();
  return stand ? stand : `${PAIBOT_VERSION}+dev`;
}

/** Nur die Version eines Stands, ohne den Teil ab `+`, z. B. `0.3.0` aus `0.3.0+20261205.3f9c2ab`. */
export function versionOf(stand: string): string {
  const plus = stand.indexOf("+");
  return plus === -1 ? stand : stand.slice(0, plus);
}
