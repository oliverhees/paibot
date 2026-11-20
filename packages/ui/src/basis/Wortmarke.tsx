/**
 * PaiBot – Schriftzug PaiBot.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { APP_NAME } from "@paibot/shared/sprache";
import styles from "./Wortmarke.module.css";

/** Schriftzug „PaiBot“ mit hervorgehobenem zweiten Teil. */
export function Wortmarke({ groesse = 18 }: { groesse?: number }) {
  const mitte = APP_NAME.length - 3;
  return (
    <span className={styles.wortmarke} style={{ fontSize: groesse }}>
      {APP_NAME.slice(0, mitte)}
      <b>{APP_NAME.slice(mitte)}</b>
    </span>
  );
}
