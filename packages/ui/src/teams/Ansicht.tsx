/**
 * PaiBot – Rahmen der Teams-Vorschau: Seitenleiste (Blatt von unten am Handy) und die fünf Szenen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-27
 */

"use client";

import { t } from "@paibot/shared/texte";
import { useMemo, useState } from "react";
import { Sym } from "../faden/symbole";
import { Dialog } from "../ueberlagerung/Dialog";
import { type EntwurfStatus, EntwurfVorschau } from "./Entwurf";
import { TeamsSeitenleiste } from "./Seitenleiste";
import { Steckbrief } from "./Steckbrief";
import styles from "./Teams.module.css";
import type { TeamsBot, TeamsDaten, TeamsSzene } from "./typen";
import { TeamsUebersicht } from "./Uebersicht";
import { TeamVerwaltung } from "./Verwaltung";

export interface TeamsAnsichtProps {
  daten: TeamsDaten;
  /** Szene, mit der die Ansicht beginnt; danach wechselt der Nutzer über die Seitenleiste. */
  start?: TeamsSzene;
  /** Kennung des Bots der Szene „Bot-Seite“. */
  startBot?: string;
}

interface Auswahl {
  botId?: string;
  teamId?: string;
}

/**
 * Bots und Teams verwalten, ganz ohne Server: alles liegt im Speicher dieser Seite. Am Handy ist die
 * Seitenleiste ein Blatt von unten. Das Team der Vorlage gibt es erst, wenn der Entwurf angelegt ist.
 */
