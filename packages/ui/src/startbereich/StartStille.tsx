/**
 * PaiBot – Fassung „stille“ des Startbereichs: ein großer Satz und das Modell.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import { t } from "@paibot/shared/texte";
import { useId } from "react";
import styles from "./Startbereich.module.css";
import { StartStilleSitz, type StartStilleSitzProps } from "./StartStilleSitz";
import { HerkunftMarke, NotAusAnsicht } from "./teile";
import type { StartDaten } from "./typen";

export interface StartStilleProps extends StartDaten {
  /**
   * Eingabefeld und Leer-Zustand. Mit Angabe sitzt der Avatar mit den Anfängen gleich unter dem
   * Satz (so zeigt es die Vorschau); ohne sie setzt die Seite `StartStilleSitz` selbst über das
   * Feld.
   */
  sitz?: Pick<StartStilleSitzProps, "eingabe" | "leer">;
}

/** In der Mitte nur ein großer Satz und das Modell; die Anfänge kommen erst im Eingabefeld. */
export function StartStille({ sitz, ...daten }: StartStilleProps) {
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
  return (
    <>
      <section className={styles.still} aria-labelledby={kopf} data-fassung="stille">
        <h1 id={kopf} className={styles.stillTitel}>
          {t("startbereich.c.titel")}
        </h1>
        {daten.modell !== undefined && (
          <p className={styles.stillModell}>
            {name === undefined
              ? t("startbereich.c.modell_ohne_name")
              : t("startbereich.c.modell", { name })}{" "}
            <b>{daten.modell}</b>
            {daten.herkunft !== undefined && <HerkunftMarke herkunft={daten.herkunft} />}
          </p>
        )}
      </section>
      {sitz !== undefined && (
        <StartStilleSitz
          avatar={daten.avatar}
          notAus={daten.notAus}
          onAnfang={daten.onAnfang}
          eingabe={sitz.eingabe}
          leer={sitz.leer}
        />
      )}
    </>
  );
}
