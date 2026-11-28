/**
 * PaiBot – Steckbrief eines Bots in der App: zeigt ihn an und schaltet Pause, Team und Löschen
 * über die Routen des Tors. Löschen fragt zurück; die Belege des Bots bleiben.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

"use client";

import { t } from "@paibot/shared/texte";
import { Button, Dialog, Steckbrief } from "@paibot/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "../../../../lib/api/client";
import { TEAMS_ADRESSE } from "../../../../lib/navigation";
import { botPauseKoerper, botTeamKoerper } from "../../../../lib/teams/koerper";
import { TEAM_PFADE } from "../../../../lib/teams/pfade";
import type { BotSeiteDaten } from "../../../../lib/teams/seite";
import styles from "./steckbrief.module.css";

/** Fehlertext einer Antwort, mit Ausweg, wenn die Antwort einen nennt. */
function fehlerText(fehler: { text: string; ausweg?: string }): string {
  return fehler.ausweg ? `${fehler.text} ${fehler.ausweg}` : fehler.text;
}

export function BotSteckbrief({ daten, notAus }: { daten: BotSeiteDaten; notAus: boolean }) {
  const router = useRouter();
  const [sendet, setSendet] = useState(false);
  const [fehler, setFehler] = useState<string | undefined>();
  const [frage, setFrage] = useState(false);
  const bot = daten.bot;

  /** Ruft eine Route auf und lädt die Seite neu, damit alle Stellen denselben Stand zeigen. */
  async function rufe(
    methode: "PUT" | "DELETE",
    pfad: string,
    koerper?: unknown,
    danach?: () => void,
  ) {
    if (sendet) return;
    setSendet(true);
    setFehler(undefined);
    const antwort = await apiFetch<unknown>(methode, pfad, koerper);
    setSendet(false);
    if (!antwort.ok) {
      setFehler(fehlerText(antwort.fehler));
      return;
    }
    if (danach) danach();
    else router.refresh();
  }

  return (
    <div className={styles.seite}>
      <Steckbrief bot={bot} {...(daten.team ? { team: daten.team } : {})} notAus={notAus} />
      <section className={styles.aktionen} aria-label={t("teams.bot.menue", { name: bot.name })}>
        <Button
          art="zweit"
          laedt={sendet}
          onClick={() => rufe("PUT", TEAM_PFADE.botPause(bot.id), botPauseKoerper(!bot.pausiert))}
        >
          {bot.pausiert ? t("teams.bot.fortsetzen") : t("teams.bot.pausieren")}
        </Button>
        <label className={styles.teamWahl}>
          <span>{t("teams.bot.team_zuordnen")}</span>
          <select
            value={bot.teamId ?? ""}
            aria-label={t("teams.bot.team_waehlen", { name: bot.name })}
            disabled={sendet}
            onChange={(e) =>
              rufe("PUT", TEAM_PFADE.botTeam(bot.id), botTeamKoerper(e.target.value))
            }
          >
            <option value="">{t("teams.bot.kein_team")}</option>
            {daten.teams.map((tm) => (
              <option key={tm.id} value={tm.id}>
                {tm.name}
              </option>
            ))}
          </select>
        </label>
        {daten.haupt ? (
          <p className={styles.hinweisZeile}>{t("teams.bot.haupt")}</p>
        ) : (
          <Button art="gefahr" onClick={() => setFrage(true)} disabled={sendet}>
            {t("teams.bot.loeschen")}
          </Button>
        )}
      </section>
      {fehler !== undefined && (
        <p className={styles.fehler} role="alert">
          {fehler}
        </p>
      )}
      <Dialog
        offen={frage}
        rueckfrage
        titel={t("teams.loeschen.titel", { name: bot.name })}
        schliessenLabel={t("teams.loeschen.schliessen")}
        onSchliessen={() => setFrage(false)}
        aktionen={
          <>
            <Button art="zweit" onClick={() => setFrage(false)}>
              {t("teams.loeschen.nein")}
            </Button>
            <Button
              art="gefahr"
              laedt={sendet}
              onClick={() =>
                rufe("DELETE", TEAM_PFADE.bot(bot.id), undefined, () => {
                  setFrage(false);
                  router.replace(TEAMS_ADRESSE);
                })
              }
            >
              {t("teams.loeschen.ja")}
            </Button>
          </>
        }
      >
        <p>
          {t("teams.loeschen.text")}
          {daten.team?.leitungId === bot.id &&
            ` ${t("teams.loeschen.leitung", { name: bot.name, team: daten.team.name })}`}
        </p>
      </Dialog>
    </div>
  );
}
