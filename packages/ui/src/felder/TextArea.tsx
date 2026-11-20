/**
 * PaiBot – Mehrzeiliges Eingabefeld.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { TextareaHTMLAttributes } from "react";
import { klassen } from "../basis/klassen";
import { Feld, type FeldRahmenProps } from "./Feld";
import styles from "./Feld.module.css";

export interface TextAreaProps
  extends FeldRahmenProps,
    Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> {
  id?: string;
}

/** Mehrzeiliges Eingabefeld mit Label, Hilfe und Fehler. */
export function TextArea({
  label,
  hilfe,
  fehler,
  labelVersteckt,
  id,
  className,
  ...rest
}: TextAreaProps) {
  return (
    <Feld label={label} hilfe={hilfe} fehler={fehler} labelVersteckt={labelVersteckt} id={id}>
      {(zugang) => (
        <textarea {...rest} {...zugang} className={klassen(styles.eingabe, className)} />
      )}
    </Feld>
  );
}
