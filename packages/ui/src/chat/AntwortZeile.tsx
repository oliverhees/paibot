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
import { schrittText } from "./schritte/text";

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
  /** Herkunft des Modells; ergibt „EU“, „außerhalb der EU“ oder „lokal“ (nur für Beispiele). */
  region?: "eu" | "non_eu" | "local";
  /** Belegbare Herkunft in Worten; geht vor `region`. Fehlt beides, steht nur der Name. */
  herkunft?: string;
  /**
   * Der Name ist frei vergebener Text (z. B. der Name einer Routing-Regel aus dem Konto). Er steht
   * dann als schlichter Text in Anführungszeichen und nie in der Gestalt einer Kennzeichnung.
   */
  nameFrei?: boolean;
  /**
   * Kennzeichnung von PaiBot (z. B. „EU laut Regel …“) als eigenes Element mit eigenem Rahmen. Sie
   * kommt nie aus dem Namen, sondern nur von hier.
   */
  kennzeichnung?: KennzeichnungAngabe;
}

export interface KennzeichnungAngabe {
  /** Kurze Marke, z. B. „EU laut Regel“. */
  marke: string;
  /** Ganzer Satz mit Herkunft und Datum; steht im Titel, für Bildschirmleser und aufgeklappt. */
  satz: string;
}

/** Ein Schritt der Antwort, wenn sie aus mehreren Aufrufen des Modells entstand. */
export interface HerkunftSchritt {
  modell: ModellAngabe;
  /** Unter-Anbieter, der den Schritt beantwortet hat (z. B. „tensorix“), wenn belegt. */
  unterAnbieter?: string;
  /** Modell, das der Anbieter gemeldet hat, wenn es vom Namen abweicht. */
  gemeldet?: string;
}

function nameText(modell: ModellAngabe): string {
  return modell.nameFrei === true ? `„${modell.name}“` : modell.name;
}

/** Eigenes Element für die Kennzeichnung von PaiBot, für Bildschirmleser getrennt benannt. */
export function Kennzeichnung({
  angabe,
  voll = false,
}: {
  angabe: KennzeichnungAngabe;
  voll?: boolean;
}) {
  return (
    <span
      className={styles.kennzeichnung}
      data-art={voll ? "kennzeichnung-voll" : "kennzeichnung"}
      role="note"
      aria-label={t("antwort.kennzeichnung", { text: angabe.satz })}
      title={angabe.satz}
    >
      <Icon name="check" />
      <span>{voll ? angabe.satz : angabe.marke}</span>
    </span>
  );
}

function herkunftText(modell: ModellAngabe): string | undefined {
  if (modell.herkunft !== undefined) return modell.herkunft;
  return modell.region === undefined ? undefined : t(`modelle.region.${modell.region}`);
}

/** „tensorix (glm-5.1)“; weicht das gemeldete Modell ab, steht beides da. Fremde Namen bereinigt. */
function schrittHerkunftText(s: HerkunftSchritt): string {
  const name = schrittText(s.modell.name, "modell");
  const modell = s.modell.nameFrei === true ? `„${name}“` : name;
  const gemeldet = s.gemeldet === undefined ? "" : schrittText(s.gemeldet, "modell");
  const innen =
    gemeldet !== "" && gemeldet !== name
      ? `${modell}, ${t("schritte.antwort.gemeldet", { modell: gemeldet })}`
      : modell;
  const anbieter = s.unterAnbieter === undefined ? "" : schrittText(s.unterAnbieter, "modell");
  return anbieter === "" ? innen : `${anbieter} (${innen})`;
}

function werkzeugeText(n: number): string {
  return n === 1 ? t("schritte.antwort.werkzeug") : t("schritte.antwort.werkzeuge", { n });
}

/**
 * Teil „Modell“ für eine Antwort aus mehreren Schritten: Anbieter und Modell je Schritt, dahinter
 * die Zahl der Werkzeug-Aufrufe. Schmal bleibt die Kurzform.
 */
