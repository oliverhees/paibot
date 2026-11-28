/**
 * PaiBot – „Bots und Teams“ in der App: Teams mit ihren Bots, Bots ohne Team, ein Team und einen
 * Bot anlegen. Jede Änderung geht über die Routen des Tors und bekommt dort einen Beleg.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

"use client";

import { LIMITS } from "@paibot/shared/konstanten";
import { t } from "@paibot/shared/texte";
import { Button, TextField } from "@paibot/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { apiFetch } from "../../../lib/api/client";
import { botAdresse, teamAdresse } from "../../../lib/navigation";
import { TEAM_PFADE } from "../../../lib/teams/pfade";
import type { TeamsSeiteDaten } from "../../../lib/teams/seite";
import styles from "./teams.module.css";

function fehlerText(fehler: { text: string; ausweg?: string }): string {
  return fehler.ausweg ? `${fehler.text} ${fehler.ausweg}` : fehler.text;
}

export function TeamsSeite({ daten }: { daten: TeamsSeiteDaten }) {
  const router = useRouter();
  const [teamName, setTeamName] = useState("");
  const [botName, setBotName] = useState("");
  const [botRolle, setBotRolle] = useState("");
  const [sendet, setSendet] = useState<"team" | "bot" | undefined>();
  const [fehler, setFehler] = useState<string | undefined>();

  async function anlegen(was: "team" | "bot", koerper: unknown, event: FormEvent) {
    event.preventDefault();
    if (sendet !== undefined) return;
    setSendet(was);
    setFehler(undefined);
    const antwort = await apiFetch<unknown>(
      "POST",
      was === "team" ? TEAM_PFADE.teams() : TEAM_PFADE.bots(),
      koerper,
    );
    setSendet(undefined);
    if (!antwort.ok) {
      setFehler(fehlerText(antwort.fehler));
      return;
    }
    if (was === "team") setTeamName("");
    else {
      setBotName("");
      setBotRolle("");
    }
    router.refresh();
  }

  return (
    <div className={styles.seite}>
      <h1 className={styles.titel}>{t("teams.seite.titel")}</h1>
      <p className={styles.vorspann}>{t("teams.seite.vorspann")}</p>
      {fehler !== undefined && (
        <p className={styles.fehler} role="alert">
          {fehler}
        </p>
      )}

      <section aria-labelledby="teams-liste">
        <h2 id="teams-liste" className={styles.abschnitt}>
          {t("teams.seite.teams")}
        </h2>
        {daten.teams.length === 0 ? (
          <p className={styles.leise}>{t("teams.seite.keine_teams")}</p>
        ) : (
          <ul className={styles.liste}>
            {daten.teams.map(({ team, mitglieder }) => {
              const leitung = mitglieder.find((b) => b.id === team.leitungId);
              return (
                <li key={team.id} className={styles.karte}>
                  <div>
                    <b>{team.name}</b>
                    <p className={styles.leise}>
                      {t("teams.seite.mitglieder", { anzahl: String(mitglieder.length) })} ·{" "}
                      {leitung
                        ? t("teams.entwurf.leitung", { name: leitung.name })
                        : t("teams.seite.ohne_leitung")}
                    </p>
                  </div>
                  <Link className={styles.link} href={teamAdresse(team.id)}>
                    {t("teams.seite.verwalten")}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
        <form className={styles.formular} onSubmit={(e) => anlegen("team", { name: teamName }, e)}>
          <TextField
            label={t("teams.seite.team_name")}
            value={teamName}
            maxLength={LIMITS.teamNameChars}
            onChange={(e) => setTeamName(e.target.value)}
          />
          <Button type="submit" art="primaer" laedt={sendet === "team"} disabled={teamName === ""}>
            {t("teams.seite.team_anlegen")}
          </Button>
        </form>
      </section>

      <section aria-labelledby="bots-liste">
        <h2 id="bots-liste" className={styles.abschnitt}>
          {t("teams.seite.bots")}
        </h2>
        {daten.ohneTeam.length === 0 ? (
          <p className={styles.leise}>{t("teams.seite.keine_bots")}</p>
        ) : (
          <ul className={styles.liste}>
            {daten.ohneTeam.map((bot) => (
              <li key={bot.id} className={styles.karte}>
                <div>
                  <b>{bot.name}</b>
                  <p className={styles.leise}>
                    {bot.rolle === "" ? t("teams.bot.kein_team") : bot.rolle}
                    {bot.pausiert && ` · ${t("teams.bot.pausiert")}`}
                  </p>
                </div>
                <Link className={styles.link} href={botAdresse(bot.id)}>
                  {t("teams.leiste.bot_oeffnen", { name: bot.name })}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <form
          className={styles.formular}
          onSubmit={(e) => anlegen("bot", { name: botName, role: botRolle }, e)}
        >
          <TextField
            label={t("teams.seite.bot_name")}
            value={botName}
            maxLength={LIMITS.botNameChars}
            onChange={(e) => setBotName(e.target.value)}
          />
          <TextField
            label={t("teams.seite.bot_rolle")}
            value={botRolle}
            maxLength={LIMITS.botRoleChars}
            placeholder={t("teams.seite.bot_rolle_platzhalter")}
            onChange={(e) => setBotRolle(e.target.value)}
          />
          <Button type="submit" art="primaer" laedt={sendet === "bot"} disabled={botName === ""}>
            {t("teams.seite.bot_anlegen")}
          </Button>
        </form>
      </section>
    </div>
  );
}
