/**
 * PaiBot – Verwaltung eines Teams in der App: speichert über die Route des Tors und löscht das
 * Team nach Rückfrage. Ohne Tagesgrenze steht der Hinweis am Schalter „Zusammenarbeit“.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

"use client";

import { t } from "@paibot/shared/texte";
import { Button, Dialog, type TeamAenderung, TeamVerwaltung } from "@paibot/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "../../../../lib/api/client";
import { TEAMS_ADRESSE } from "../../../../lib/navigation";
import { teamAendernKoerper } from "../../../../lib/teams/koerper";
import { TEAM_PFADE } from "../../../../lib/teams/pfade";
import type { TeamMitBots } from "../../../../lib/teams/seite";

function fehlerText(fehler: { text: string; ausweg?: string }): string {
  return fehler.ausweg ? `${fehler.text} ${fehler.ausweg}` : fehler.text;
}

export function TeamSeite({ daten }: { daten: TeamMitBots & { ohneTagesbudget: boolean } }) {
  const router = useRouter();
  const [sendet, setSendet] = useState(false);
  const [fehler, setFehler] = useState<string | undefined>();
  const [frage, setFrage] = useState(false);
  const team = daten.team;

  async function speichern(aenderung: TeamAenderung) {
    if (sendet) return;
    setSendet(true);
    setFehler(undefined);
    const antwort = await apiFetch<unknown>(
      "PUT",
      TEAM_PFADE.team(team.id),
      teamAendernKoerper(aenderung),
    );
    setSendet(false);
    if (antwort.ok) {
      router.refresh();
      return;
    }
    setFehler(fehlerText(antwort.fehler));
    throw new Error(antwort.fehler.code);
  }

  async function loeschen() {
    setSendet(true);
    setFehler(undefined);
    const antwort = await apiFetch<unknown>("DELETE", TEAM_PFADE.team(team.id));
    setSendet(false);
    setFrage(false);
    if (antwort.ok) {
      router.replace(TEAMS_ADRESSE);
      return;
    }
    setFehler(fehlerText(antwort.fehler));
  }

  return (
    <>
      <TeamVerwaltung
        key={team.id}
        team={team}
        mitglieder={daten.mitglieder}
        ohneTagesbudget={daten.ohneTagesbudget}
        onSpeichern={speichern}
        onLoeschen={() => setFrage(true)}
        sendet={sendet}
        {...(fehler === undefined ? {} : { fehler })}
      />
      <Dialog
        offen={frage}
        rueckfrage
        titel={t("teams.verwaltung.loeschen_titel", { name: team.name })}
        schliessenLabel={t("teams.loeschen.schliessen")}
        onSchliessen={() => setFrage(false)}
        aktionen={
          <>
            <Button art="zweit" onClick={() => setFrage(false)}>
              {t("teams.loeschen.nein")}
            </Button>
            <Button art="gefahr" laedt={sendet} onClick={() => void loeschen()}>
              {t("teams.loeschen.ja")}
            </Button>
          </>
        }
      >
        <p>{t("teams.verwaltung.loeschen_text")}</p>
      </Dialog>
    </>
  );
}
