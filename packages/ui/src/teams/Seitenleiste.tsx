/**
 * PaiBot – Seitenleiste für Bots, nach Teams gruppiert, mit Menü je Bot und Not-Aus.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-27
 */

"use client";

import { t } from "@paibot/shared/texte";
import { BotAvatar } from "../faden/BotAvatar";
import { Sym } from "../faden/symbole";
import { BotMenue } from "./BotMenue";
import styles from "./Teams.module.css";
import type { TeamsBot, TeamsTeam } from "./typen";

export interface TeamsSeitenleisteProps {
  bots: readonly TeamsBot[];
  teams: readonly TeamsTeam[];
  aktiv?: { art: "bot" | "team" | "uebersicht"; id?: string };
  notAus: boolean;
  onBot: (botId: string) => void;
  onTeam: (teamId: string) => void;
  onUebersicht: () => void;
  onNotAus: () => void;
  onPausieren: (botId: string) => void;
  onTeamWechseln: (botId: string, teamId: string | undefined) => void;
  onLoeschenFragen: (botId: string) => void;
}

/** Bots nach Teams gruppiert (Leitung zuerst), darunter „Ohne Team“; oben der Not-Aus. */
export function TeamsSeitenleiste(p: TeamsSeitenleisteProps) {
  const ohneTeam = p.bots.filter((b) => !b.teamId || !p.teams.some((tm) => tm.id === b.teamId));
  const zeile = (b: TeamsBot, team?: TeamsTeam) => {
    const istLeitung = team?.leitungId === b.id;
    return (
      <li key={b.id} className={styles.botZeile}>
        <button
          type="button"
          className={styles.bot}
          aria-current={p.aktiv?.art === "bot" && p.aktiv.id === b.id ? "true" : undefined}
          aria-label={t("teams.leiste.bot_oeffnen", { name: b.name })}
          onClick={() => p.onBot(b.id)}
        >
          <BotAvatar
            farbe={b.farbe}
            {...(b.form ? { form: b.form } : {})}
            zustand={b.pausiert || p.notAus ? "angehalten" : "ruhig"}
            groesse={24}
            still
          />
          <span className={styles.botName}>{b.name}</span>
          {istLeitung && <span className={styles.marke}>{t("teams.bot.leitung")}</span>}
          {b.pausiert && (
            <span className={`${styles.marke} ${styles.warn}`}>{t("teams.bot.pausiert")}</span>
          )}
        </button>
        <BotMenue
          bot={b}
          teams={p.teams}
          onPausieren={p.onPausieren}
          onTeam={p.onTeamWechseln}
          onLoeschenFragen={p.onLoeschenFragen}
        />
      </li>
    );
  };

  return (
    <nav
      className={styles.leiste}
      aria-label={t("teams.leiste.region")}
      data-baustein="seitenleiste"
    >
      <div className={styles.notaus} data-aktiv={p.notAus} data-baustein="notaus">
        <span className={styles.punkt} aria-hidden="true" />
        <span className={styles.notausText}>
          <b>{t("teams.notaus.titel")}</b>
          <small>{p.notAus ? t("teams.notaus.aktiv") : t("teams.notaus.ruhig")}</small>
        </span>
        <button
          type="button"
          className={styles.notausKnopf}
          aria-pressed={p.notAus}
          onClick={p.onNotAus}
        >
          {p.notAus ? t("teams.notaus.fortsetzen") : t("teams.notaus.anhalten")}
        </button>
      </div>
      <button
        type="button"
        className={styles.bot}
        aria-current={p.aktiv?.art === "uebersicht" ? "true" : undefined}
        onClick={p.onUebersicht}
      >
        <Sym name="liste" groesse={16} />
        <span className={styles.botName}>{t("teams.leiste.uebersicht")}</span>
      </button>
      {ohneTeam.length > 0 && (
        <section className={styles.gruppe} aria-label={t("teams.leiste.ohne_team")}>
          <h2 className={styles.gruppeKopf}>{t("teams.leiste.ohne_team")}</h2>
          <ul className={styles.liste}>{ohneTeam.map((b) => zeile(b))}</ul>
        </section>
      )}
      {p.teams.map((tm) => {
        const mitglieder = p.bots
          .filter((b) => b.teamId === tm.id)
          .sort((a, b) => Number(b.id === tm.leitungId) - Number(a.id === tm.leitungId));
        return (
          <section key={tm.id} className={styles.gruppe} aria-label={tm.name}>
            <h2 className={styles.gruppeKopf}>
              <button
                type="button"
                className={styles.teamKnopf}
                aria-current={p.aktiv?.art === "team" && p.aktiv.id === tm.id ? "true" : undefined}
                aria-label={t("teams.leiste.team_oeffnen", { name: tm.name })}
                onClick={() => p.onTeam(tm.id)}
              >
                {tm.name}
              </button>
            </h2>
            <ul className={styles.liste}>{mitglieder.map((b) => zeile(b, tm))}</ul>
          </section>
        );
      })}
    </nav>
  );
}
