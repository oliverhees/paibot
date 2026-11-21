/**
 * PaiBot – Seite „Datenschleuse“ im Browser: was sie tut und was nicht, ob sie eingerichtet ist,
 * wie die letzte geschützte Anfrage lief, der Standard für neue Unterhaltungen und ein Beispiel.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import type { SchleuseMode } from "@paibot/shared/objekte";
import { t, tList } from "@paibot/shared/texte";
import { Icon, Karte, SeitenSpalte, StatusChip, Switch } from "@paibot/ui";
import { useState } from "react";
import { apiFetch } from "../../../lib/api/client";
import { letzterLaufText, workerAnzeige } from "../../../lib/schleuse/ansicht";
import type { LetzterLauf, WorkerMeldung } from "../../../lib/schleuse/schleuse";
import styles from "./schleuse.module.css";

export interface SchleuseAnsichtProps {
  eingerichtet: boolean;
  standard: SchleuseMode;
  letzterLauf?: LetzterLauf;
  /** Zeit des letzten Laufs, schon in Worten (Zeitzone der Installation). */
  letzterLaufZeit?: string;
  /** Letzte Meldung des Workers; fehlt, solange er noch nichts gemeldet hat. */
  worker?: WorkerMeldung;
  /** Zeit dieser Meldung, schon in Worten. */
  workerZeit?: string;
  dokuUrl: string;
}

