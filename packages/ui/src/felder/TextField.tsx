/**
 * PaiBot – Einzeiliges Eingabefeld.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { InputHTMLAttributes } from "react";
import { klassen } from "../basis/klassen";
import { Ladekreis } from "../basis/Ladekreis";
import { Feld, type FeldRahmenProps } from "./Feld";
import styles from "./Feld.module.css";

export interface TextFieldProps
  extends FeldRahmenProps,
    Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  id?: string;
  /** Zeigt rechts im Feld ein Lade-Zeichen (z. B. während einer Prüfung). */
  laedt?: boolean;
}

/** Einzeiliges Eingabefeld mit Label, Hilfe und Fehler. */
export function TextField({
  label,
  hilfe,
  fehler,
  labelVersteckt,
  id,
  laedt,
  className,
  type = "text",
  ...rest
}: TextFieldProps) {
  return (
    <Feld label={label} hilfe={hilfe} fehler={fehler} labelVersteckt={labelVersteckt} id={id}>
      {(zugang) => (
        <span className={styles.mitLaden}>
          <input
            {...rest}
            {...zugang}
            type={type}
            aria-busy={laedt || undefined}
            className={klassen(styles.eingabe, className)}
          />
          {laedt && (
            <span className={styles.laden}>
              <Ladekreis />
            </span>
          )}
        </span>
      )}
    </Feld>
  );
}
