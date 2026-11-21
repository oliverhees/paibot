/**
 * PaiBot – Suchfeld mit Lupe, verstecktem Label und Knopf zum Leeren.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import { type InputHTMLAttributes, type KeyboardEvent, type Ref, useId } from "react";
import { Icon } from "../basis/Icon";
import { klassen } from "../basis/klassen";
import { Ladekreis } from "../basis/Ladekreis";
import feld from "./Feld.module.css";
import styles from "./SuchFeld.module.css";

export interface SuchFeldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type" | "value" | "onChange"> {
  /** Beschriftung für Screenreader (sichtbar ist nur der Platzhalter). */
  label: string;
  wert: string;
  onWert: (wert: string) => void;
  /** Beschriftung des Knopfs zum Leeren; ohne sie gibt es keinen Knopf. */
  leerenLabel?: string;
  /** Lade-Zeichen statt Knopf. */
  laedt?: boolean;
  /** Pfeil nach unten im Feld (z. B. zu den Treffern springen). */
  onRunter?: () => void;
  feldRef?: Ref<HTMLInputElement>;
}

/** Suchfeld: Esc leert, Pfeil nach unten ruft `onRunter`. */
export function SuchFeld({
  label,
  wert,
  onWert,
  leerenLabel,
  laedt,
  onRunter,
  feldRef,
  className,
  onKeyDown,
  ...rest
}: SuchFeldProps) {
  const id = useId();
  function taste(e: KeyboardEvent<HTMLInputElement>) {
    onKeyDown?.(e);
    if (e.defaultPrevented) return;
    if (e.key === "Escape" && wert !== "") {
      e.preventDefault();
      onWert("");
    } else if (e.key === "ArrowDown" && onRunter) {
      e.preventDefault();
      onRunter();
    }
  }
  return (
    <div className={klassen(styles.suche, className)}>
      <label className={styles.versteckt} htmlFor={id}>
        {label}
      </label>
      <span className={styles.lupe}>
        <Icon name="suche" />
      </span>
      <input
        {...rest}
        ref={feldRef}
        id={id}
        type="search"
        autoComplete="off"
        spellCheck={false}
        value={wert}
        onChange={(e) => onWert(e.target.value)}
        onKeyDown={taste}
        aria-busy={laedt || undefined}
        className={klassen(feld.eingabe, styles.eingabe)}
      />
      {laedt ? (
        <span className={styles.rechts}>
          <Ladekreis />
        </span>
      ) : (
        wert !== "" &&
        leerenLabel && (
          <button
            type="button"
            className={klassen(styles.rechts, styles.leeren)}
            aria-label={leerenLabel}
            title={leerenLabel}
            onClick={() => onWert("")}
          >
            <Icon name="x" groesse={14} />
          </button>
        )
      )}
    </div>
  );
}
