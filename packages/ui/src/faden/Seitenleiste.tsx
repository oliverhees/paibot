/**
 * PaiBot – Seitenleiste für Fäden: Pai, Teams mit Leitung und Mitgliedern, Fäden je Team, Not-Aus.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import { t } from "@paibot/shared/texte";
import { useState } from "react";
import { AvatarStapel, BotAvatar } from "./BotAvatar";
import { sichtbareMitglieder } from "./funktionen";
import styles from "./Seitenleiste.module.css";
import { Sym } from "./symbole";
import { reinerText, sauberName } from "./text";
import type { FadenBot, SeitenleisteDaten, TeamDaten, TeamFaden } from "./typen";

export interface FadenSeitenleisteProps {
  daten: SeitenleisteDaten;
  bots: Readonly<Record<string, FadenBot>>;
  /** Kennung des offenen Fadens. */
  aktivFaden?: string;
  onFaden?: (id: string) => void;
  onNeuerFaden?: (teamId: string) => void;
  onNeuesTeam?: () => void;
  onNotAus?: () => void;
  onFortsetzen?: () => void;
  onFragen?: () => void;
  onBot?: (botId: string) => void;
}

function FadenZeile({
  f,
  aktiv,
  onFaden,
  icon = "faden",
}: {
  f: TeamFaden;
  aktiv: boolean;
  onFaden: FadenSeitenleisteProps["onFaden"];
  icon?: "faden" | "zurueck";
}) {
  return (
    <button
      type="button"
      className={styles.faden}
      aria-current={aktiv ? "true" : undefined}
      onClick={() => onFaden?.(f.id)}
    >
      <Sym name={icon} groesse={14} />
      <span className={styles.titel}>{reinerText(f.titel, 80)}</span>
      <span className={styles.stand} data-art={f.standArt}>
        {reinerText(f.stand, 30)}
      </span>
    </button>
  );
}

function BotZeile({
  bot,
  klein,
  leitung,
  onBot,
}: {
  bot: FadenBot;
  klein?: boolean;
  leitung?: boolean;
  onBot: FadenSeitenleisteProps["onBot"];
}) {
  return (
    <button type="button" className={styles.zeile} onClick={() => onBot?.(bot.id)}>
      <BotAvatar
        farbe={bot.farbe}
        {...(bot.form ? { form: bot.form } : {})}
        zustand={bot.zustand}
        groesse={klein ? 22 : 24}
        still
      />
      <span className={styles.name}>
        <b>{sauberName(bot.name)}</b>
        {leitung && <span className={styles.leitung}>{t("faden.seite.leitung")}</span>}{" "}
        {klein ? (
          !leitung && <span className={styles.rolle}>{reinerText(bot.rolle, 30)}</span>
        ) : (
          <small>{reinerText(bot.rolle, 40)}</small>
        )}
      </span>
      <span className={styles.stand} data-art={bot.standArt}>
        {reinerText(bot.stand, 30)}
      </span>
    </button>
  );
}

