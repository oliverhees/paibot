/**
 * PaiBot – Reiter „Darstellung“ der Einstellungen: Fassung des Startbereichs wählen, mit kleiner
 * Vorschau je Fassung. Die Wahl gilt für diesen Browser.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import { t } from "@paibot/shared/texte";
import { useId, useState } from "react";
import { fassungMerken, START_FASSUNGEN, type StartFassung } from "../../../lib/chat/startbereich";
import styles from "./darstellung.module.css";

const TEXTE = {
  begruessung: {
    titel: () => t("darstellung.start.begruessung"),
    text: () => t("darstellung.start.begruessung.text"),
  },
  startbrett: {
    titel: () => t("darstellung.start.startbrett"),
    text: () => t("darstellung.start.startbrett.text"),
  },
  stille: {
    titel: () => t("darstellung.start.stille"),
    text: () => t("darstellung.start.stille.text"),
  },
} as const;

/** Kleine Skizze der Fassung (nur Formen, keine Texte). */
function Skizze({ fassung }: { fassung: StartFassung }) {
  return (
    <svg
      className={styles.skizze}
      viewBox="0 0 120 76"
      aria-hidden="true"
      focusable="false"
      data-skizze={fassung}
    >
      <rect className={styles.feld} x="14" y="62" width="92" height="9" rx="4.5" />
      {fassung === "begruessung" && (
        <>
          <circle className={styles.avatar} cx="60" cy="14" r="8" />
          <rect className={styles.linie} x="40" y="27" width="40" height="4" rx="2" />
          {[14, 46, 78].map((x) => (
            <g key={x}>
              <rect className={styles.chip} x={x} y="38" width="28" height="7" rx="3.5" />
              <rect className={styles.chip} x={x} y="49" width="28" height="7" rx="3.5" />
            </g>
          ))}
        </>
      )}
      {fassung === "startbrett" && (
        <>
          <rect className={styles.linie} x="14" y="6" width="44" height="4" rx="2" />
          {[14, 46, 78].map((x) => (
            <rect key={x} className={styles.karte} x={x} y="15" width="28" height="19" rx="3" />
          ))}
          <rect className={styles.karte} x="14" y="38" width="44" height="18" rx="3" />
          <rect className={styles.karte} x="62" y="38" width="44" height="18" rx="3" />
        </>
      )}
      {fassung === "stille" && (
        <>
          <rect className={styles.linie} x="30" y="22" width="60" height="5" rx="2.5" />
          <rect className={styles.linie} x="44" y="32" width="32" height="3" rx="1.5" />
          <circle className={styles.avatar} cx="22" cy="54" r="6" />
        </>
      )}
    </svg>
  );
}

export function Darstellung({ anfang }: { anfang: StartFassung }) {
  const [fassung, setFassung] = useState<StartFassung>(anfang);
  const [gemerkt, setGemerkt] = useState(false);
  const hilfeId = useId();

  function waehlen(neu: StartFassung) {
    setFassung(neu);
    fassungMerken(neu);
    setGemerkt(true);
  }

  return (
    <div className={styles.stapel}>
      <fieldset className={styles.gruppe} aria-describedby={hilfeId}>
        <legend className={styles.titel}>{t("darstellung.start.titel")}</legend>
        <p id={hilfeId} className={styles.vorspann}>
          {t("darstellung.start.text")}
        </p>
        <div className={styles.raster}>
          {START_FASSUNGEN.map((f) => (
            <label key={f} className={styles.wahl} data-gewaehlt={fassung === f || undefined}>
              <input
                type="radio"
                name="startbereich"
                value={f}
                checked={fassung === f}
                onChange={() => waehlen(f)}
              />
              <span className={styles.vorschau}>
                <span className={styles.nurLesbar}>{t("darstellung.start.vorschau")}: </span>
                <Skizze fassung={f} />
              </span>
              <span className={styles.name}>{TEXTE[f].titel()}</span>
              <span className={styles.beschreibung}>{TEXTE[f].text()}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <p className={styles.meldung} role="status" aria-live="polite">
        {gemerkt ? t("darstellung.start.gemerkt") : ""}
      </p>
    </div>
  );
}
