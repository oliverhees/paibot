/**
 * PaiBot – Steckbrief eines Bots: Rolle, Team, Modell, „darf / fragt vorher / darf nie“, Hinweis bei Pause.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-27
 */

import { t } from "@paibot/shared/texte";
import { BotAvatar } from "../faden/BotAvatar";
import styles from "./Teams.module.css";
import type { TeamsBot, TeamsTeam } from "./typen";

function Liste({ titel, punkte, art }: { titel: string; punkte: readonly string[]; art: string }) {
  return (
    <section className={styles.rechte} data-art={art}>
      <h3 className={styles.rechteTitel}>{titel}</h3>
      {punkte.length === 0 ? (
        <p className={styles.leise}>{t("teams.steckbrief.leer")}</p>
      ) : (
        <ul>
          {punkte.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Die Seite eines Bots. Zeigt nur an; ändern geht über das Menü in der Seitenleiste. */
export function Steckbrief({
  bot,
  team,
  notAus,
}: {
  bot: TeamsBot;
  team?: TeamsTeam;
  notAus: boolean;
}) {
  const leitung = team?.leitungId === bot.id;
  return (
    <article
      className={styles.seite}
      aria-label={t("teams.steckbrief.region", { name: bot.name })}
      data-baustein="steckbrief"
    >
      <header className={styles.seitenKopf}>
        <BotAvatar
          farbe={bot.farbe}
          {...(bot.form ? { form: bot.form } : {})}
          zustand={bot.pausiert || notAus ? "angehalten" : "ruhig"}
          groesse={64}
          titel={bot.name}
        />
        <div>
          <h1 className={styles.titel}>{bot.name}</h1>
          <p className={styles.leise}>{bot.rolle}</p>
        </div>
      </header>
      {(bot.pausiert || notAus) && (
        <p className={styles.hinweis} role="status" data-art="warn" data-baustein="pausiert">
          {bot.pausiert
            ? t("teams.steckbrief.pausiert", { name: bot.name })
            : t("teams.steckbrief.angehalten", { name: bot.name })}
        </p>
      )}
      <dl className={styles.felder}>
        <div>
          <dt>{t("teams.steckbrief.rolle")}</dt>
          <dd>{leitung ? t("teams.bot.leitung") : bot.rolle}</dd>
        </div>
        <div>
          <dt>{t("teams.steckbrief.team")}</dt>
          <dd>{team ? team.name : t("teams.bot.kein_team")}</dd>
        </div>
        <div>
          <dt>{t("teams.steckbrief.modell")}</dt>
          <dd>{bot.modell}</dd>
        </div>
      </dl>
      <div className={styles.rechteReihe}>
        <Liste titel={t("teams.steckbrief.darf")} punkte={bot.darf} art="darf" />
        <Liste titel={t("teams.steckbrief.fragt")} punkte={bot.fragt} art="fragt" />
        <Liste titel={t("teams.steckbrief.nie")} punkte={bot.nie} art="nie" />
      </div>
    </article>
  );
}
