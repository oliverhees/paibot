/**
 * PaiBot – Auswahlliste mit Label, Hilfe und Fehler.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { SelectHTMLAttributes } from "react";
import { klassen } from "../basis/klassen";
import { Feld, type FeldRahmenProps } from "./Feld";
import styles from "./Feld.module.css";

export interface SelectOption {
  wert: string;
  text: string;
  deaktiviert?: boolean;
}

export interface SelectProps
  extends FeldRahmenProps,
    Omit<SelectHTMLAttributes<HTMLSelectElement>, "id" | "children"> {
  id?: string;
  optionen: readonly SelectOption[];
}

/** Auswahlliste (natives `select`) mit Label, Hilfe und Fehler. */
export function Select({
  label,
  hilfe,
  fehler,
  labelVersteckt,
  id,
  optionen,
  className,
  ...rest
}: SelectProps) {
  return (
    <Feld label={label} hilfe={hilfe} fehler={fehler} labelVersteckt={labelVersteckt} id={id}>
      {(zugang) => (
        <select {...rest} {...zugang} className={klassen(styles.eingabe, className)}>
          {optionen.map((o) => (
            <option key={o.wert} value={o.wert} disabled={o.deaktiviert}>
              {o.text}
            </option>
          ))}
        </select>
      )}
    </Feld>
  );
}
