/**
 * PaiBot – Fehler beim Verbinden einer App: eine Meldung je Art, mit dem, was jetzt hilft.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { t } from "@paibot/shared/texte";
import type { ReactNode } from "react";
import { Icon } from "../basis/Icon";
import { klassen } from "../basis/klassen";
import styles from "./AppZeile.module.css";

export type AppFehlerArt =
  | "nicht_erreichbar"
  | "zugang_ungueltig"
  | "adresse_unzulaessig"
  | "kein_mcp"
  | "befehl_nicht_erlaubt"
  | "version_unbekannt"
  | "braucht_eingabe";

export const APP_FEHLER_ARTEN: readonly AppFehlerArt[] = [
  "nicht_erreichbar",
  "zugang_ungueltig",
  "adresse_unzulaessig",
  "kein_mcp",
  "befehl_nicht_erlaubt",
  "version_unbekannt",
  "braucht_eingabe",
];

export interface AppFehlerProps {
  art: AppFehlerArt;
  /** Knopf zum Ausweg, z. B. „Erneut versuchen“. */
  aktion?: ReactNode;
  className?: string;
}

/** Sagt, was schiefging, und was jetzt hilft. Der Text kommt von PaiBot, nie von der App. */
export function AppFehler({ art, aktion, className }: AppFehlerProps) {
  return (
    <div className={klassen(styles.fehler, className)} role="alert" data-fehler={art}>
      <span className={styles.fehlerIcon} aria-hidden="true">
        <Icon name="warnung" groesse={16} />
      </span>
      <div className={styles.fehlerText}>
        <p className={styles.fehlerTitel}>{t(`apps.fehler.${art}.titel`)}</p>
        <p>{t(`apps.fehler.${art}.text`)}</p>
        <p>{t(`apps.fehler.${art}.ausweg`)}</p>
        {aktion && <div className={styles.fehlerAktion}>{aktion}</div>}
      </div>
    </div>
  );
}
