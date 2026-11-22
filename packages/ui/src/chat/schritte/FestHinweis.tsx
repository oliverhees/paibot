/**
 * PaiBot – Hinweis „Antwort von PaiBot, nicht vom Modell“ als eigenes Element.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { t } from "@paibot/shared/texte";
import { Icon } from "../../basis/Icon";
import styles from "./Schritte.module.css";

/**
 * Kennzeichnung einer festen Antwort von PaiBot. Sie steht außerhalb des Textes der Blase, kommt
 * nie aus dem Text und hängt nur an der Herkunft der Antwort, die der Aufrufer meldet.
 */
export function FestHinweis() {
  return (
    <span className={styles.fest} role="note" data-kennzeichnung="fest">
      <Icon name="info" groesse={13} />
      <span>{t("schritte.fest.hinweis")}</span>
    </span>
  );
}
