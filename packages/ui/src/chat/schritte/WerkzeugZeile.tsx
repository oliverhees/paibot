/**
 * PaiBot – Werkzeug-Zeile: ein Schritt von Pai mit Status in Worten, Quellen, Regel und Beleg.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { t } from "@paibot/shared/texte";
import { useId } from "react";
import { Icon, type IconName } from "../../basis/Icon";
import { klassen } from "../../basis/klassen";
import { NurLesbar } from "../../basis/NurLesbar";
import { type QuellenAngabe, QuellenChips } from "./QuellenChips";
import styles from "./Schritte.module.css";
import { schrittText } from "./text";

export type WerkzeugZeileStatus =
  | "laeuft"
  | "fertig"
  | "abgelehnt"
  | "fehlgeschlagen"
  | "abgebrochen";

export const WERKZEUG_ZEILE_STATUS: readonly WerkzeugZeileStatus[] = [
  "laeuft",
  "fertig",
  "abgelehnt",
  "fehlgeschlagen",
  "abgebrochen",
];

const STATUS_SYMBOL: Record<WerkzeugZeileStatus, IconName | null> = {
  laeuft: null,
  fertig: "check",
  abgelehnt: "x",
  fehlgeschlagen: "warnung",
  abgebrochen: "stopp",
};

export interface WerkzeugZeileProps {
  /** Titel von PaiBot, nicht vom Modell (z. B. „In der Doku nachschlagen“). */
  titel: string;
  /** Symbol vor dem Titel; Standard Zahnrad. */
  symbol?: IconName;
  /**
   * Name, den das Modell dem Werkzeug gegeben hat. Nur bei einem Werkzeug, das PaiBot nicht
   * kennt. Er steht als Zitat in Anführungszeichen, nie in der Gestalt einer Kennzeichnung.
   */
  nameVomModell?: string;
  /** Kurzform der Frage ans Werkzeug, vom Modell. Steht als Zitat. */
  eingabeKurz?: string;
  status: WerkzeugZeileStatus;
  /** Grund in Worten bei „abgelehnt“ oder „fehlgeschlagen“ (Text von PaiBot, nicht des Modells). */
  statusText?: string;
  /** Kurzes Ergebnis, z. B. „2 Abschnitte“ oder „nichts gefunden“. */
  zusatz?: string;
  quellen?: readonly QuellenAngabe[];
  regel?: { id: string; titel: string };
  beleg?: { kennung: string; onOeffnen?: () => void };
  offen: boolean;
  onUmschalten: () => void;
}

/**
 * Eine Zeile je Werkzeug-Aufruf, über der Antwort. Den Status sagt immer ein Wort, nie nur eine
 * Farbe. Aufgeklappt stehen Quellen, Regel und Beleg da. Das Wort für den Status kommt nur aus
 * `status`, nie aus dem Namen oder der Frage.
 */
export function WerkzeugZeile({
  titel,
  symbol = "zahnrad",
  nameVomModell,
  eingabeKurz,
  status,
  statusText,
  zusatz,
  quellen,
  regel,
  beleg,
  offen,
  onUmschalten,
}: WerkzeugZeileProps) {
  const panelId = useId();
  const statusWort = t(`schritte.werkzeug.status.${status}`);
  const statusSymbol = STATUS_SYMBOL[status];
  const name = nameVomModell === undefined ? "" : schrittText(nameVomModell, "name");
  const frage = eingabeKurz === undefined ? "" : schrittText(eingabeKurz, "eingabe");
  const hatDetail =
    (quellen?.length ?? 0) > 0 || regel !== undefined || beleg !== undefined || !!statusText;
  const kopf = (
    <>
      <span className={styles.wzIcon}>
        <Icon name={symbol} groesse={13} />
      </span>
      <span className={styles.wzText}>
        <b className={styles.wzTitel}>{titel}</b>
        {name !== "" && (
          <>
            {" "}
            <span className={styles.fremd} data-fremd="name">
              „<bdi>{name}</bdi>“
            </span>
          </>
        )}
        {frage !== "" && (
          <>
            {" · "}
            <span className={styles.fremd} data-fremd="eingabe">
              „<bdi>{frage}</bdi>“
            </span>
          </>
        )}
        {" · "}
        <span className={styles.status} data-status={status} data-kennzeichnung="status">
          <NurLesbar>{t("schritte.werkzeug.status.praefix")} </NurLesbar>
          {statusSymbol === null ? (
            <span className={styles.ring} aria-hidden="true" />
          ) : (
            <Icon name={statusSymbol} groesse={12} />
          )}
          <span>{statusWort}</span>
        </span>
        {zusatz && <span className={styles.zusatz}> · {zusatz}</span>}
      </span>
      {hatDetail && (
        <Icon name="runter" groesse={13} className={klassen(styles.pfeil, styles.wzPfeil)} />
      )}
    </>
  );
  return (
    <div className={styles.werkzeug} data-baustein="werkzeug-zeile" data-status={status}>
      {hatDetail ? (
        <button
          type="button"
          className={styles.wzZeile}
          aria-expanded={offen}
          aria-controls={panelId}
          onClick={onUmschalten}
        >
          {kopf}
        </button>
      ) : (
        <div className={styles.wzZeile}>{kopf}</div>
      )}
      {hatDetail && (
        <dl id={panelId} className={styles.wzDetail} hidden={!offen}>
          {quellen && quellen.length > 0 && (
            <>
              <dt>{t("schritte.werkzeug.detail.quellen")}</dt>
              <dd>
                <QuellenChips quellen={quellen} />
              </dd>
            </>
          )}
          {regel && (
            <>
              <dt>{t("schritte.werkzeug.detail.regel")}</dt>
              <dd>
                <span className={styles.mono}>{regel.id}</span> „{regel.titel}“
              </dd>
            </>
          )}
          {statusText && (
            <>
              <dt>{t("schritte.werkzeug.detail.grund")}</dt>
              <dd>{statusText}</dd>
            </>
          )}
          {beleg && (
            <>
              <dt>{t("schritte.werkzeug.detail.beleg")}</dt>
              <dd>
                {beleg.onOeffnen ? (
                  <button
                    type="button"
                    className={styles.beleg}
                    onClick={beleg.onOeffnen}
                    aria-label={t("schritte.werkzeug.beleg.oeffnen", { kennung: beleg.kennung })}
                  >
                    <Icon name="beleg" groesse={12} />
                    <span className={styles.mono}>{beleg.kennung}</span>
                  </button>
                ) : (
                  <span className={styles.mono}>{beleg.kennung}</span>
                )}
              </dd>
            </>
          )}
        </dl>
      )}
    </div>
  );
}
