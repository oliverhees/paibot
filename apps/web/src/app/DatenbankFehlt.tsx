/**
 * PaiBot – Hinweis, wenn die Datenbank nicht erreichbar ist (ohne technische Details).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { t } from "@paibot/shared/texte";
import { EmptyState, Logo } from "@paibot/ui";
import styles from "./not-found.module.css";

export function DatenbankFehlt() {
  return (
    <main className={styles.seite}>
      <EmptyState
        bild={<Logo titel="PaiBot" />}
        titel={t("zugang.datenbank.titel")}
        text={t("zugang.datenbank.text")}
      />
    </main>
  );
}
