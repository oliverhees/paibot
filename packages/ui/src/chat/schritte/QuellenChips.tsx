/**
 * PaiBot – Quellen eines Nachschlag-Schritts als Chips mit reinem Text, ohne Link.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { t } from "@paibot/shared/texte";
import styles from "./Schritte.module.css";
import { schrittText } from "./text";

export interface QuellenAngabe {
  /** Seite der Doku, z. B. „Einstellungen“. */
  seite: string;
  /** Abschnitt auf der Seite, z. B. „Tagesbudget“. */
  abschnitt: string;
}

/** Mehr als so viele Chips zeigt PaiBot nicht. */
export const QUELLEN_MAX = 10;

/**
 * „Seite · Abschnitt“ als Chips. Der Text steht als Textknoten, bereinigt und gekürzt; ein Chip
 * ist weder Link noch Knopf, solange die App keine eigene Doku-Ansicht hat.
 */
export function QuellenChips({ quellen }: { quellen: readonly QuellenAngabe[] }) {
  if (quellen.length === 0) return null;
  return (
    <ul className={styles.quellen} aria-label={t("schritte.quellen.label")}>
      {quellen.slice(0, QUELLEN_MAX).map((q, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: Reihenfolge ist fest, Quellen können doppelt vorkommen
        <li key={i} className={styles.quelle}>
          <bdi data-fremd="quelle">
            {schrittText(q.seite, "quelle")} · {schrittText(q.abschnitt, "quelle")}
          </bdi>
        </li>
      ))}
    </ul>
  );
}
