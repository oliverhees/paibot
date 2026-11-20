/**
 * PaiBot – Knopf nur mit Symbol und zugänglichem Namen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { ButtonHTMLAttributes } from "react";
import { Icon, type IconName } from "./Icon";
import styles from "./IconButton.module.css";
import { klassen } from "./klassen";

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label"> {
  icon: IconName;
  /** Zugänglicher Name; Pflicht, weil der Knopf keinen sichtbaren Text hat. */
  label: string;
  /** Rund und gefüllt (z. B. Senden). */
  art?: "flach" | "rund" | "rund-akzent";
  groesse?: number;
}

/** Knopf nur mit Symbol. Der Name steht im `aria-label` und als Hinweis beim Zeigen. */
export function IconButton({
  icon,
  label,
  art = "flach",
  groesse = 32,
  className,
  type = "button",
  title,
  style,
  ...rest
}: IconButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      aria-label={label}
      title={title ?? label}
      className={klassen(styles.knopf, styles[art], className)}
      style={{ width: groesse, height: groesse, ...style }}
    >
      <Icon name={icon} groesse={art === "flach" ? 16 : 17} />
    </button>
  );
}
