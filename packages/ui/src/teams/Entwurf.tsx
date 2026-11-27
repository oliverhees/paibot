/**
 * PaiBot – Vorschau eines Team-Entwurfs: Teile mit Häkchen, voller Wortlaut, Kosten-Hinweis, Anlegen und Rückgängig.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-27
 */

"use client";

import { t } from "@paibot/shared/texte";
import { useState } from "react";
import { BotAvatar } from "../faden/BotAvatar";
import { Sym } from "../faden/symbole";
import styles from "./Teams.module.css";
import type { Vorlage } from "./typen";

export type EntwurfStatus = "offen" | "angelegt" | "zurueck" | "verworfen";
export const ENTWURF_VERFALL_TAGE = 7;

export interface EntwurfVorschauProps {
  vorlage: Vorlage;
  status: EntwurfStatus;
  notAus: boolean;
  /** Die Namen der gewählten Bots; das Team gehört immer dazu. */
  onAnlegen: (botNamen: readonly string[]) => void;
  onRueckgaengig: () => void;
  onVerwerfen: () => void;
  onWiederOeffnen: () => void;
}

const SPAETER = [
  {
    id: "automation",
    name: "teams.entwurf.spaeter_automation",
    mit: "teams.entwurf.spaeter_automation_mit",
  },
  {
    id: "merkzettel",
    name: "teams.entwurf.spaeter_merkzettel",
    mit: "teams.entwurf.spaeter_merkzettel_mit",
  },
  { id: "apps", name: "teams.entwurf.spaeter_apps", mit: "teams.entwurf.spaeter_apps_mit" },
  { id: "regeln", name: "teams.entwurf.spaeter_regeln", mit: "teams.entwurf.spaeter_regeln_mit" },
] as const;

/**
 * Der Entwurf, den Pai schreibt. Angelegt wird erst mit „Team anlegen“; danach bleibt „Rückgängig“.
 * Not-Aus sperrt das Anlegen; Lesen, Ändern, Verwerfen und Rückgängig gehen weiter.
 */
