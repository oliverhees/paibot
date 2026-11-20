/**
 * PaiBot – Text nur für Screenreader.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { ReactNode } from "react";
import styles from "./NurLesbar.module.css";

/** Text nur für Screenreader, auf dem Bildschirm unsichtbar. */
export function NurLesbar({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <span id={id} className={styles.nurLesbar}>
      {children}
    </span>
  );
}
