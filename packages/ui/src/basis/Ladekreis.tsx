/**
 * PaiBot – Kleines Lade-Zeichen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import styles from "./Ladekreis.module.css";

/** Kleines Lade-Zeichen; steht bei reduzierter Bewegung still. */
export function Ladekreis({ groesse = 14 }: { groesse?: number }) {
  return (
    <span
      className={styles.ladekreis}
      style={{ width: groesse, height: groesse }}
      aria-hidden="true"
    />
  );
}
