/**
 * PaiBot – Beleg-Zeichen: kleiner Knopf, der ein Fenster mit den Angaben des Belegs öffnet.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

"use client";

import { t } from "@paibot/shared/texte";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import styles from "./BelegZeichen.module.css";
import { Sym } from "./symbole";
import { reinerText } from "./text";
import type { BelegInfo } from "./typen";

export interface BelegZeichenProps {
  info: BelegInfo;
  /** Die Nummer neben dem Zeichen zeigen. */
  mitNr?: boolean;
}

/**
 * Beleg-Zeichen mit kleinem Fenster. Escape und ein Klick daneben schließen es, der Fokus
 * kehrt zum Zeichen zurück. Die Angaben des Belegs kommen vom Server; sie werden als Text
 * gezeigt.
 */
export function BelegZeichen({ info, mitNr = false }: BelegZeichenProps) {
  const [offen, setOffen] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 8, y: 8 });
  const knopf = useRef<HTMLButtonElement>(null);
  const fenster = useRef<HTMLDivElement>(null);
  const id = useId();

  useLayoutEffect(() => {
    if (!offen || !knopf.current) return;
    const r = knopf.current.getBoundingClientRect();
    const breite = Math.min(290, window.innerWidth - 16);
    const hoehe = fenster.current?.offsetHeight ?? 160;
    const x = Math.min(Math.max(8, r.left - 20), window.innerWidth - breite - 8);
    let y = r.bottom + 8;
    if (y + hoehe > window.innerHeight - 8) y = Math.max(8, r.top - hoehe - 8);
    setPos({ x, y });
  }, [offen]);

  useEffect(() => {
    if (!offen) return;
    const taste = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOffen(false);
        knopf.current?.focus();
      }
    };
    const klick = (e: PointerEvent) => {
      const ziel = e.target as Node;
      if (!fenster.current?.contains(ziel) && !knopf.current?.contains(ziel)) setOffen(false);
    };
    document.addEventListener("keydown", taste);
    document.addEventListener("pointerdown", klick);
    return () => {
      document.removeEventListener("keydown", taste);
      document.removeEventListener("pointerdown", klick);
    };
  }, [offen]);

  return (
    <>
      <button
        ref={knopf}
        type="button"
        className={styles.zeichen}
        aria-expanded={offen}
        aria-haspopup="dialog"
        aria-controls={offen ? id : undefined}
        aria-label={t("faden.beleg.zeichen", { nr: info.nr })}
        onClick={() => setOffen(!offen)}
      >
        <Sym name="beleg" groesse={13} />
        {mitNr && <span className={styles.nr}>{info.nr}</span>}
      </button>
      {offen && (
        <div
          ref={fenster}
          id={id}
          role="dialog"
          aria-label={t("faden.beleg.titel", { nr: info.nr })}
          className={styles.fenster}
          style={{ left: pos.x, top: pos.y }}
        >
          <h4>
            <Sym name="beleg" groesse={15} />
            {t("faden.beleg.titel", { nr: info.nr })}
          </h4>
          <dl>
            <dt>{t("faden.beleg.was")}</dt>
            <dd>{reinerText(info.was, 200)}</dd>
            <dt>{t("faden.beleg.weg")}</dt>
            <dd>{reinerText(info.weg, 200)}</dd>
            <dt>{t("faden.beleg.tor")}</dt>
            <dd>{reinerText(info.tor ?? t("faden.beleg.tor_standard"), 200)}</dd>
            {info.grenze && (
              <>
                <dt>{t("faden.beleg.grenzen")}</dt>
                <dd>{reinerText(info.grenze, 200)}</dd>
              </>
            )}
            <dt>{t("faden.beleg.zeit")}</dt>
            <dd>{reinerText(info.zeit, 40)}</dd>
          </dl>
          <div className={styles.fuss}>{t("faden.beleg.fuss")}</div>
        </div>
      )}
    </>
  );
}
