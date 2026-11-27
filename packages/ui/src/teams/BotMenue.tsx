/**
 * PaiBot – Menü eines Bots (pausieren, Team wechseln, löschen) und die Rückfrage vor dem Löschen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-27
 */

"use client";

import { t } from "@paibot/shared/texte";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { Sym } from "../faden/symbole";
import styles from "./Teams.module.css";
import type { TeamsBot, TeamsTeam } from "./typen";

export interface BotMenueProps {
  bot: TeamsBot;
  teams: readonly TeamsTeam[];
  onPausieren: (botId: string) => void;
  onTeam: (botId: string, teamId: string | undefined) => void;
  /** Öffnet die Rückfrage; gelöscht wird erst, wenn der Besitzer sie bestätigt. */
  onLoeschenFragen: (botId: string) => void;
}

/**
 * Das Menü eines Bots: Knopf mit `aria-haspopup`, Pfeiltasten, Escape gibt den Fokus zurück.
 * Löschen fragt nach (Rückfrage im übergeordneten Baustein, damit sie über der ganzen Seite liegt).
 */
export function BotMenue({ bot, teams, onPausieren, onTeam, onLoeschenFragen }: BotMenueProps) {
  const [offen, setOffen] = useState(false);
  const [ansicht, setAnsicht] = useState<"haupt" | "teams">("haupt");
  const knopf = useRef<HTMLButtonElement>(null);
  const liste = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    // `ansicht` steht in der Bedingung, damit der Fokus beim Wechsel der Ansicht neu gesetzt wird.
    if (offen && ansicht) liste.current?.querySelector<HTMLElement>("[role^='menuitem']")?.focus();
  }, [offen, ansicht]);

  useEffect(() => {
    if (!offen) return;
    const aussen = (e: PointerEvent) => {
      const ziel = e.target as Node;
      if (!liste.current?.contains(ziel) && !knopf.current?.contains(ziel)) setOffen(false);
    };
    document.addEventListener("pointerdown", aussen);
    return () => document.removeEventListener("pointerdown", aussen);
  }, [offen]);

  const schliessen = (fokus: boolean) => {
    setOffen(false);
    setAnsicht("haupt");
    if (fokus) knopf.current?.focus();
  };

  const taste = (e: KeyboardEvent<HTMLDivElement>) => {
    const punkte = [...(liste.current?.querySelectorAll<HTMLElement>("[role^='menuitem']") ?? [])];
    const jetzt = punkte.indexOf(document.activeElement as HTMLElement);
    const gehe = (i: number) => {
      e.preventDefault();
      punkte[(i + punkte.length) % punkte.length]?.focus();
    };
    if (e.key === "ArrowDown") gehe(jetzt + 1);
    else if (e.key === "ArrowUp") gehe(jetzt - 1);
    else if (e.key === "Home") gehe(0);
    else if (e.key === "End") gehe(punkte.length - 1);
    else if (e.key === "Escape") {
      e.preventDefault();
      if (ansicht === "teams") setAnsicht("haupt");
      else schliessen(true);
    } else if (e.key === "Tab") schliessen(false);
  };

  return (
    <>
      <button
        ref={knopf}
        type="button"
        className={styles.menueKnopf}
        aria-haspopup="menu"
        aria-expanded={offen}
        aria-controls={offen ? id : undefined}
        aria-label={t("teams.bot.menue", { name: bot.name })}
        onClick={() => {
          setAnsicht("haupt");
          setOffen(!offen);
        }}
      >
        <Sym name="menue" groesse={15} />
      </button>
      {offen && (
        <div
          id={id}
          ref={liste}
          role="menu"
          className={styles.menue}
          aria-label={
            ansicht === "teams"
              ? t("teams.bot.team_waehlen", { name: bot.name })
              : t("teams.bot.menue", { name: bot.name })
          }
          onKeyDown={taste}
        >
          {ansicht === "haupt" ? (
            <>
              <button
                type="button"
                role="menuitem"
                className={styles.menuePunkt}
                onClick={() => {
                  onPausieren(bot.id);
                  schliessen(true);
                }}
              >
                <Sym name="pause" groesse={14} />
                {bot.pausiert ? t("teams.bot.fortsetzen") : t("teams.bot.pausieren")}
              </button>
              <button
                type="button"
                role="menuitem"
                aria-haspopup="menu"
                className={styles.menuePunkt}
                onClick={() => setAnsicht("teams")}
              >
                <Sym name="rechts" groesse={14} />
                {t("teams.bot.team_wechseln")}
              </button>
              <button
                type="button"
                role="menuitem"
                className={`${styles.menuePunkt} ${styles.gefahr}`}
                onClick={() => {
                  setOffen(false);
                  onLoeschenFragen(bot.id);
                }}
              >
                <Sym name="stift" groesse={14} />
                {t("teams.bot.loeschen")}
              </button>
            </>
          ) : (
            <>
              {teams.map((tm) => (
                <button
                  key={tm.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={bot.teamId === tm.id}
                  className={styles.menuePunkt}
                  onClick={() => {
                    onTeam(bot.id, tm.id);
                    schliessen(true);
                  }}
                >
                  <Sym name={bot.teamId === tm.id ? "haken" : "rechts"} groesse={14} />
                  {tm.name}
                </button>
              ))}
              <button
                type="button"
                role="menuitemradio"
                aria-checked={bot.teamId === undefined}
                className={styles.menuePunkt}
                onClick={() => {
                  onTeam(bot.id, undefined);
                  schliessen(true);
                }}
              >
                <Sym name={bot.teamId === undefined ? "haken" : "rechts"} groesse={14} />
                {t("teams.bot.kein_team")}
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}