export function SchleuseAnsicht(props: SchleuseAnsichtProps) {
  const { eingerichtet, letzterLauf, letzterLaufZeit, worker, workerZeit, dokuUrl } = props;
  const [standard, setStandard] = useState<SchleuseMode>(props.standard);
  const [laeuft, setLaeuft] = useState(false);
  const [meldung, setMeldung] = useState<{ art: "ok" | "fehler"; text: string; ausweg?: string }>();
  const lauf =
    letzterLauf && letzterLaufZeit ? letzterLaufText(letzterLauf, letzterLaufZeit) : undefined;
  // Meldet der Worker „aus“, gilt die Anleitung zum Zuschalten; sonst zeigt die Karte seinen Befund.
  const befund =
    worker && workerZeit && eingerichtet && (worker.zustand !== "aus" || worker.veraltet)
      ? workerAnzeige(worker, workerZeit)
      : undefined;

  async function umschalten(an: boolean) {
    const mode: SchleuseMode = an ? "on" : "off";
    setMeldung(undefined);
    setLaeuft(true);
    const antwort = await apiFetch<{ standard: SchleuseMode }>(
      "PUT",
      "/api/datenschleuse/standard",
      {
        mode,
      },
    );
    setLaeuft(false);
    if (!antwort.ok) {
      setMeldung({
        art: "fehler",
        text: antwort.fehler.text,
        ...(antwort.fehler.ausweg ? { ausweg: antwort.fehler.ausweg } : {}),
      });
      return;
    }
    setStandard(antwort.daten.standard);
    setMeldung({
      art: "ok",
      text:
        antwort.daten.standard === "on"
          ? t("datenschleuse.standard.gespeichert.an")
          : t("datenschleuse.standard.gespeichert.aus"),
    });
  }

  return (
    <SeitenSpalte titel={t("seite.datenschleuse")} einleitung={t("datenschleuse.text.1")}>
      <Karte
        titel={t("datenschleuse.zustand.titel")}
        rechts={
          befund ? (
            <StatusChip art={befund.art}>{befund.marke}</StatusChip>
          ) : (
            <StatusChip art={eingerichtet ? "ok" : "neutral"}>
              {eingerichtet
                ? t("datenschleuse.eingerichtet")
                : t("datenschleuse.nicht_eingerichtet")}
            </StatusChip>
          )
        }
      >
        {befund ? (
          <>
            <p className={styles.text}>
              {befund.text}
              {befund.ausweg && <span className={styles.leise}> {befund.ausweg}</span>}
            </p>
            <p className={styles.leise}>
              {/* Veraltet nennt der Satz oben die Zeit schon. */}
              {worker?.veraltet ? "" : `${befund.geprueft} `}
              {t("datenschleuse.worker.hinweis")}
            </p>
          </>
        ) : eingerichtet ? (
          <>
            <p className={styles.text}>{t("datenschleuse.eingerichtet.text")}</p>
            {!worker && <p className={styles.leise}>{t("datenschleuse.worker.keine")}</p>}
          </>
        ) : (
          <>
            <p className={styles.text}>
              <strong>{t("datenschleuse.anleitung.titel")}</strong>
            </p>
            <p className={styles.text}>{t("datenschleuse.anleitung.text")}</p>
            <ol className={styles.schritte}>
              {tList("datenschleuse.anleitung.schritte").map((schritt) => (
                <li key={schritt}>{schritt}</li>
              ))}
            </ol>
            <a className={styles.link} href={dokuUrl} target="_blank" rel="noopener noreferrer">
              {t("datenschleuse.anleitung.doku")}
              <Icon name="extern" />
            </a>
          </>
        )}
      </Karte>

      {eingerichtet && (
        <Karte
          titel={t("datenschleuse.letzter_lauf.titel")}
          rechts={lauf && <StatusChip art={lauf.art}>{letzterLaufZeit ?? ""}</StatusChip>}
        >
          {lauf ? (
            <p className={styles.text}>
              {lauf.text}
              {lauf.ausweg && <span className={styles.leise}> {lauf.ausweg}</span>}
            </p>
          ) : (
            <p className={styles.text}>{t("datenschleuse.letzter_lauf.keiner")}</p>
          )}
          <p className={styles.leise}>{t("datenschleuse.letzter_lauf.hinweis")}</p>
        </Karte>
      )}

      <Karte titel={t("datenschleuse.standard.titel")}>
        <Switch
          an={standard === "on"}
          onAendern={(an) => void umschalten(an)}
          disabled={laeuft || (!eingerichtet && standard !== "on")}
          aria-describedby="schleuse-standard-hilfe"
        >
          {t("datenschleuse.standard.schalter")}
        </Switch>
        <p id="schleuse-standard-hilfe" className={styles.leise}>
          {standard === "on" ? t("datenschleuse.standard.an") : t("datenschleuse.standard.aus")}
          {!eingerichtet && ` ${t("datenschleuse.standard.gesperrt")}`}
        </p>
        <div role="status" aria-live="polite" className={styles.live}>
          {meldung && (
            <p className={styles.meldung} data-art={meldung.art}>
              {meldung.text}
              {meldung.ausweg && <span className={styles.leise}> {meldung.ausweg}</span>}
            </p>
          )}
        </div>
      </Karte>

      <Karte
        titel={t("datenschleuse.beispiel.titel")}
        rechts={<StatusChip art="neutral">{t("datenschleuse.beispiel.etikett")}</StatusChip>}
      >
        <ol className={styles.ablauf}>
          <li className={styles.schritt}>
            <span className={styles.etikett}>{t("datenschleuse.beispiel.du")}</span>
            <p>{t("datenschleuse.beispiel.eingabe")}</p>
          </li>
          <li className={styles.schritt} data-art="modell">
            <span className={styles.etikett}>{t("datenschleuse.beispiel.modell")}</span>
            <p className={styles.mono}>{t("datenschleuse.beispiel.maskiert")}</p>
          </li>
          <li className={styles.schritt}>
            <span className={styles.etikett}>{t("datenschleuse.beispiel.zurueck")}</span>
            <p>{t("datenschleuse.beispiel.antwort")}</p>
          </li>
        </ol>
        <p className={styles.leise}>{t("datenschleuse.beispiel.hinweis")}</p>
      </Karte>

      <Karte art="hinweis">
        <p className={styles.hinweis}>
          <Icon name="info" />
          <span>
            {t("datenschleuse.text.2")} {t("datenschleuse.text.3")}
          </span>
        </p>
      </Karte>
    </SeitenSpalte>
  );
}