function TeamBlock({
  team,
  bots,
  aktivFaden,
  p,
}: {
  team: TeamDaten;
  bots: Readonly<Record<string, FadenBot>>;
  aktivFaden: string | undefined;
  p: FadenSeitenleisteProps;
}) {
  const [offen, setOffen] = useState(team.offen);
  const [alle, setAlle] = useState(false);
  const leitung = bots[team.leitung];
  const mitglieder = team.mitglieder.flatMap((m) => (bots[m] ? [bots[m] as FadenBot] : []));
  const { sichtbar, ruhig } = sichtbareMitglieder(mitglieder);
  const gezeigt = alle ? mitglieder : sichtbar;
  const stapel = [leitung, ...mitglieder].flatMap((b) => (b ? [b] : [])).slice(0, 7);
  return (
    <div className={styles.team} data-baustein="team">
      <button
        type="button"
        className={styles.teamKopf}
        aria-expanded={offen}
        aria-label={t("faden.seite.team_zeigen", { name: sauberName(team.name) })}
        onClick={() => setOffen(!offen)}
      >
        <Sym name={offen ? "unten" : "rechts"} groesse={14} />
        {sauberName(team.name)}
        <span className={styles.stapel}>
          <AvatarStapel bots={stapel} groesse={16} ueberlappung={6} />
        </span>
        {mitglieder.length + 1 > 6 && <span className={styles.stand}>{mitglieder.length + 1}</span>}
      </button>
      {offen && (
        <div className={styles.glieder}>
          {leitung && <BotZeile bot={leitung} klein leitung onBot={p.onBot} />}
          {gezeigt.map((m) => (
            <div key={m.id}>
              <BotZeile bot={m} klein onBot={p.onBot} />
              {team.botFaeden?.[m.id] && (
                <div className={styles.unter} style={{ marginLeft: 30 }}>
                  {team.botFaeden[m.id]?.map((f) => (
                    <FadenZeile
                      key={f.id}
                      f={f}
                      aktiv={f.id === aktivFaden}
                      onFaden={p.onFaden}
                      icon="zurueck"
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
          {!alle && ruhig.length > 0 && (
            <button
              type="button"
              className={styles.zeile}
              aria-expanded={false}
              aria-label={t("faden.seite.ruhig_zeigen")}
              onClick={() => setAlle(true)}
            >
              <AvatarStapel bots={ruhig.slice(0, 4)} groesse={18} ueberlappung={6} />
              <span className={`${styles.name} ${styles.ruhig}`}>
                {t("faden.seite.ruhig", { anzahl: ruhig.length })}
              </span>
              <Sym name="unten" groesse={14} />
            </button>
          )}
          {alle && ruhig.length > 0 && (
            <button
              type="button"
              className={styles.zeile}
              aria-expanded={true}
              aria-label={t("faden.seite.ruhig_zeigen")}
              onClick={() => setAlle(false)}
            >
              <span className={`${styles.name} ${styles.ruhig}`}>
                {t("faden.seite.ruhig", { anzahl: ruhig.length })}
              </span>
              <Sym name="oben" groesse={14} />
            </button>
          )}
          <div className={styles.abschnitt} style={{ margin: "10px 6px 4px" }}>
            <h2>{t("faden.seite.faeden")}</h2>
          </div>
          {team.faeden.map((f) => (
            <FadenZeile key={f.id} f={f} aktiv={f.id === aktivFaden} onFaden={p.onFaden} />
          ))}
          <button
            type="button"
            className={styles.faden}
            data-neu="true"
            onClick={() => p.onNeuerFaden?.(team.id)}
          >
            <Sym name="plus" groesse={14} />
            <span className={styles.titel}>{t("faden.seite.neuer_faden")}</span>
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Seitenleiste für Teams. Zeigt Pai als Haupt-Assistenten, die Teams mit ihrer Leitung und den
 * Mitgliedern (ab mehr als sechs „+N ruhig“), die Fäden je Team mit Stand und „Neuer Faden“. Der
 * Stand je Bot und je Faden kommt fertig von außen.
 */
export function FadenSeitenleiste(p: FadenSeitenleisteProps) {
  const { daten, bots } = p;
  const pai = bots.pai;
  return (
    <aside
      className={styles.seite}
      aria-label={t("faden.seite.region")}
      data-baustein="seitenleiste"
    >
      <div className={styles.marke}>
        {pai && (
          <BotAvatar
            farbe={pai.farbe}
            {...(pai.form ? { form: pai.form } : {})}
            groesse={26}
            still
          />
        )}
        <span className={styles.wort}>PaiBot</span>
      </div>
      <div className={styles.notaus} data-an={daten.notAus ? "true" : undefined}>
        <span className={styles.punkt} aria-hidden="true" />
        <span className={styles.text}>
          {daten.notAus ? t("faden.seite.notaus_an") : t("faden.seite.notaus_laeuft")}
          <small>{t("faden.seite.notaus")}</small>
        </span>
        <button type="button" onClick={() => (daten.notAus ? p.onFortsetzen?.() : p.onNotAus?.())}>
          {daten.notAus ? t("faden.seite.fortsetzen") : t("faden.seite.anhalten")}
        </button>
      </div>
      {daten.fragenAnzahl > 0 && (
        <button type="button" className={styles.post} onClick={() => p.onFragen?.()}>
          <Sym name="post" groesse={16} />
          <span>
            <b>
              {daten.fragenText ??
                (daten.fragenAnzahl === 1
                  ? t("faden.seite.frage_fett")
                  : t("faden.seite.fragen_fett", { anzahl: daten.fragenAnzahl }))}
            </b>{" "}
            {t("faden.seite.an_dich")}
          </span>
          <Sym name="rechts" groesse={14} />
        </button>
      )}

      <div className={styles.abschnitt}>
        <h2>{t("faden.seite.haupt")}</h2>
      </div>
      {pai && (
        <button type="button" className={styles.zeile} onClick={() => p.onBot?.("pai")}>
          <BotAvatar
            farbe={pai.farbe}
            {...(pai.form ? { form: pai.form } : {})}
            zustand={pai.zustand}
            groesse={24}
            still
          />
          <span className={styles.name}>
            <b>{sauberName(pai.name)}</b>
            <small>{t("faden.seite.pai_rolle")}</small>
          </span>
          <span className={styles.stand}>{reinerText(pai.stand, 30)}</span>
        </button>
      )}
      <div className={styles.unter}>
        {daten.paiFaeden.map((f) => (
          <FadenZeile
            key={f.id}
            f={{ id: f.id, titel: f.titel, stand: f.stand }}
            aktiv={f.id === p.aktivFaden}
            onFaden={p.onFaden}
          />
        ))}
      </div>

      <div className={styles.abschnitt}>
        <h2>{t("faden.seite.teams")}</h2>
        <button
          type="button"
          className={styles.plus}
          aria-label={t("faden.seite.neues_team")}
          onClick={() => p.onNeuesTeam?.()}
        >
          <Sym name="plus" groesse={15} />
        </button>
      </div>
      {daten.teams.length === 0 ? (
        <div className={styles.leer}>
          {t("faden.leer.seite")}
          <div>
            <button type="button" onClick={() => p.onNeuesTeam?.()}>
              <Sym name="plus" groesse={14} />
              {t("faden.leer.team_anlegen")}
            </button>
          </div>
        </div>
      ) : (
        daten.teams.map((team) => (
          <TeamBlock key={team.id} team={team} bots={bots} aktivFaden={p.aktivFaden} p={p} />
        ))
      )}
      {daten.weitereTeams?.map((w) => {
        const leitung = bots[w.leitungId];
        return (
          <div className={styles.team} key={w.id}>
            <button
              type="button"
              className={styles.teamKopf}
              aria-expanded={false}
              aria-label={t("faden.seite.team_zeigen", { name: sauberName(w.name) })}
            >
              <Sym name="rechts" groesse={14} />
              {sauberName(w.name)}
              <span className={styles.stapel}>
                {leitung && <AvatarStapel bots={[leitung]} groesse={16} />}
              </span>
              <span className={styles.stand}>{t("faden.seite.bots", { anzahl: w.anzahl })}</span>
            </button>
          </div>
        );
      })}

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
    </aside>
  );
}
