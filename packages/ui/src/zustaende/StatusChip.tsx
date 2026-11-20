/**
 * PaiBot – Status-Marke, immer mit Wort.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { klassen } from "../basis/klassen";
import styles from "./StatusChip.module.css";

export type StatusArt = "ok" | "warn" | "fehler" | "neutral" | "eu" | "arbeitet";

export interface StatusChipProps {
  art: StatusArt;
  /** Das Wort zum Status. Pflicht: Status wird nie nur über Farbe gezeigt. */
  children: string;
  className?: string;
}

/** Kleine Marke mit Punkt und Wort, z. B. „gültig“, „nicht erreichbar“, „EU“. */
export function StatusChip({ art, children, className }: StatusChipProps) {
  return (
    <span className={klassen(styles.chip, styles[art], className)} data-art={art}>
      {art !== "eu" && <span className={styles.punkt} aria-hidden="true" />}
      {children}
    </span>
  );
}
