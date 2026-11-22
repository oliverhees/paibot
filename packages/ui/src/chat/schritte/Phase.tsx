/**
 * PaiBot – Phase des Laufs als Wort neben dem Namen: wartet, denkt, schreibt, schlägt nach, wird gestoppt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { t } from "@paibot/shared/texte";
import styles from "./Schritte.module.css";

export type PhaseArt = "wartet" | "denkt" | "schreibt" | "schlaegt_nach" | "stoppt";

export const PHASEN: readonly PhaseArt[] = [
  "wartet",
  "denkt",
  "schreibt",
  "schlaegt_nach",
  "stoppt",
];

/**
 * Kurzes Wort zur Phase, immer als Text. Es wird nicht vorgelesen, wenn es wechselt (kein Live-
 * Bereich); die Seite sagt Wichtiges selbst an.
 */
export function Phase({ art }: { art: PhaseArt }) {
  return (
    <span className={styles.phase} data-phase={art}>
      <span className={styles.phasePunkt} aria-hidden="true" />
      {t(`schritte.phase.${art}`)}
    </span>
  );
}
