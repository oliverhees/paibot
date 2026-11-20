/**
 * PaiBot – Zustände leer, lädt und Fehler mit Ausweg.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { ErrorCode } from "@paibot/shared/fehler";
import { errorText, errorWayOut, t } from "@paibot/shared/texte";
import type { ReactNode } from "react";
import { Icon } from "../basis/Icon";
import { Ladekreis } from "../basis/Ladekreis";
import styles from "./Zustaende.module.css";

export interface EmptyStateProps {
  titel: string;
  text?: ReactNode;
  /** Bild über dem Titel, z. B. ein Avatar. */
  bild?: ReactNode;
  /** Knöpfe oder Beispiele zum Loslegen. */
  aktion?: ReactNode;
}

/** Leerer Zustand: sagt, was hier hingehört und wie man anfängt. */
export function EmptyState({ titel, text, bild, aktion }: EmptyStateProps) {
  return (
    <section className={styles.leer}>
      {bild && <div className={styles.bild}>{bild}</div>}
      <h2 className={styles.titel}>{titel}</h2>
      {text && <div className={styles.text}>{text}</div>}
      {aktion && <div className={styles.aktion}>{aktion}</div>}
    </section>
  );
}

export interface LoadingStateProps {
  /** Standard: „Lädt …“ */
  text?: string;
}

/** Lade-Zustand mit Text; wird höflich vorgelesen. */
export function LoadingState({ text = t("allgemein.laedt") }: LoadingStateProps) {
  return (
    <div className={styles.laden} role="status" aria-live="polite">
      <Ladekreis groesse={16} />
      <span>{text}</span>
    </div>
  );
}

export interface ErrorStateProps {
  /** Fehlercode aus den Verträgen; liefert Standardtext und Ausweg. */
  code?: ErrorCode;
  /** Eigener Titel; ersetzt den Standardtext des Codes. */
  titel?: string;
  /** Ursache in einem Satz. */
  ursache?: ReactNode;
  /** Was jetzt hilft. Ohne Code Pflicht, sonst der Standard-Ausweg des Codes. */
  ausweg?: ReactNode;
  /** Knopf oder Link für den Ausweg, z. B. „Modell wählen“. */
  aktion?: ReactNode;
}

/** Fehler-Zustand: was passiert ist, warum, und immer ein Ausweg. */
export function ErrorState({ code, titel, ursache, ausweg, aktion }: ErrorStateProps) {
  const ueberschrift = titel ?? (code ? errorText(code) : t("fehler.intern"));
  const weg = ausweg ?? (code ? errorWayOut(code) : undefined) ?? t("fehler.intern.ausweg");
  return (
    <section className={styles.fehler} role="alert">
      <span className={styles.fehlerIcon}>
        <Icon name="warnung" groesse={18} />
      </span>
      <div className={styles.fehlerText}>
        <h2 className={styles.fehlerTitel}>{ueberschrift}</h2>
        {ursache && <p className={styles.ursache}>{ursache}</p>}
        <p className={styles.ausweg}>{weg}</p>
        {aktion && <div className={styles.aktion}>{aktion}</div>}
      </div>
    </section>
  );
}
