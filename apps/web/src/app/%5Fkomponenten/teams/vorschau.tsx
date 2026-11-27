/**
 * PaiBot – Vorschau der Teams: Szene und Thema umschaltbar, nur Beispiel-Daten, kein Abruf.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-27
 */

"use client";

import { t } from "@paibot/shared/texte";
import {
  Button,
  beispielDaten,
  TEAMS_SZENEN,
  TeamsAnsicht,
  type TeamsSzene,
  type Vorlage,
} from "@paibot/ui";
import { useEffect, useMemo, useState } from "react";
import styles from "./vorschau.module.css";

const GUELTIG = new Set<string>(TEAMS_SZENEN.map((s) => s.id));

/**
 * Alle fünf Szenen nebeneinander ausprobieren. Es gibt keine Abrufe und keinen Server: Pausieren,
 * Löschen, Team wechseln, Anlegen und Stoppen ändern nur den Speicher dieser Seite.
 * Mit `?szene=…&thema=hell&bot=zahlen` lässt sich ein Zustand direkt öffnen (für Bilder und Tests).
 */
export function TeamsVorschau({ vorlage }: { vorlage: Vorlage }) {
  const [szene, setSzene] = useState<TeamsSzene>("seitenleiste");
  const [dunkel, setDunkel] = useState<"dark" | "light">("dark");
  const [bot, setBot] = useState<string>();
  const [bereit, setBereit] = useState(false);
  const daten = useMemo(() => beispielDaten(vorlage), [vorlage]);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const s = q.get("szene");
    if (s && GUELTIG.has(s)) setSzene(s as TeamsSzene);
    if (q.get("thema") === "hell") setDunkel("light");
    const b = q.get("bot");
    if (b) setBot(`bot-${b}`);
    setBereit(true);
  }, []);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", dunkel);
  }, [dunkel]);

  return (
    <div className={styles.seite}>
      <header className={styles.leiste}>
        <strong>{t("teams.vorschau.titel")}</strong>
        <select
          className={styles.auswahl}
          value={szene}
          onChange={(e) => setSzene(e.target.value as TeamsSzene)}
          aria-label="Szene"
        >
          {TEAMS_SZENEN.map((s) => (
            <option key={s.id} value={s.id}>
              {t(s.textKey)}
            </option>
          ))}
        </select>
        <Button
          art="zweit"
          aria-pressed={dunkel === "light"}
          onClick={() => setDunkel(dunkel === "dark" ? "light" : "dark")}
        >
          {dunkel === "dark" ? t("teams.thema.hell") : t("teams.thema.dunkel")}
        </Button>
        <span className={styles.hinweis}>{t("teams.vorschau.hinweis")}</span>
      </header>
      <div className={styles.bild}>
        {bereit && (
          <TeamsAnsicht
            key={szene}
            daten={daten}
            start={szene}
            {...(bot ? { startBot: bot } : {})}
          />
        )}
      </div>
    </div>
  );
}
