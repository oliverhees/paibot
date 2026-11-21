/**
 * PaiBot – Sitz des Avatars über dem Eingabefeld mit den Anfängen der Fassung „stille“.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import { t } from "@paibot/shared/texte";
import { useEffect, useId, useRef, useState } from "react";
import { anfaengeStille } from "./anfaenge";
import styles from "./Startbereich.module.css";
import { AvatarFeld } from "./teile";
import type { StartDaten } from "./typen";

export interface StartStilleSitzProps extends Pick<StartDaten, "avatar" | "notAus" | "onAnfang"> {
  /** Das Eingabefeld (Textfeld) des Chats; der Sitz hört auf seinen Fokus und auf Esc. */
  eingabe: HTMLElement | null;
  /** Ist das Eingabefeld leer? Mit Text sind die Anfänge nicht mehr nötig. */
  leer: boolean;
}

/**
 * Der Avatar „sitzt“ auf dem Eingabefeld und sagt in einer kleinen Sprechblase, dass es Anfänge
 * gibt. Erst wenn das Feld den Fokus hat (und leer ist), erscheinen die Anfänge; Tippen oder Esc
 * schließen sie. Gehört in den Bereich direkt vor dem Eingabefeld, damit Umschalt+Tab vom Feld aus
 * die Anfänge erreicht.
 */
export function StartStilleSitz({ avatar, notAus, onAnfang, eingabe, leer }: StartStilleSitzProps) {
  const id = useId();
  const huelle = useRef<HTMLDivElement>(null);
  const [drin, setDrin] = useState(false);
  const [zu, setZu] = useState(false);

  // Nach einem Wechsel zwischen leer und gefüllt (oder beim Verlassen) gilt wieder „offen, wenn Fokus“.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `leer` und `drin` sind die Auslöser
  useEffect(() => {
    setZu(false);
  }, [leer, drin]);

  const offen = drin && leer && !zu && notAus !== true;
  const offenRef = useRef(offen);
  offenRef.current = offen;

  useEffect(() => {
    const feld = eingabe;
    const innen = huelle.current;
    if (!feld || !innen) return;
    const imBereich = (ziel: EventTarget | null) =>
      ziel instanceof Node && (feld.contains(ziel) || innen.contains(ziel));
    const rein = () => setDrin(true);
    const raus = (e: FocusEvent) => {
      if (!imBereich(e.relatedTarget)) setDrin(false);
    };
    const taste = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !offenRef.current) return;
      setZu(true);
      feld.focus();
    };
    if (feld.ownerDocument.activeElement === feld) setDrin(true);
    feld.addEventListener("focusin", rein);
    feld.addEventListener("focusout", raus);
    feld.addEventListener("keydown", taste);
    innen.addEventListener("focusin", rein);
    innen.addEventListener("focusout", raus);
    innen.addEventListener("keydown", taste);
    return () => {
      feld.removeEventListener("focusin", rein);
      feld.removeEventListener("focusout", raus);
      feld.removeEventListener("keydown", taste);
      innen.removeEventListener("focusin", rein);
      innen.removeEventListener("focusout", raus);
      innen.removeEventListener("keydown", taste);
    };
  }, [eingabe]);

  if (notAus === true) return null;
  return (
    <div className={styles.sitz} ref={huelle} data-offen={offen ? "" : undefined}>
      <AvatarFeld groesse="klein" className={styles.sitzAvatar}>
        {avatar}
      </AvatarFeld>
      <div className={styles.sprech}>
        <p className={styles.tipp} hidden={offen}>
          {t("startbereich.c.sprechblase")}
        </p>
        <section className={styles.vorschlaege} hidden={!offen} aria-labelledby={id}>
          <h2 id={id} className={styles.vorschlaegeTitel}>
            {t("startbereich.c.anfaenge")}
          </h2>
          <ul className={styles.vorschlaegeListe}>
            {anfaengeStille().map((anfang) => (
              <li key={anfang.id}>
                <button
                  type="button"
                  className={styles.frageRund}
                  onClick={() => {
                    setZu(true);
                    onAnfang(anfang.text);
                  }}
                >
                  <b>{anfang.gruppeTitel}</b>
                  {anfang.label}
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
