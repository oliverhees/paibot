/**
 * PaiBot – Fassung „begruessung“ des Startbereichs: großer Avatar, Gruß, Stand, drei Spalten.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { t } from "@paibot/shared/texte";
import { useId } from "react";
import { anfaengeBegruessung } from "./anfaenge";
import styles from "./Startbereich.module.css";
import {
  AvatarFeld,
  GruppenSymbol,
  grussText,
  HerkunftMarke,
  NotAusAnsicht,
  PfeilSymbol,
} from "./teile";
import type { StartDaten } from "./typen";

/** Großer Avatar, Gruß nach Tageszeit, eine Zeile mit Modell und Datenschleuse, drei Spalten. */
export function StartBegruessung(daten: StartDaten) {
  const id = useId();
  const kopf = `${id}-titel`;
  if (daten.notAus === true) {
    return (
      <NotAusAnsicht
        avatar={daten.avatarNotAus ?? daten.avatar}
        botName={daten.botName}
        titelId={kopf}
      />
    );
  }
  const name = daten.botName;
  const hatModell = daten.modell !== undefined;
  const hatSchleuse = daten.schleuseAn !== undefined;
  return (
    <section className={styles.begruessung} aria-labelledby={kopf} data-fassung="begruessung">
      <div className={styles.buehne}>
        <AvatarFeld groesse="gross">{daten.avatar}</AvatarFeld>
      </div>
      <h1 id={kopf} className={styles.hallo}>
        {t("startbereich.a.titel", { gruss: grussText(daten.tageszeit) })}
      </h1>
      <p className={styles.unterzeile}>
        {name === undefined
          ? t("startbereich.a.satz_ohne_name")
          : t("startbereich.a.satz", { name })}
      </p>
      {(hatModell || hatSchleuse) && (
        <section
          className={styles.stand}
          aria-label={
            name === undefined
              ? t("startbereich.a.stand_ohne_name")
              : t("startbereich.a.stand", { name })
          }
        >
          {hatModell && (
            <span className={styles.standTeil}>
              {t("startbereich.stand.antwortet")} <b>{daten.modell}</b>
              {daten.herkunft !== undefined && <HerkunftMarke herkunft={daten.herkunft} />}
            </span>
          )}
          {hatModell && hatSchleuse && <span className={styles.trenn} aria-hidden="true" />}
          {hatSchleuse && (
            <span className={styles.standTeil}>
              {t("startbereich.stand.schleuse")}{" "}
              <b>{daten.schleuseAn ? t("startbereich.stand.an") : t("startbereich.stand.aus")}</b>
            </span>
          )}
        </section>
      )}
      <div className={styles.wege}>
        {anfaengeBegruessung().map((weg) => (
          <div className={styles.weg} key={weg.gruppe}>
            <h2 className={styles.wegTitel}>
              <GruppenSymbol name={weg.gruppe} />
              {weg.titel}
            </h2>
            <ul className={styles.wegListe}>
              {weg.anfaenge.map((anfang) => (
                <li key={anfang.id} className={styles.eintrag}>
                  <button
                    type="button"
                    className={styles.frage}
                    onClick={() => daten.onAnfang(anfang.text)}
                  >
                    <span>{anfang.label}</span>
                    <PfeilSymbol />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
