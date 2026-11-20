/**
 * PaiBot – Modaler Dialog oder Blatt von unten.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

"use client";

import { type ReactNode, useId, useRef } from "react";
import { IconButton } from "../basis/IconButton";
import { klassen } from "../basis/klassen";
import { ScrollBereich } from "../basis/ScrollBereich";
import { useFokusFalle } from "../basis/useFokusFalle";
import styles from "./Dialog.module.css";

export interface DialogProps {
  offen: boolean;
  onSchliessen: () => void;
  titel: string;
  /** Name des Schließen-Knopfs, z. B. „Schließen“. */
  schliessenLabel: string;
  children: ReactNode;
  /** Knöpfe unten rechts. */
  aktionen?: ReactNode;
  /** dialog: mittig; blatt: von unten (am Handy). */
  art?: "dialog" | "blatt";
  /** Rolle `alertdialog` für Rückfragen wie „wirklich löschen?“. */
  rueckfrage?: boolean;
}

/**
 * Modaler Dialog oder Blatt von unten: Fokus bleibt darin, Escape und Klick auf den
 * Schleier schließen, danach kehrt der Fokus zum auslösenden Element zurück.
 */
export function Dialog({
  offen,
  onSchliessen,
  titel,
  schliessenLabel,
  children,
  aktionen,
  art = "dialog",
  rueckfrage = false,
}: DialogProps) {
  const fenster = useRef<HTMLDivElement>(null);
  const titelId = useId();
  useFokusFalle(fenster, offen, { onEscape: onSchliessen });
  if (!offen) return null;
  return (
    <div className={styles.ebene}>
      <div className={styles.schleier} onClick={onSchliessen} aria-hidden="true" />
      <div
        ref={fenster}
        {...{
          role: rueckfrage ? "alertdialog" : "dialog",
          "aria-modal": true,
          "aria-labelledby": titelId,
        }}
        className={klassen(styles.fenster, art === "blatt" ? styles.blatt : styles.dialog)}
      >
        {art === "blatt" && <span className={styles.griff} aria-hidden="true" />}
        <div className={styles.kopf}>
          <h2 id={titelId} className={styles.titel}>
            {titel}
          </h2>
          <IconButton icon="x" label={schliessenLabel} onClick={onSchliessen} />
        </div>
        <ScrollBereich className={styles.inhalt}>{children}</ScrollBereich>
        {aktionen && <div className={styles.aktionen}>{aktionen}</div>}
      </div>
    </div>
  );
}
