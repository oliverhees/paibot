/**
 * PaiBot – Auswahl des Anbieters (EUrouter, Mistral AI, eigener oder lokaler Anbieter) für die
 * Einrichtung und die Seite „Modell und Anbieter“: neutral sortiert, je Anbieter nur Aussagen des
 * Anbieters mit Stand und ein klar gekennzeichneter Link zum Konto-Anlegen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import { t } from "@paibot/shared/texte";
import { Icon } from "@paibot/ui";
import { useId } from "react";
import {
  ANBIETER_REIHENFOLGE,
  ANGABEN_STAND,
  type AnbieterWahl,
  bedingungenLink,
  kontoLink,
} from "../lib/modelle/konto-links";
import styles from "./AnbieterAuswahl.module.css";

export interface AnbieterAuswahlProps {
  wert: AnbieterWahl | undefined;
  onWahl: (wahl: AnbieterWahl) => void;
  /** Fehlertext an der Gruppe (z. B. „Wähl einen Anbieter“). */
  fehler?: string;
  /** Nur diese Wege anbieten (Standard: alle drei). */
  wege?: readonly AnbieterWahl[];
}

/** Zeile „Noch kein Konto? Hier anlegen“ mit Hinweis bei einem Empfehlungs-Link. */
export function KontoLink({ wahl }: { wahl: AnbieterWahl }) {
  const link = kontoLink(wahl);
  if (link === undefined) return null;
  return (
    <span className={styles.konto}>
      <a href={link.href} target="_blank" rel="noopener noreferrer" className={styles.link}>
        {t("anbieterwahl.konto")}
        <Icon name="extern" />
        <span className={styles.unsichtbar}>{t("anbieterwahl.konto.neues_fenster")}</span>
      </a>
      {link.empfehlung && <span className={styles.leise}> {t("anbieterwahl.empfehlung")}</span>}
    </span>
  );
}

/** Einzeiliger Hinweis mit Link „Bedingungen des Anbieters“ (nur auf Klick, neuer Tab). */
export function BedingungenLink({ wahl }: { wahl: AnbieterWahl }) {
  const href = bedingungenLink(wahl);
  if (href === undefined) return null;
  return (
    <span className={styles.konto}>
      <a href={href} target="_blank" rel="noopener noreferrer" className={styles.link}>
        {t("anbieterwahl.bedingungen")}
        <Icon name="extern" />
        <span className={styles.unsichtbar}>{t("anbieterwahl.konto.neues_fenster")}</span>
      </a>
    </span>
  );
}

/** Aussagen des Anbieters mit Stand (nur, was heute an der Quelle nachgelesen wurde). */
export function AnbieterAngaben({ wahl }: { wahl: AnbieterWahl }) {
  const stand = { stand: ANGABEN_STAND };
  if (wahl === "eurouter") {
    return <p className={styles.angabe}>{t("anbieterwahl.eurouter.zielgruppe", stand)}</p>;
  }
  if (wahl === "mistral") {
    return (
      <>
        <p className={styles.angabe}>{t("anbieterwahl.mistral.aussage", stand)}</p>
        <p className={styles.angabe}>{t("anbieterwahl.mistral.training", stand)}</p>
      </>
    );
  }
  return null;
}

export function AnbieterAuswahl({ wert, onWahl, fehler, wege }: AnbieterAuswahlProps) {
  const gruppe = useId();
  const liste = ANBIETER_REIHENFOLGE.filter((w) => wege === undefined || wege.includes(w));
  return (
    <fieldset
      className={styles.auswahl}
      aria-describedby={fehler ? `${gruppe}-fehler` : undefined}
      aria-invalid={fehler ? true : undefined}
    >
      <legend className={styles.legende}>{t("anbieterwahl.legende")}</legend>
      {liste.map((wahl) => (
        <div key={wahl} className={styles.eintrag} data-gewaehlt={wert === wahl || undefined}>
          <label className={styles.kopf}>
            <input
              type="radio"
              name={`${gruppe}-anbieter`}
              value={wahl}
              checked={wert === wahl}
              onChange={() => onWahl(wahl)}
            />
            <span className={styles.titel}>
              <strong>{t(`anbieterwahl.${wahl}.titel`)}</strong>
              <span className={styles.leise}>{t(`anbieterwahl.${wahl}.text`)}</span>
            </span>
          </label>
          <div className={styles.mehr}>
            <AnbieterAngaben wahl={wahl} />
            <BedingungenLink wahl={wahl} />
            <KontoLink wahl={wahl} />
          </div>
        </div>
      ))}
      {fehler && (
        <p id={`${gruppe}-fehler`} className={styles.fehler} role="alert">
          {fehler}
        </p>
      )}
    </fieldset>
  );
}