export function TeamsAnsicht({ daten, start = "seitenleiste", startBot }: TeamsAnsichtProps) {
  const vorlageBots = useMemo(
    () => new Set(daten.bots.filter((b) => b.teamId === daten.vorlageTeamId).map((b) => b.id)),
    [daten],
  );
  const [szene, setSzene] = useState<TeamsSzene>(start);
  const [bots, setBots] = useState<readonly TeamsBot[]>(daten.bots);
  const [geloescht, setGeloescht] = useState<ReadonlySet<string>>(new Set());
  const [notAus, setNotAus] = useState(false);
  const [frage, setFrage] = useState<string>();
  const [offen, setOffen] = useState(start === "seitenleiste");
  const [entwurf, setEntwurf] = useState<EntwurfStatus>(start === "entwurf" ? "offen" : "angelegt");
  const [namen, setNamen] = useState<ReadonlySet<string>>(
    new Set(daten.vorlage.bots.map((b) => b.name)),
  );
  const [auswahl, setAuswahl] = useState<Auswahl>({
    botId: startBot ?? daten.bots.find((b) => b.id === "bot-redaktion")?.id,
    teamId: daten.vorlageTeamId,
  });

  const angelegt = entwurf === "angelegt";
  const sichtbareBots = bots.filter(
    (b) => !geloescht.has(b.id) && (!vorlageBots.has(b.id) || (angelegt && namen.has(b.name))),
  );
  const sichtbareTeams = daten.teams.filter((tm) => tm.id !== daten.vorlageTeamId || angelegt);

  const gehe = (s: TeamsSzene, a: Auswahl = {}) => {
    setSzene(s);
    setAuswahl((alt) => ({ ...alt, ...a }));
    setOffen(false);
  };
  const aendere = (id: string, f: (b: TeamsBot) => TeamsBot) =>
    setBots((alt) => alt.map((b) => (b.id === id ? f(b) : b)));

  const zuLoeschen = sichtbareBots.find((b) => b.id === frage);
  const leitungVon = sichtbareTeams.find((tm) => tm.leitungId === frage);
  const bot = sichtbareBots.find((b) => b.id === auswahl.botId);
  const team = sichtbareTeams.find((tm) => tm.id === auswahl.teamId);
  const aktiv =
    szene === "bot" && bot
      ? { art: "bot" as const, id: bot.id }
      : szene === "team" && team
        ? { art: "team" as const, id: team.id }
        : szene === "uebersicht"
          ? { art: "uebersicht" as const }
          : undefined;

  const inhalt = () => {
    if (szene === "bot" && bot) {
      const tm = sichtbareTeams.find((x) => x.id === bot.teamId);
      return <Steckbrief key={bot.id} bot={bot} {...(tm ? { team: tm } : {})} notAus={notAus} />;
    }
    if (szene === "team" && team) {
      return (
        <TeamVerwaltung
          key={team.id}
          team={team}
          mitglieder={sichtbareBots.filter((b) => b.teamId === team.id)}
        />
      );
    }
    if (szene === "entwurf") {
      return (
        <EntwurfVorschau
          vorlage={daten.vorlage}
          status={entwurf}
          notAus={notAus}
          onAnlegen={(gewaehlte) => {
            setNamen(new Set(gewaehlte.map((b) => b.name)));
            setEntwurf("angelegt");
          }}
          onRueckgaengig={() => setEntwurf("zurueck")}
          onVerwerfen={() => setEntwurf("verworfen")}
          onWiederOeffnen={() => setEntwurf("offen")}
        />
      );
    }
    if (szene === "uebersicht") {
      return <TeamsUebersicht faeden={daten.faeden} teams={sichtbareTeams} bots={sichtbareBots} />;
    }
    return (
      <p className={styles.leer} data-baustein="leer">
        <span className={styles.nurBreit}>{t("teams.leiste.leer")}</span>
        <span className={styles.nurHandy}>{t("teams.leiste.leer_handy")}</span>
      </p>
    );
  };

  return (
    <div className={styles.wurzel} data-baustein="teams-ansicht" data-szene={szene}>
      <aside className={styles.blatt} data-offen={offen}>
        <button
          type="button"
          className={styles.griff}
          aria-expanded={offen}
          aria-label={t("teams.leiste.zeigen")}
          onClick={() => setOffen(!offen)}
        >
          <Sym name="liste" groesse={16} />
          <b>{t("teams.leiste.oeffnen")}</b>
          <Sym name={offen ? "unten" : "oben"} groesse={16} />
        </button>
        <TeamsSeitenleiste
          bots={sichtbareBots}
          teams={sichtbareTeams}
          {...(aktiv ? { aktiv } : {})}
          notAus={notAus}
          onBot={(id) => gehe("bot", { botId: id })}
          onTeam={(id) => gehe("team", { teamId: id })}
          onUebersicht={() => gehe("uebersicht")}
          onNotAus={() => setNotAus(!notAus)}
          onPausieren={(id) => aendere(id, (b) => ({ ...b, pausiert: !b.pausiert }))}
          onTeamWechseln={(id, teamId) => {
            aendere(id, (b) => {
              const { teamId: _alt, ...rest } = b;
              return teamId ? { ...rest, teamId } : rest;
            });
          }}
          onLoeschenFragen={setFrage}
        />
      </aside>
      <main className={styles.haupt}>{inhalt()}</main>
      {zuLoeschen && (
        <Dialog
          offen
          rueckfrage
          titel={t("teams.loeschen.titel", { name: zuLoeschen.name })}
          schliessenLabel={t("teams.loeschen.schliessen")}
          onSchliessen={() => setFrage(undefined)}
          aktionen={
            <>
              <button type="button" className={styles.knopf} onClick={() => setFrage(undefined)}>
                {t("teams.loeschen.nein")}
              </button>
              <button
                type="button"
                className={`${styles.knopf} ${styles.gefahrKnopf}`}
                onClick={() => {
                  setGeloescht((alt) => new Set([...alt, zuLoeschen.id]));
                  setFrage(undefined);
                }}
              >
                {t("teams.loeschen.ja")}
              </button>
            </>
          }
        >
          <p className={styles.frageText}>
            {t("teams.loeschen.text")}
            {leitungVon &&
              ` ${t("teams.loeschen.leitung", { name: zuLoeschen.name, team: leitungVon.name })}`}
          </p>
        </Dialog>
      )}
    </div>
  );
}