export function SchritteHerkunft({
  schritte,
  werkzeuge = 0,
}: {
  schritte: readonly HerkunftSchritt[];
  werkzeuge?: number;
}) {
  const liste = schritte.map(schrittHerkunftText).join(", ");
  const dazu = werkzeuge > 0 ? ` · ${werkzeugeText(werkzeuge)}` : "";
  return (
    <span className={klassen(styles.teil, styles.modell)} title={`${liste}${dazu}`}>
      <span className={klassen(styles.lang, styles.liste)}>
        {t("schritte.antwort.von", { liste })}
        {dazu}
      </span>
      <span className={styles.kurz}>
        {schritte.length === 1
          ? t("schritte.antwort.von_kurz_eins")
          : t("schritte.antwort.von_kurz", { n: schritte.length })}
      </span>
    </span>
  );
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
    (s.modus === "schleuse" ? t("schleuse.hinweis.schleuse") : t("schleuse.hinweis.direkt_neutral"))
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

/**
 * Teil „Modell“: Name (bei frei vergebenem Namen in Anführungszeichen), die Kennzeichnung von
 * PaiBot als eigenes Element und die Herkunft; schmal nur Kennzeichnung und Herkunft.
 */
export function ModellHerkunft({ modell }: { modell: ModellAngabe }) {
  const region = herkunftText(modell);
  const name = nameText(modell);
  const kennzeichnung = modell.kennzeichnung;
  if (region === undefined && kennzeichnung === undefined) {
    return (
      <span className={klassen(styles.teil, styles.modell)} title={name}>
        <span>{name}</span>
      </span>
    );
  }
  return (
    <span
      className={klassen(styles.teil, styles.modell)}
      title={[name, region].filter((x) => x !== undefined).join(" · ")}
    >
      <span className={styles.lang}>{name}</span>
      {kennzeichnung !== undefined && <Kennzeichnung angabe={kennzeichnung} />}
      {region !== undefined && (
        <>
          <span className={styles.lang} aria-hidden="true">
            ·
          </span>
          <span>{region}</span>
        </>
      )}
    </span>
  );
}

export interface AntwortZeileProps {
  beleg?: BelegAngabe;
  schleuse: SchleuseAngabe;
  modell: ModellAngabe;
  /** Inhalt zum Aufklappen, z. B. „Das hat das Modell gesehen“. */
  details?: ReactNode;
  /**
   * Antwort aus mehreren Schritten: Modell und Unter-Anbieter je Schritt. Ersetzt in der Zeile den
   * Teil „Modell“; die Herkunft steht nur je Schritt, nie als Aussage über die ganze Antwort.
   */
  schritte?: readonly HerkunftSchritt[];
  /** Zahl der Werkzeug-Aufrufe dieser Antwort; ab 1 steht sie als Teil in der Zeile. */
  werkzeuge?: number;
}

/**
 * Ruhige Zeile unter jeder Antwort: Beleg · Datenschleuse · Modell mit Herkunft.
 * Schmal werden die Teile gekürzt; aufgeklappt steht alles ausgeschrieben.
 */
export function AntwortZeile({
  beleg,
  schleuse,
  modell,
  details,
  schritte,
  werkzeuge,
}: AntwortZeileProps) {
  const [offen, setOffen] = useState(false);
  const panelId = useId();
  const region = herkunftText(modell);
  const mehrere = schritte !== undefined && schritte.length > 0;
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
        {mehrere ? (
          <SchritteHerkunft schritte={schritte} werkzeuge={werkzeuge ?? 0} />
        ) : (
          <>
            <ModellHerkunft modell={modell} />
            {werkzeuge !== undefined && werkzeuge > 0 && (
              <span className={klassen(styles.teil, styles.werkzeuge)}>
                <Icon name="zahnrad" />
                {werkzeugeText(werkzeuge)}
              </span>
            )}
          </>
        )}
      </div>
      <div id={panelId} className={styles.panel} hidden={!offen}>
        <ul className={styles.voll}>
          {beleg && (
            <li>
              {belegText(beleg)} · <span className={styles.mono}>{beleg.kennung}</span>
            </li>
          )}
          <li>{schleuseText(schleuse)}</li>
          {mehrere ? (
            schritte.map((schritt, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: feste Reihenfolge der Schritte
              <li key={i}>
                {t("schritte.antwort.schritt", { n: i + 1 })}: {schrittHerkunftText(schritt)}
                {herkunftText(schritt.modell) !== undefined && ` · ${herkunftText(schritt.modell)}`}
                {schritt.modell.kennzeichnung !== undefined && (
                  <>
                    {" "}
                    <Kennzeichnung angabe={schritt.modell.kennzeichnung} voll />
                  </>
                )}
              </li>
            ))
          ) : (
            <>
              <li>{region === undefined ? nameText(modell) : `${nameText(modell)} · ${region}`}</li>
              {modell.kennzeichnung !== undefined && (
                <li>
                  <Kennzeichnung angabe={modell.kennzeichnung} voll />
                </li>
              )}
            </>
          )}
          {werkzeuge !== undefined && werkzeuge > 0 && <li>{werkzeugeText(werkzeuge)}</li>}
        </ul>
        {details}
      </div>
    </div>
  );
}
