/**
 * PaiBot – Rahmen für Eingabefelder mit Label, Hilfe und Fehler.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { type ReactNode, useId } from "react";
import styles from "./Feld.module.css";

export interface FeldRahmenProps {
  label: string;
  /** Kurzer Hinweis unter dem Feld. */
  hilfe?: ReactNode;
  /** Fehlertext; macht das Feld ungültig und wird vorgelesen. */
  fehler?: ReactNode;
  /** Label nur für Screenreader. */
  labelVersteckt?: boolean;
}

interface FeldProps extends FeldRahmenProps {
  id?: string;
  children: (zugang: {
    id: string;
    "aria-describedby"?: string;
    "aria-invalid"?: true;
  }) => ReactNode;
}

/** Rahmen für Eingabefelder: Label, Feld, Hilfe und Fehler, sauber verbunden. */
export function Feld({ label, hilfe, fehler, labelVersteckt, id, children }: FeldProps) {
  const eigen = useId();
  const feldId = id ?? `${eigen}feld`;
  const hilfeId = hilfe ? `${eigen}hilfe` : undefined;
  const fehlerId = fehler ? `${eigen}fehler` : undefined;
  const beschrieben = [fehlerId, hilfeId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={styles.feld}>
      <label htmlFor={feldId} className={labelVersteckt ? styles.versteckt : styles.label}>
        {label}
      </label>
      {children({
        id: feldId,
        ...(beschrieben ? { "aria-describedby": beschrieben } : {}),
        ...(fehler ? { "aria-invalid": true as const } : {}),
      })}
      {fehler && (
        <span id={fehlerId} className={styles.fehler}>
          {fehler}
        </span>
      )}
      {hilfe && (
        <span id={hilfeId} className={styles.hilfe}>
          {hilfe}
        </span>
      )}
    </div>
  );
}
