/**
 * PaiBot – Liste fester Regeln und Grenzen (Kennung, Satz, Erklärung, Stufen) und der Weg einer
 * Aktion durch das Tor.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import type { ReactNode } from "react";
import styles from "./RegelListe.module.css";

/** Eine Stufe als kleine Marke; `an` hebt die geltende Stufe hervor. */
export interface RegelStufe {
  text: string;
  an?: "ja" | "frage" | "nie";
}

export interface RegelEintrag {
  /** Lesbare Kennung, z. B. `R-001` oder `G-01`. */
  nr: string;
  satz: ReactNode;
  erklaerung?: ReactNode;
  stufen?: readonly RegelStufe[];
}

export interface RegelListeProps {
  eintraege: readonly RegelEintrag[];
  label: string;
}

/** Regeln oder Grenzen als Liste. Nur zum Lesen. */
export function RegelListe({ eintraege, label }: RegelListeProps) {
  return (
    <ul className={styles.liste} aria-label={label}>
      {eintraege.map((e) => (
        <li key={e.nr} className={styles.regel}>
          <span className={styles.nr}>{e.nr}</span>
          <div className={styles.text}>
            <p className={styles.satz}>{e.satz}</p>
            {e.erklaerung && <p className={styles.erkl}>{e.erklaerung}</p>}
          </div>
          {e.stufen && e.stufen.length > 0 && (
            <span className={styles.stufen}>
              {e.stufen.map((s) => (
                <span key={s.text} data-an={s.an}>
                  {s.text}
                </span>
              ))}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

export interface TorWegProps {
  label: string;
  stationen: readonly { titel: string; text: string }[];
}

/** Aktion → Tor → Beleg als drei Stationen; die mittlere ist hervorgehoben. */
export function TorWeg({ label, stationen }: TorWegProps) {
  const mitte = Math.floor(stationen.length / 2);
  return (
    <ol className={styles.weg} aria-label={label}>
      {stationen.map((s, i) => (
        <li key={s.titel} className={styles.station} data-mitte={i === mitte || undefined}>
          {i > 0 && (
            <span className={styles.pfeil} aria-hidden="true">
              →
            </span>
          )}
          <span className={styles.kasten}>
            <strong>{s.titel}</strong>
            <span>{s.text}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
