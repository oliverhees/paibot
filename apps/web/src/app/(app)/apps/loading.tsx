/**
 * PaiBot – Ladezustand der Seite „Apps“.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { t } from "@paibot/shared/texte";
import { Ladekreis, SeitenSpalte } from "@paibot/ui";
import styles from "./apps.module.css";

export default function Laedt() {
  return (
    <SeitenSpalte titel={t("seite.apps")} einleitung={t("apps.seite.einleitung")}>
      <p className={styles.laedt} role="status">
        <Ladekreis /> {t("apps.seite.laedt")}
      </p>
    </SeitenSpalte>
  );
}
