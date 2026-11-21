/**
 * PaiBot – deutliches Ergebnis eines Tests (z. B. Verbindungstest): Erfolg grün mit Haken, Fehler
 * rot mit Warnzeichen, immer mit Text – nie nur Farbe.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import type { ReactNode } from "react";
import { Icon } from "../basis/Icon";
import { klassen } from "../basis/klassen";
import styles from "./TestErgebnis.module.css";

export interface TestErgebnisProps {
  art: "ok" | "fehler";
  /** Kurzes Urteil vorn, z. B. „Verbindung steht“ bzw. „Verbindung fehlgeschlagen“. */
  titel: string;
  /** Satz dazu (und bei Fehlern der Ausweg). */
  children?: ReactNode;
  className?: string;
}

/**
 * Ergebnis als Kasten. Fehler werden mit `role="alert"` angesagt, Erfolg mit `role="status"`.
 */
export function TestErgebnis({ art, titel, children, className }: TestErgebnisProps) {
  return (
    <div
      className={klassen(styles.kasten, className)}
      data-art={art}
      role={art === "fehler" ? "alert" : "status"}
    >
      <span className={styles.symbol} aria-hidden="true">
        <Icon name={art === "ok" ? "check" : "warnung"} />
      </span>
      <div className={styles.text}>
        <strong>{titel}</strong>
        {children !== undefined && <div>{children}</div>}
      </div>
    </div>
  );
}
