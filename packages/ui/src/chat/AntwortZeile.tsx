/**
 * PaiBot – Zeile unter jeder Antwort: Beleg, Datenschleuse und Modell mit Herkunft.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

"use client";

import { t } from "@paibot/shared/texte";
import { type ReactNode, useId, useState } from "react";
import { Icon } from "../basis/Icon";
import { klassen } from "../basis/klassen";
import styles from "./AntwortZeile.module.css";

export type BelegZustand = "gueltig" | "offen" | "ungueltig";

export type BelegAngabe = {
  /** Kurze Kennung des Belegs, z. B. „B-0142“. */
  kennung: string;
  /** Öffnet den Beleg bzw. startet die Prüfung. */
  onPruefen?: () => void;
} & (
  | { zustand: "gueltig" | "offen"; zustandText?: string }
  | { zustand: "ungueltig"; zustandText: string }
);

export interface SchleuseAngabe {
  modus: "direkt" | "schleuse";
  /** Eigener Text; Standard „direkt · EU“ bzw. „geschützt über die Datenschleuse“. */
  text?: string;
  /** Kurzform für schmale Breiten, z. B. „2 maskiert“. */
  kurz?: string;
}

export interface ModellAngabe {
  name: string;
  /** Herkunft des Modells; ergibt „EU“, „außerhalb der EU“ oder „lokal“. */
  region: "eu" | "non_eu" | "local";
}

function belegText(beleg: BelegAngabe): string {
  if (beleg.zustandText) return beleg.zustandText;
  return beleg.zustand === "gueltig" ? t("pruefung.gueltig") : t("belege.pruefen");
}

/** Teil „Beleg“: Häkchen, Kennung und Zustand als Wort. */
export function BelegZeile({ beleg }: { beleg: BelegAngabe }) {
  const text = belegText(beleg);
  const inhalt = (
    <>
      <span className={styles.haken} data-zustand={beleg.zustand}>
        <Icon
          name={
            beleg.zustand === "ungueltig" ? "x" : beleg.zustand === "gueltig" ? "check" : "beleg"
          }
        />
      </span>
      <span className={styles.lang}>{text}</span>
      <span className={styles.mono}>{beleg.kennung}</span>
    </>
  );
  if (!beleg.onPruefen) {
    return (
      <span className={klassen(styles.teil, styles.beleg)} title={`${text} · ${beleg.kennung}`}>
        {inhalt}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={klassen(styles.teil, styles.beleg)}
      onClick={beleg.onPruefen}
      aria-label={`${t("belege.pruefen")}: ${beleg.kennung}, ${text}`}
    >
      {inhalt}
    </button>
  );
}

function schleuseText(s: SchleuseAngabe): string {
  return (
    s.text ??
    (s.modus === "schleuse" ? t("schleuse.hinweis.schleuse") : t("schleuse.hinweis.direkt"))
  );
}

/** Teil „Datenschleuse“: ob die Nachricht direkt oder über die Schleuse ging. */
export function SchleuseHinweis({
  schleuse,
  offen,
  onUmschalten,
  steuert,
}: {
  schleuse: SchleuseAngabe;
  offen?: boolean;
  onUmschalten?: () => void;
  steuert?: string;
}) {
  const text = schleuseText(schleuse);
  const inhalt = (
    <>
      <Icon name="schleuse" />
      <span className={schleuse.kurz ? styles.lang : undefined}>{text}</span>
      {schleuse.kurz && <span className={styles.kurz}>{schleuse.kurz}</span>}
      {onUmschalten && <Icon name="runter" className={styles.pfeil} />}
    </>
  );
  const klasse = klassen(styles.teil, styles.schleuse);
  if (!onUmschalten) {
    return (
      <span className={klasse} data-modus={schleuse.modus}>
        {inhalt}
      </span>
    );
  }
  return (
    <button
      type="button"
      className={klasse}
      data-modus={schleuse.modus}
      aria-expanded={offen ?? false}
      aria-controls={steuert}
      aria-label={text}
      onClick={onUmschalten}
    >
      {inhalt}
    </button>
  );
}

/** Teil „Modell“: Name und Herkunft; schmal nur die Herkunft. */
export function ModellHerkunft({ modell }: { modell: ModellAngabe }) {
  const region = t(`modelle.region.${modell.region}`);
  return (
    <span className={klassen(styles.teil, styles.modell)} title={`${modell.name} · ${region}`}>
      <span className={styles.lang}>{modell.name}</span>
      <span className={styles.lang} aria-hidden="true">
        ·
      </span>
      <span>{region}</span>
    </span>
  );
}

export interface AntwortZeileProps {
  beleg?: BelegAngabe;
  schleuse: SchleuseAngabe;
  modell: ModellAngabe;
  /** Inhalt zum Aufklappen, z. B. „Das hat das Modell gesehen“. */
  details?: ReactNode;
}

/**
 * Ruhige Zeile unter jeder Antwort: Beleg · Datenschleuse · Modell mit Herkunft.
 * Schmal werden die Teile gekürzt; aufgeklappt steht alles ausgeschrieben.
 */
export function AntwortZeile({ beleg, schleuse, modell, details }: AntwortZeileProps) {
  const [offen, setOffen] = useState(false);
  const panelId = useId();
  const region = t(`modelle.region.${modell.region}`);
  return (
    <div className={styles.huelle}>
      <div className={styles.zeile}>
        {beleg && <BelegZeile beleg={beleg} />}
        <SchleuseHinweis
          schleuse={schleuse}
          offen={offen}
          onUmschalten={() => setOffen((o) => !o)}
          steuert={panelId}
        />
        <ModellHerkunft modell={modell} />
      </div>
      <div id={panelId} className={styles.panel} hidden={!offen}>
        <ul className={styles.voll}>
          {beleg && (
            <li>
              {belegText(beleg)} · <span className={styles.mono}>{beleg.kennung}</span>
            </li>
          )}
          <li>{schleuseText(schleuse)}</li>
          <li>
            {modell.name} · {region}
          </li>
        </ul>
        {details}
      </div>
    </div>
  );
}
