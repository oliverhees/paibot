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
import { useState } from "react";
import { AvatarStapel, BotAvatar } from "../faden/BotAvatar";
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

/**
 * Kopf mit Logo und „+“, Not-Aus, Haupt-Assistent, aufklappbare Teams (Leitung zuerst), Bots ohne
 * Team in einem eigenen Abschnitt, Fußzeile. Die Fäden-Liste gehört nicht hierher.
 */
export function TeamsSeitenleiste(p: TeamsSeitenleisteProps) {
  const [zu, setZu] = useState<ReadonlySet<string>>(new Set());
  const haupt = p.bots.find((b) => b.haupt);
  const imTeam = (b: TeamsBot) => !b.haupt && p.teams.some((tm) => tm.id === b.teamId);
  const ohneTeam = p.bots.filter((b) => !b.haupt && !imTeam(b));

  const stand = (b: TeamsBot) =>
    p.notAus
      ? t("teams.bot.angehalten")
      : b.pausiert
        ? t("teams.bot.pausiert")
        : t("teams.bot.ruhig");

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
            ohneEck
            still
          />
          <span className={styles.botName}>{b.name}</span>
          {istLeitung && <span className={styles.leitungMarke}>{t("teams.bot.leitung")}</span>}
          {b.haupt && <small className={styles.botRolle}>{t("faden.seite.pai_rolle")}</small>}
          <span className={styles.botStand} data-art={b.pausiert ? "warn" : undefined}>
            {stand(b)}
          </span>
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
      <div className={styles.kopfLeiste}>
        {haupt && (
          <BotAvatar
            farbe={haupt.farbe}
            {...(haupt.form ? { form: haupt.form } : {})}
            groesse={26}
            still
          />
        )}
        <span className={styles.wort}>{t("teams.leiste.kopf")}</span>
        <button type="button" className={styles.plus} aria-label={t("teams.leiste.neuer_bot")}>
          <Sym name="plus" groesse={18} />
        </button>
      </div>
      <div className={styles.notaus} data-aktiv={p.notAus} data-baustein="notaus">
        <span className={styles.punkt} aria-hidden="true" />
        <span className={styles.notausText}>
          {p.notAus ? t("teams.notaus.angehalten") : t("teams.notaus.laeuft")}
          <small>{t("teams.notaus.titel")}</small>
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
        className={styles.uebersicht}
        aria-current={p.aktiv?.art === "uebersicht" ? "true" : undefined}
        onClick={p.onUebersicht}
      >
        <Sym name="liste" groesse={16} />
        <span className={styles.botName}>{t("teams.leiste.uebersicht")}</span>
      </button>
      {haupt && (
        <section className={styles.gruppe} aria-label={t("faden.seite.haupt")}>
          <h2 className={styles.gruppeKopf}>{t("faden.seite.haupt")}</h2>
          <ul className={styles.liste}>{zeile(haupt)}</ul>
        </section>
      )}
      <section className={styles.gruppe} aria-label={t("faden.seite.teams")}>
        <h2 className={styles.gruppeKopf}>{t("faden.seite.teams")}</h2>
        {p.teams.map((tm) => {
          const mitglieder = p.bots
            .filter((b) => !b.haupt && b.teamId === tm.id)
            .sort((a, b) => Number(b.id === tm.leitungId) - Number(a.id === tm.leitungId));
          const offen = !zu.has(tm.id);
          return (
            <section key={tm.id} className={styles.team} data-baustein="team" aria-label={tm.name}>
              <div className={styles.teamKopf}>
                <button
                  type="button"
                  className={styles.teamAuf}
                  aria-expanded={offen}
                  aria-label={t("teams.leiste.team_zeigen", { name: tm.name })}
                  onClick={() => {
                    const neu = new Set(zu);
                    if (offen) neu.add(tm.id);
                    else neu.delete(tm.id);
                    setZu(neu);
                  }}
                >
                  <Sym name={offen ? "unten" : "rechts"} groesse={14} />
                </button>
                <button
                  type="button"
                  className={styles.teamKnopf}
                  aria-current={
                    p.aktiv?.art === "team" && p.aktiv.id === tm.id ? "true" : undefined
                  }
                  aria-label={t("teams.leiste.team_oeffnen", { name: tm.name })}
                  onClick={() => p.onTeam(tm.id)}
                >
                  {tm.name}
                </button>
                <span className={styles.stapel}>
                  {offen ? (
                    <AvatarStapel bots={mitglieder.slice(0, 7)} groesse={16} ueberlappung={6} />
                  ) : (
                    <>
                      <AvatarStapel bots={mitglieder.slice(0, 3)} groesse={16} ueberlappung={6} />
                      <span className={styles.botStand}>
                        {t("faden.seite.bots", { anzahl: mitglieder.length })}
                      </span>
                    </>
                  )}
                </span>
              </div>
              {offen && <ul className={styles.glieder}>{mitglieder.map((b) => zeile(b, tm))}</ul>}
            </section>
          );
        })}
      </section>
      {ohneTeam.length > 0 && (
        <section className={styles.gruppe} aria-label={t("teams.leiste.ohne_team")}>
          <h2 className={styles.gruppeKopf}>{t("teams.leiste.ohne_team")}</h2>
          <ul className={styles.liste}>{ohneTeam.map((b) => zeile(b))}</ul>
        </section>
      )}
      <div className={styles.fuss}>
        <span>
          <Sym name="beleg" groesse={14} />
          {t("faden.seite.belege")}
        </span>
        <span>
          <Sym name="regel" groesse={14} />
          {t("faden.seite.regeln")}
        </span>
        <span>
          <Sym name="schild" groesse={14} />
          {t("faden.seite.grenzen")}
        </span>
      </div>
    </nav>
  );
}
