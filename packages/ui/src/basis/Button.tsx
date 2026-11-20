/**
 * PaiBot – Knopf mit Text in den Arten primär, zweit, leise und Gefahr.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { ButtonHTMLAttributes, ReactNode } from "react";
import styles from "./Button.module.css";
import { Icon, type IconName } from "./Icon";
import { klassen } from "./klassen";
import { Ladekreis } from "./Ladekreis";

export type ButtonArt = "primaer" | "zweit" | "leise" | "gefahr";

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  children: ReactNode;
  /** primaer: der eine wichtigste Knopf (Limette); zweit: Rand; leise: Fläche; gefahr: Löschen. */
  art?: ButtonArt;
  groesse?: "normal" | "gross";
  breit?: boolean;
  /** Zeigt das Lade-Zeichen und nimmt keine Klicks an. */
  laedt?: boolean;
  icon?: IconName;
}

/** Knopf mit Text. Der Typ ist standardmäßig `button`, nicht `submit`. */
export function Button({
  children,
  art = "zweit",
  groesse = "normal",
  breit = false,
  laedt = false,
  icon,
  className,
  disabled,
  type = "button",
  onClick,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      className={klassen(
        styles.knopf,
        styles[art],
        groesse === "gross" && styles.gross,
        breit && styles.breit,
        className,
      )}
      disabled={disabled}
      aria-busy={laedt || undefined}
      aria-disabled={laedt || undefined}
      onClick={laedt ? (e) => e.preventDefault() : onClick}
    >
      {laedt ? <Ladekreis /> : icon ? <Icon name={icon} groesse={15} /> : null}
      <span>{children}</span>
    </button>
  );
}
