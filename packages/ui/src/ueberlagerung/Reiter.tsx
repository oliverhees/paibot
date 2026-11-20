/**
 * PaiBot – Reiter nach dem Tabs-Muster.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

"use client";

import { type ReactNode, useId, useRef } from "react";
import { menueIndex } from "../basis/fokus";
import { klassen } from "../basis/klassen";
import styles from "./Reiter.module.css";

export interface ReiterEintrag {
  id: string;
  text: string;
  /** Zahl neben dem Namen, z. B. Anzahl Belege. */
  zahl?: number;
  inhalt: ReactNode;
}

export interface ReiterProps {
  label: string;
  reiter: readonly ReiterEintrag[];
  aktiv: string;
  onWechsel: (id: string) => void;
  /** Platz rechts neben den Reitern, z. B. ein Schließen-Knopf. */
  zusatz?: ReactNode;
  className?: string;
  /** Klasse für die Leiste mit den Reitern. */
  leisteClassName?: string;
  /** Klasse für den Inhaltsbereich. */
  inhaltClassName?: string;
}

/** Reiter nach dem Tabs-Muster: Pfeiltasten wechseln, nur der aktive Reiter ist per Tab erreichbar. */
export function Reiter({
  label,
  reiter,
  aktiv,
  onWechsel,
  zusatz,
  className,
  leisteClassName,
  inhaltClassName,
}: ReiterProps) {
  const basis = useId();
  const leiste = useRef<HTMLDivElement>(null);
  const index = Math.max(
    0,
    reiter.findIndex((r) => r.id === aktiv),
  );
  const aktuell = reiter[index];
  return (
    <div className={klassen(styles.reiter, className)}>
      <div className={klassen(styles.leiste, leisteClassName)}>
        <div
          ref={leiste}
          role="tablist"
          aria-label={label}
          className={styles.liste}
          onKeyDown={(e) => {
            const neu = menueIndex(e.key, reiter.length, index);
            if (neu === null || e.key === "ArrowUp" || e.key === "ArrowDown") return;
            e.preventDefault();
            const ziel = reiter[neu];
            if (!ziel) return;
            onWechsel(ziel.id);
            leiste.current?.querySelectorAll<HTMLElement>("[role='tab']")[neu]?.focus();
          }}
        >
          {reiter.map((r, i) => (
            <button
              key={r.id}
              type="button"
              role="tab"
              id={`${basis}-${r.id}-tab`}
              aria-selected={i === index}
              aria-controls={`${basis}-${r.id}-panel`}
              tabIndex={i === index ? 0 : -1}
              className={styles.tab}
              onClick={() => onWechsel(r.id)}
            >
              {r.text}
              {r.zahl !== undefined && <span className={styles.zahl}>{r.zahl}</span>}
            </button>
          ))}
        </div>
        {zusatz}
      </div>
      {aktuell && (
        <div
          role="tabpanel"
          id={`${basis}-${aktuell.id}-panel`}
          aria-labelledby={`${basis}-${aktuell.id}-tab`}
          className={klassen(styles.panel, inhaltClassName)}
        >
          {aktuell.inhalt}
        </div>
      )}
    </div>
  );
}
