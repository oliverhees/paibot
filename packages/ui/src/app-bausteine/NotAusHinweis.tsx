/**
 * PaiBot – Hinweis, solange der Not-Aus an ist: PaiBot ruft keine App auf.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { t } from "@paibot/shared/texte";
import { Icon } from "../basis/Icon";
import { klassen } from "../basis/klassen";
import styles from "./AppZeile.module.css";

export interface NotAusHinweisProps {
  /** Eigener Text; sonst der Standardtext zur Seite „Apps“. */
  text?: string;
  className?: string;
}

/** Zeigt, dass der Not-Aus gerade alle Aufrufe an Apps anhält. Bleibt sichtbar, ist kein Dialog. */
export function NotAusHinweis({ text, className }: NotAusHinweisProps) {
  return (
    <div className={klassen(styles.notaus, className)} role="status" data-notaus="">
      <span className={styles.fehlerIcon} aria-hidden="true">
        <Icon name="stopp" groesse={16} />
      </span>
      <div className={styles.fehlerText}>
        <p className={styles.fehlerTitel}>{t("apps.notaus.titel")}</p>
        <p>{text ?? t("apps.notaus.text")}</p>
      </div>
    </div>
  );
}
