/**
 * PaiBot – Namen im Raum vergleichen. Die Vergleichsfunktionen selbst liegen in
 * `@paibot/shared/namen`, damit die Verwaltung der Bots und der Raum dieselben nutzen; hier steht
 * nur, was der Raum darüber hinaus braucht.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

export {
  aehnlichkeitsForm,
  istTeamName,
  type NamensKonflikt,
  namensKonflikte,
  neuerNameUnzulaessig,
  vergleichsName,
} from "@paibot/shared/namen";

/** Ein Bot, wie der Raum ihn sieht. */
export interface RaumBot {
  readonly id: string;
  readonly name: string;
  readonly pausiert: boolean;
}
