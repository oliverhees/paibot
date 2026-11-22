/**
 * PaiBot – Zugriff eines Bots auf eine App: „kein Zugriff“ oder „darf lesen“.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import type { BotColor } from "@paibot/shared/objekte";
import { t } from "@paibot/shared/texte";
import { useId } from "react";
import { klassen } from "../basis/klassen";
import { bereinigeFremdText } from "./fremdText";
import styles from "./Zugriff.module.css";

export type AppZugriff = "keiner" | "lesen";

export interface ZugriffUmschalterProps {
  /** Der Bot, um den es geht. */
  bot: { name: string; farbe?: BotColor };
  /** Name der App (fremder Text), nur für den zugänglichen Namen der Gruppe. */
  app: string;
  wert: AppZugriff;
  onAendern: (wert: AppZugriff) => void;
  /** Wie viele Werkzeuge der App der Besitzer als „liest“ bestätigt hat. */
  lesendeWerkzeuge: number;
  /** Wird gerade gespeichert. */
  speichert?: boolean;
  className?: string;
}

/**
 * Zwei Stufen je Bot und App: „kein Zugriff“ oder „darf lesen“. „Schreiben“ gibt es hier nicht.
 * Auch mit „darf lesen“ bekommt der Bot nur Werkzeuge, die der Besitzer als „liest“ bestätigt hat.
 * Es sind echte Radio-Knöpfe: Pfeiltasten wechseln, ein Tab-Halt für die Gruppe.
 */
export function ZugriffUmschalter({
  bot,
  app,
  wert,
  onAendern,
  lesendeWerkzeuge,
  speichert = false,
  className,
}: ZugriffUmschalterProps) {
  const gruppe = useId();
  const textId = useId();
  const botName = bereinigeFremdText(bot.name, "name").text;
  const appName = bereinigeFremdText(app, "name").text || t("apps.fremd.leer");
  const aus = speichert;
  const text =
    wert === "keiner"
      ? t("apps.zugriff.text.keiner", { name: botName })
      : lesendeWerkzeuge > 0
        ? t("apps.zugriff.text.lesen", { name: botName })
        : t("apps.zugriff.text.lesen.leer", { name: botName });
  const stufen: { wert: AppZugriff; text: string }[] = [
    { wert: "keiner", text: t("apps.zugriff.keiner") },
    { wert: "lesen", text: t("apps.zugriff.lesen") },
  ];

  return (
    <div
      className={klassen(styles.umschalter, className)}
      data-wert={wert}
      aria-busy={speichert || undefined}
    >
      <div className={styles.kopf}>
        <span className={styles.bot}>
          <span
            className={styles.punkt}
            aria-hidden="true"
            style={bot.farbe ? { background: `var(--bot-${bot.farbe})` } : undefined}
          />
          <span className={styles.botName}>{botName}</span>
        </span>
        <div
          className={styles.wahl}
          role="radiogroup"
          aria-label={t("apps.zugriff.label", { bot: botName, app: appName })}
          aria-describedby={textId}
        >
          {stufen.map((s) => (
            <label key={s.wert} className={styles.stufe}>
              <input
                type="radio"
                name={gruppe}
                value={s.wert}
                checked={wert === s.wert}
                disabled={aus}
                onChange={() => onAendern(s.wert)}
              />
              <span>{s.text}</span>
            </label>
          ))}
        </div>
      </div>
      <p
        className={styles.text}
        id={textId}
        data-leer={wert === "lesen" && lesendeWerkzeuge === 0 ? "" : undefined}
      >
        {text}
      </p>
    </div>
  );
}
