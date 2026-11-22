/**
 * PaiBot – Fehlerzustand der Seite „Apps“: ein fester Satz mit Ausweg, nie der Text des Fehlers.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

"use client";

import { t } from "@paibot/shared/texte";
import { Button, Icon, SeitenSpalte } from "@paibot/ui";
import styles from "./apps.module.css";

export default function Fehler({ reset }: { error: Error; reset: () => void }) {
  return (
    <SeitenSpalte titel={t("seite.apps")} einleitung={t("apps.seite.einleitung")}>
      <div className={styles.seitenFehler} role="alert">
        <Icon name="warnung" groesse={16} />
        <div>
          <p className={styles.fett}>{t("apps.seite.fehler.titel")}</p>
          <p>{t("apps.seite.fehler.text")}</p>
          <p>{t("apps.seite.fehler.ausweg")}</p>
          <Button art="leise" onClick={reset}>
            {t("apps.seite.fehler.neu")}
          </Button>
        </div>
      </div>
    </SeitenSpalte>
  );
}
