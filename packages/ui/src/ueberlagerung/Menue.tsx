/**
 * PaiBot – Aufklappmenü mit Tastatur-Bedienung.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

"use client";

import { Fragment, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { menueIndex } from "../basis/fokus";
import { Icon, type IconName } from "../basis/Icon";
import { IconButton } from "../basis/IconButton";
import { klassen } from "../basis/klassen";
import styles from "./Menue.module.css";

export interface MenueEintrag {
  id: string;
  text: string;
  icon?: IconName;
  /** Zweite, leise Zeile unter dem Text (z. B. ein Stand). */
  hinweis?: string;
  gefahr?: boolean;
  deaktiviert?: boolean;
  /** Trennlinie vor diesem Eintrag (z. B. vor „Abmelden“). */
  trennerDavor?: boolean;
  /** Kleine Überschrift über dem Eintrag (nach der Trennlinie). */
  gruppe?: string;
  /** Link nach außen: öffnet in einem neuen Tab (`rel="noopener noreferrer"`). */
  extern?: { href: string; neuerTab: string };
  onWaehlen?: () => void;
}

export interface MenueProps {
  /** Name des Knopfs, der das Menü öffnet. */
  label: string;
  eintraege: readonly MenueEintrag[];
  icon?: IconName;
  /** Ausrichtung des Menüs am Knopf. */
  ausrichtung?: "start" | "ende";
  /** Menü unter (Standard) oder über dem Knopf, z. B. unten in der Seitenleiste. */
  richtung?: "unten" | "oben";
  /** Zusatz unten im Menü, kein Eintrag (z. B. eine Fußzeile). */
  fuss?: ReactNode;
  /** Klasse für die Hülle (z. B. volle Breite). */
  className?: string;
  /** Eigener Auslöser statt des Symbol-Knopfs (bekommt die nötigen Attribute). */
  ausloeser?: (props: {
    id: string;
    "aria-haspopup": "menu";
    "aria-expanded": boolean;
    "aria-controls": string;
    onClick: () => void;
    onKeyDown: (e: React.KeyboardEvent) => void;
  }) => ReactNode;
}

/**
 * Aufklappmenü: Pfeiltasten wählen, Enter führt aus, Escape und Klick daneben schließen,
 * danach steht der Fokus wieder auf dem Knopf.
 */
export function Menue({
  label,
  eintraege,
  icon = "punkte",
  ausrichtung = "ende",
  richtung = "unten",
  fuss,
  className,
  ausloeser,
}: MenueProps) {
  const [offen, setOffen] = useState(false);
  const [aktiv, setAktiv] = useState(0);
  const huelle = useRef<HTMLDivElement>(null);
  const liste = useRef<HTMLDivElement>(null);
  const knopfId = useId();
  const listeId = useId();
  const nutzbar = eintraege.filter((e) => !e.deaktiviert);

  const schliessen = (fokusZurueck: boolean) => {
    setOffen(false);
    if (fokusZurueck) document.getElementById(knopfId)?.focus();
  };

  useEffect(() => {
    if (!offen) return;
    const ziel = liste.current?.querySelectorAll<HTMLElement>(
      "[role='menuitem']:not([aria-disabled='true'])",
    )[aktiv];
    ziel?.focus();
  }, [offen, aktiv]);

  useEffect(() => {
    if (!offen) return;
    const daneben = (e: PointerEvent) => {
      if (!huelle.current?.contains(e.target as Node)) setOffen(false);
    };
    document.addEventListener("pointerdown", daneben);
    return () => document.removeEventListener("pointerdown", daneben);
  }, [offen]);

  const oeffnen = (ab: number) => {
    setAktiv(ab);
    setOffen(true);
  };

  const ausloeserProps = {
    id: knopfId,
    "aria-haspopup": "menu" as const,
    "aria-expanded": offen,
    "aria-controls": listeId,
    onClick: () => (offen ? schliessen(false) : oeffnen(0)),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        oeffnen(0);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        oeffnen(nutzbar.length - 1);
      }
    },
  };

  return (
    <div ref={huelle} className={klassen(styles.huelle, className)}>
      {ausloeser ? (
        ausloeser(ausloeserProps)
      ) : (
        <IconButton icon={icon} label={label} {...ausloeserProps} />
      )}
      {offen && (
        <div
          ref={liste}
          id={listeId}
          role="menu"
          aria-labelledby={knopfId}
          className={klassen(
            styles.menue,
            ausrichtung === "start" ? styles.start : styles.ende,
            richtung === "oben" && styles.oben,
          )}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              schliessen(true);
              return;
            }
            if (e.key === "Tab") {
              setOffen(false);
              return;
            }
            const neu = menueIndex(e.key, nutzbar.length, aktiv);
            if (neu !== null) {
              e.preventDefault();
              setAktiv(neu);
            }
          }}
        >
          {eintraege.map((e) => {
            const inhalt = (
              <>
                {e.icon && <Icon name={e.icon} />}
                <span className={styles.texte}>
                  <span>{e.text}</span>
                  {e.hinweis && <span className={styles.hinweis}>{e.hinweis}</span>}
                </span>
              </>
            );
            const klasse = klassen(styles.eintrag, e.gefahr && styles.gefahr);
            return (
              <Fragment key={e.id}>
                {e.trennerDavor && <hr className={styles.trenner} />}
                {e.gruppe && (
                  <span className={styles.gruppe} aria-hidden="true">
                    {e.gruppe}
                  </span>
                )}
                {e.extern ? (
                  <a
                    role="menuitem"
                    tabIndex={-1}
                    href={e.extern.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={klasse}
                    onClick={() => {
                      setOffen(false);
                      e.onWaehlen?.();
                    }}
                  >
                    {inhalt}
                    <span className={styles.nurLesbar}> {e.extern.neuerTab}</span>
                  </a>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    aria-disabled={e.deaktiviert || undefined}
                    className={klasse}
                    onClick={() => {
                      if (e.deaktiviert) return;
                      schliessen(true);
                      e.onWaehlen?.();
                    }}
                  >
                    {inhalt}
                  </button>
                )}
              </Fragment>
            );
          })}
          {fuss && <div className={styles.fuss}>{fuss}</div>}
        </div>
      )}
    </div>
  );
}
