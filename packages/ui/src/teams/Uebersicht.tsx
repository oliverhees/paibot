/**
 * PaiBot – Teams-Übersicht: alle Fäden aller Teams nach laufend, wartet auf dich und fertig.
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
import { BotAvatar } from "../faden/BotAvatar";
import styles from "./Teams.module.css";
import type { TeamsBot, TeamsTeam, UebersichtFaden, UebersichtStand } from "./typen";

const SPALTEN: readonly {
  stand: UebersichtStand;
  titel: "teams.uebersicht.laeuft" | "teams.uebersicht.wartet" | "teams.uebersicht.fertig";
}[] = [
  { stand: "laeuft", titel: "teams.uebersicht.laeuft" },
  { stand: "wartet", titel: "teams.uebersicht.wartet" },
  { stand: "fertig", titel: "teams.uebersicht.fertig" },
];

/**
 * Alle Teams auf einen Blick. Mehr als „Faden öffnen“ und „Stoppen“ gibt es hier nicht: Entscheiden
 * und Antworten passiert im Faden selbst. Gestoppte Fäden stehen unter „Fertig“ mit dem Wort „gestoppt“.
 */
export function TeamsUebersicht({
  faeden,
  teams,
  bots,
}: {
  faeden: readonly UebersichtFaden[];
  teams: readonly TeamsTeam[];
  bots: readonly TeamsBot[];
}) {
  const [gestoppt, setGestoppt] = useState<ReadonlySet<string>>(new Set());
  const [geoeffnet, setGeoeffnet] = useState<string>();
  const stand = (f: UebersichtFaden): UebersichtStand => (gestoppt.has(f.id) ? "fertig" : f.stand);
  const sichtbar = faeden.filter((f) => teams.some((tm) => tm.id === f.teamId));

  return (
    <section
      className={styles.seite}
      aria-label={t("teams.uebersicht.region")}
      data-baustein="uebersicht"
    >
      <h1 className={styles.titel}>{t("teams.uebersicht.region")}</h1>
      <div className={styles.spalten}>
        {SPALTEN.map((sp) => {
          const liste = sichtbar.filter((f) => stand(f) === sp.stand);
          return (
            <section
              key={sp.stand}
              className={styles.spalte}
              aria-label={t(sp.titel)}
              data-stand={sp.stand}
            >
              <h2 className={styles.spaltenKopf}>
                {t(sp.titel)} <span className={styles.zahl}>{liste.length}</span>
              </h2>
              {liste.length === 0 && <p className={styles.leise}>{t("teams.uebersicht.leer")}</p>}
              <ul className={styles.faeden}>
                {liste.map((f) => {
                  const team = teams.find((tm) => tm.id === f.teamId);
                  const leitung = bots.find((b) => b.id === team?.leitungId);
                  const wurdeGestoppt = gestoppt.has(f.id);
                  return (
                    <li key={f.id} className={styles.fadenKarte} data-baustein="uebersicht-faden">
                      <div className={styles.fadenKopf}>
                        {leitung && (
                          <BotAvatar
                            farbe={leitung.farbe}
                            {...(leitung.form ? { form: leitung.form } : {})}
                            groesse={22}
                            still
                          />
                        )}
                        <b className={styles.fadenTitel}>{f.titel}</b>
                      </div>
                      <p className={styles.leise}>
                        {team?.name} · {f.zeit}
                        {wurdeGestoppt && ` · ${t("teams.uebersicht.gestoppt")}`}
                        {f.abgenommenVon &&
                          ` · ${t("teams.uebersicht.abgenommen", { name: f.abgenommenVon })}`}
                      </p>
                      <div className={styles.aktionen}>
                        <button
                          type="button"
                          className={styles.knopf}
                          aria-label={t("teams.uebersicht.faden_oeffnen", { titel: f.titel })}
                          onClick={() => setGeoeffnet(f.id)}
                        >
                          {t("teams.uebersicht.oeffnen")}
                        </button>
                        {sp.stand !== "fertig" && (
                          <button
                            type="button"
                            className={`${styles.knopf} ${styles.gefahrKnopf}`}
                            aria-label={t("teams.uebersicht.faden_stoppen", { titel: f.titel })}
                            onClick={() => setGestoppt(new Set([...gestoppt, f.id]))}
                          >
                            {t("teams.uebersicht.stoppen")}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
      <p className={styles.leise} role="status">
        {geoeffnet
          ? t("teams.uebersicht.geoeffnet", {
              titel: faeden.find((f) => f.id === geoeffnet)?.titel ?? "",
            })
          : ""}
      </p>
    </section>
  );
}
