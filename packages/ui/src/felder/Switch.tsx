/**
 * PaiBot – Schalter mit role="switch".
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { klassen } from "../basis/klassen";
import styles from "./Switch.module.css";

export interface SwitchProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "children" | "role"> {
  an: boolean;
  onAendern: (an: boolean) => void;
  /** Sichtbare Beschriftung neben dem Schalter. */
  children: ReactNode;
  /** Vollständiger zugänglicher Name, falls die sichtbare Beschriftung verkürzt ist. */
  label?: string;
}

/** Schalter mit echtem `role="switch"`; Leertaste und Enter schalten um. */
export function Switch({
  an,
  onAendern,
  children,
  label,
  className,
  disabled,
  ...rest
}: SwitchProps) {
  return (
    <button
      {...rest}
      type="button"
      role="switch"
      aria-checked={an}
      aria-label={label}
      disabled={disabled}
      className={klassen(styles.schalter, className)}
      onClick={() => onAendern(!an)}
    >
      <span className={styles.bahn} aria-hidden="true" />
      <span className={styles.text}>{children}</span>
    </button>
  );
}
