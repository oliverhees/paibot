/**
 * PaiBot – Zwischenschritt: Text eines früheren Schritts, eingeklappt, nie als Antwort.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { t } from "@paibot/shared/texte";
import { useId } from "react";
import { Icon, type IconName } from "../../basis/Icon";
import styles from "./Schritte.module.css";
import { schrittText } from "./text";

export type ZwischenArt = "zwischentext" | "verworfen" | "abgebrochen";

const SYMBOL: Record<ZwischenArt, IconName> = {
  zwischentext: "stufen",
  verworfen: "x",
  abgebrochen: "stopp",
};

export interface ZwischenschrittProps {
  /** Text des Modells aus diesem Schritt. Wird als reiner Text gezeigt. */
  text: string;
  /** zwischentext: vor einem Werkzeug · verworfen: vor „nichts gefunden“ · abgebrochen: Lauf endete. */
  art: ZwischenArt;
  /** Name des Bots (für den erklärenden Satz). */
  name: string;
  offen: boolean;
  onUmschalten: () => void;
  /** Eigener Wortlaut der Kennzeichnung (nur für Vergleiche von Entwürfen). */
  markeText?: string;
}

/**
 * Eine schmale Zeile mit der Kennzeichnung; der Text darunter erscheint nur nach einem Klick.
 * Die Kennzeichnung steht auch eingeklappt da, sie lässt sich nicht ausblenden.
 */
export function Zwischenschritt({
  text,
  art,
  name,
  offen,
  onUmschalten,
  markeText,
}: ZwischenschrittProps) {
  const panelId = useId();
  const marke = markeText ?? t(`schritte.zwischen.${art}`);
  const erklaerung =
    art === "zwischentext"
      ? t("schritte.zwischen.erklaerung.zwischentext", { name: schrittText(name, "name") })
      : t(`schritte.zwischen.erklaerung.${art}`);
  return (
    <div className={styles.zwischen} data-baustein="zwischenschritt" data-art={art}>
      <button
        type="button"
        className={styles.zwischenKopf}
        aria-expanded={offen}
        aria-controls={panelId}
        onClick={onUmschalten}
      >
        <span className={styles.marke} data-marke={art}>
          <Icon name={SYMBOL[art]} groesse={12} />
          <span>{marke}</span>
        </span>
        <Icon name="runter" groesse={13} className={styles.pfeil} />
      </button>
      <div id={panelId} className={styles.zwischenPanel} hidden={!offen}>
        <p className={styles.erklaerung}>{erklaerung}</p>
        <p
          className={art === "verworfen" ? styles.zwischenTextVerworfen : styles.zwischenText}
          dir="auto"
          data-fremd="zwischen"
        >
          {schrittText(text, "zwischen")}
        </p>
      </div>
    </div>
  );
}
