/**
 * PaiBot – Team-Verwaltung: Name, Leitung, Zusammenarbeit, Abnahme-Standard, Mitglieder.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-27
 */

"use client";

import { t } from "@paibot/shared/texte";
import { useId, useState } from "react";
import { BotAvatar } from "../faden/BotAvatar";
import styles from "./Teams.module.css";
import type { AbnahmeStandard, TeamsBot, TeamsTeam, Zusammenarbeit } from "./typen";

/**
 * Ein Team ansehen und ändern (nur lokal, die Vorschau speichert nichts). Das Team hat kein eigenes
 * Tagesbudget; der Hinweis sagt, dass die Tagesgrenze für alle Bots zusammen gilt.
 */
export function TeamVerwaltung({
  team,
  mitglieder,
}: {
  team: TeamsTeam;
  mitglieder: readonly TeamsBot[];
}) {
  const [name, setName] = useState(team.name);
  const [leitungId, setLeitungId] = useState(team.leitungId);
  const [zus, setZus] = useState<Zusammenarbeit>(team.zusammenarbeit);
  const [abnahme, setAbnahme] = useState<AbnahmeStandard>(team.abnahme);
  const [gespeichert, setGespeichert] = useState(false);
  const feld = useId();
  const aendern =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setGespeichert(false);
    };
  const setZ = aendern(setZus);
  const setA = aendern(setAbnahme);

  return (
    <form
      className={styles.seite}
      aria-label={t("teams.verwaltung.region", { name: team.name })}
      data-baustein="team-verwaltung"
      onSubmit={(e) => {
        e.preventDefault();
        setGespeichert(true);
      }}
    >
      <h1 className={styles.titel}>{team.name}</h1>
      <div className={styles.feldReihe}>
        <label className={styles.beschriftung} htmlFor={`${feld}-name`}>
          {t("teams.verwaltung.name")}
        </label>
        <input
          id={`${feld}-name`}
          className={styles.eingabe}
          value={name}
          maxLength={60}
          onChange={(e) => {
            setName(e.target.value);
            setGespeichert(false);
          }}
        />
      </div>
      <div className={styles.feldReihe}>
        <label className={styles.beschriftung} htmlFor={`${feld}-leitung`}>
          {t("teams.verwaltung.leitung")}
        </label>
        <select
          id={`${feld}-leitung`}
          className={styles.eingabe}
          value={leitungId}
          onChange={(e) => {
            setLeitungId(e.target.value);
            setGespeichert(false);
          }}
        >
          {mitglieder.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </div>
      <fieldset className={styles.gruppeFeld}>
        <legend className={styles.beschriftung}>{t("teams.verwaltung.zusammenarbeit")}</legend>
        <label className={styles.wahl}>
          <input
            type="radio"
            name={`${feld}-zus`}
            checked={zus === "aus"}
            onChange={() => setZ("aus")}
          />
          <span>
            <b>{t("teams.verwaltung.aus")}</b>
            <small>{t("teams.verwaltung.aus_hilfe")}</small>
          </span>
        </label>
        <label className={styles.wahl}>
          <input
            type="radio"
            name={`${feld}-zus`}
            checked={zus === "leitung_fuehrt"}
            onChange={() => setZ("leitung_fuehrt")}
          />
          <span>
            <b>{t("teams.verwaltung.fuehrt")}</b>
            <small>{t("teams.verwaltung.fuehrt_hilfe")}</small>
          </span>
        </label>
      </fieldset>
      <fieldset className={styles.gruppeFeld}>
        <legend className={styles.beschriftung}>{t("teams.verwaltung.abnahme")}</legend>
        <label className={styles.wahl}>
          <input
            type="radio"
            name={`${feld}-abn`}
            checked={abnahme === "leitung"}
            onChange={() => setA("leitung")}
          />
          <span>
            <b>{t("teams.verwaltung.abnahme_leitung")}</b>
          </span>
        </label>
        <label className={styles.wahl}>
          <input
            type="radio"
            name={`${feld}-abn`}
            checked={abnahme === "ich"}
            onChange={() => setA("ich")}
          />
          <span>
            <b>{t("teams.verwaltung.abnahme_ich")}</b>
          </span>
        </label>
      </fieldset>
      <section>
        <h2 className={styles.beschriftung}>{t("teams.verwaltung.mitglieder")}</h2>
        <ul className={styles.mitglieder}>
          {mitglieder.map((b) => (
            <li key={b.id}>
              <BotAvatar
                farbe={b.farbe}
                {...(b.form ? { form: b.form } : {})}
                zustand={b.pausiert ? "angehalten" : "ruhig"}
                groesse={28}
                still
              />
              <span className={styles.botName}>{b.name}</span>
              {b.id === leitungId && <span className={styles.marke}>{t("teams.bot.leitung")}</span>}
              {b.pausiert && (
                <span className={`${styles.marke} ${styles.warn}`}>{t("teams.bot.pausiert")}</span>
              )}
            </li>
          ))}
        </ul>
      </section>
      <p className={styles.hinweis} data-art="info" data-baustein="budget-hinweis">
        {t("teams.verwaltung.budget")}
      </p>
      <div className={styles.aktionen}>
        <button type="submit" className={`${styles.knopf} ${styles.haupt}`}>
          {t("teams.verwaltung.speichern")}
        </button>
        {gespeichert && (
          <span className={styles.leise} role="status">
            {t("teams.verwaltung.vorschau_gespeichert")}
          </span>
        )}
      </div>
    </form>
  );
}
