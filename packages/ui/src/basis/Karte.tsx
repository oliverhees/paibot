/**
 * PaiBot – Karte: ruhige Fläche für einen Abschnitt einer Seite, mit Überschrift und optionaler
 * Marke rechts daneben.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { type ReactNode, useId } from "react";
import styles from "./Karte.module.css";
import { klassen } from "./klassen";

export interface KarteProps {
  /** Überschrift (h2); ohne sie ist die Karte nur eine Fläche. */
  titel?: string;
  /** Marke oder Knopf rechts neben der Überschrift. */
  rechts?: ReactNode;
  children: ReactNode;
  /** „leise“: ohne Fläche, nur Abstand (für Abschnitte ohne Rahmen). */
  art?: "flaeche" | "leise" | "hinweis";
  className?: string;
}

/** Abschnitt einer Seite als Karte; mit Titel wird sie zu einer benannten Region. */
export function Karte({ titel, rechts, children, art = "flaeche", className }: KarteProps) {
  const titelId = useId();
  return (
    <section
      className={klassen(styles.karte, styles[art], className)}
      aria-labelledby={titel ? titelId : undefined}
    >
      {(titel || rechts) && (
        <div className={styles.kopf}>
          {titel && (
            <h2 id={titelId} className={styles.titel}>
              {titel}
            </h2>
          )}
          {rechts && <div className={styles.rechts}>{rechts}</div>}
        </div>
      )}
      {children}
    </section>
  );
}