export function EntwurfVorschau(p: EntwurfVorschauProps) {
  const v = p.vorlage;
  const leitung = v.team.leitung.name;
  const [gewaehlt, setGewaehlt] = useState<ReadonlySet<string>>(new Set(v.bots.map((b) => b.name)));
  const zeigeZusammenarbeit =
    v.team.zusammenarbeit === "leitung_fuehrt"
      ? t("teams.verwaltung.fuehrt")
      : t("teams.verwaltung.aus");
  const gesperrt = p.notAus;

  return (
    <article
      className={styles.seite}
      aria-label={t("teams.entwurf.region", { name: v.team.name })}
      data-baustein="entwurf"
      data-status={p.status}
    >
      <header>
        <h1 className={styles.titel}>{t("teams.entwurf.titel", { name: v.team.name })}</h1>
        <p className={styles.leise}>{t("teams.entwurf.kopf")}</p>
        <p className={styles.leitungZeile}>
          <b>{t("teams.entwurf.leitung", { name: leitung })}</b>
        </p>
      </header>

      <section aria-label={t("teams.entwurf.teile")} className={styles.teile}>
        <h2 className={styles.beschriftung}>{t("teams.entwurf.teile")}</h2>

        <div className={styles.teil}>
          <label className={styles.haken}>
            <input type="checkbox" checked disabled readOnly />
            <span>
              <b>{t("teams.entwurf.teil_team")}</b>
              <small>
                {t("teams.entwurf.teil_team_text", {
                  name: v.team.name,
                  zusammenarbeit: zeigeZusammenarbeit,
                })}
              </small>
            </span>
          </label>
        </div>

        <h3 className={styles.unterTitel}>{t("teams.entwurf.bots")}</h3>
        {v.bots.map((b) => {
          const istLeitung = b.name === leitung;
          return (
            <div key={b.name} className={styles.teil} data-baustein="entwurf-bot">
              <label className={styles.haken}>
                <input
                  type="checkbox"
                  checked={gewaehlt.has(b.name)}
                  disabled={istLeitung || p.status !== "offen"}
                  onChange={(e) => {
                    const neu = new Set(gewaehlt);
                    if (e.target.checked) neu.add(b.name);
                    else neu.delete(b.name);
                    setGewaehlt(neu);
                  }}
                />
                <BotAvatar farbe={b.farbe} form={b.form} groesse={26} still />
                <span>
                  <b>{b.name}</b>
                  {istLeitung && (
                    <span className={styles.leitungMarke}>{t("teams.bot.leitung")}</span>
                  )}
                  <span className={`${styles.marke} ${styles.leiseMarke}`}>
                    {t("teams.entwurf.aus_vorlage")}
                  </span>
                  <small>{b.aufgabe}</small>
                </span>
              </label>
              <details className={styles.wortlaut}>
                <summary>{t("teams.entwurf.wortlaut")}</summary>
                <pre className={styles.anweisung}>{b.anweisung}</pre>
              </details>
            </div>
          );
        })}

        {SPAETER.map((s) => (
          <div
            key={s.id}
            className={`${styles.teil} ${styles.grau}`}
            data-baustein="entwurf-spaeter"
          >
            <label className={styles.haken}>
              <input type="checkbox" disabled checked={false} readOnly />
              <span>
                <b>{t(s.name)}</b>
                <small>{t("teams.entwurf.kommt_mit", { was: t(s.mit) })}</small>
              </span>
            </label>
          </div>
        ))}
      </section>

      <section
        className={styles.kosten}
        aria-label={t("teams.entwurf.kosten")}
        data-baustein="kosten"
      >
        <h2 className={styles.beschriftung}>{t("teams.entwurf.kosten")}</h2>
        <ul>
          <li>{t("teams.entwurf.kosten_1")}</li>
          <li>{t("teams.entwurf.kosten_2")}</li>
          <li>{t("teams.entwurf.kosten_3")}</li>
        </ul>
      </section>

      {p.status === "offen" && (
        <footer className={styles.fuss}>
          <p className={styles.leise}>
            {t("teams.entwurf.zusammenfassung", { bots: gewaehlt.size })}{" "}
            {t("teams.entwurf.verfall", { tage: ENTWURF_VERFALL_TAGE })}
          </p>
          {gesperrt && (
            <p
              className={styles.hinweis}
              data-art="warn"
              role="status"
              data-baustein="entwurf-gesperrt"
            >
              {t("teams.entwurf.gesperrt")}
            </p>
          )}
          <div className={styles.aktionen}>
            <button
              type="button"
              className={`${styles.knopf} ${styles.haupt}`}
              disabled={gesperrt}
              onClick={() => p.onAnlegen([...gewaehlt])}
            >
              <Sym name="haken" groesse={15} />
              {t("teams.entwurf.anlegen")}
            </button>
            <button type="button" className={styles.knopf} onClick={p.onVerwerfen}>
              {t("teams.entwurf.verwerfen")}
            </button>
          </div>
        </footer>
      )}
      {p.status === "angelegt" && (
        <footer className={styles.fuss}>
          <p
            className={styles.hinweis}
            data-art="ok"
            role="status"
            data-baustein="entwurf-angelegt"
          >
            {t("teams.entwurf.angelegt", { name: v.team.name })}
          </p>
          <div className={styles.aktionen}>
            <button type="button" className={styles.knopf} onClick={p.onRueckgaengig}>
              <Sym name="zurueck" groesse={15} />
              {t("teams.entwurf.rueckgaengig")}
            </button>
            <span className={styles.leise}>{t("teams.entwurf.rueckgaengig_hinweis")}</span>
          </div>
        </footer>
      )}
      {(p.status === "zurueck" || p.status === "verworfen") && (
        <footer className={styles.fuss}>
          <p className={styles.hinweis} data-art="info" role="status" data-baustein="entwurf-zu">
            {p.status === "zurueck"
              ? t("teams.entwurf.zurueckgenommen", { name: v.team.name })
              : t("teams.entwurf.verworfen")}
          </p>
          <div className={styles.aktionen}>
            <button type="button" className={styles.knopf} onClick={p.onWiederOeffnen}>
              {t("teams.entwurf.wieder_oeffnen")}
            </button>
          </div>
        </footer>
      )}
    </article>
  );
}
