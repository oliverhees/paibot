/**
 * PaiBot – kleine Marken im Faden: „dran“, „führt“, „direkte Bitte“, „Leitung“, „aus fremden Inhalten“.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { t } from "@paibot/shared/texte";
import styles from "./Marken.module.css";
import { Sym } from "./symbole";

// Alle Marken sind nur Anzeige. Wer „führt“ und wer „dran“ ist, kommt aus Ereignissen des
// Servers und nie aus dem Text eines Bots; die Bausteine bekommen es fertig übergeben.

/** „dran“: der Bot hat einen offenen Auftrag. Es können mehrere zugleich sein. */
export function DranMarke() {
  return (
    <span className={styles.dran} data-marke="dran">
      {t("faden.stab.dran")}
    </span>
  );
}

/** „führt“: das Kennzeichen der Leitung. */
export function FuehrtMarke() {
  return (
    <span
      className={styles.fuehrt}
      data-marke="fuehrt"
      role="img"
      aria-label={t("faden.stab.fuehrt")}
    >
      <Sym name="ziel" groesse={10} />
    </span>
  );
}

export function DirekteBitteMarke() {
  return (
    <span className={styles.bitte} data-marke="bitte">
      <Sym name="zurueck" groesse={12} />
      {t("faden.beitrag.direkte_bitte")}
    </span>
  );
}

export function LeitungMarke() {
  return <span className={styles.leitung}>{t("faden.beitrag.leitung")}</span>;
}

/** Kennzeichen: Der Text stammt aus fremden Inhalten. */
export function FremdMarke() {
  return (
    <span className={styles.fremd} data-marke="fremd" title={t("faden.beitrag.fremd_hinweis")}>
      {t("faden.beitrag.fremd")}
    </span>
  );
}
