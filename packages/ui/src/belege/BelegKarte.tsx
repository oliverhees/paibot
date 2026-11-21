/**
 * PaiBot – Beleg als Karte im Stil eines Kassenbons: gestanzter Rand, gestrichelte Trennlinien,
 * Zeilen mit Bezeichnung und Inhalt, darunter Prüf-Ergebnis und Knöpfe.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import type { ReactNode } from "react";
import { Icon } from "../basis/Icon";
import styles from "./BelegKarte.module.css";

/** Eine Zeile der Karte, z. B. „Aktion“ → „Nachricht gesendet“. */
export interface BelegKarteZeile {
  titel: string;
  inhalt: ReactNode;
}

/** Zustand des Siegels links oben: geprüft, offen, Warnung oder Fehler. */
export type BelegSiegel = "ok" | "offen" | "warn" | "fehler";

export interface BelegKarteProps {
  /** Kleine Zeile über dem Titel, z. B. „Beleg B-0142“. */
  etikett: string;
  titel: string;
  /** Name der Karte für Screenreader. */
  label: string;
  siegel?: BelegSiegel;
  /** Marke rechts oben (z. B. `StatusChip` „nicht geprüft“). */
  status?: ReactNode;
  zeilen: readonly BelegKarteZeile[];
  /** Unter den Zeilen, z. B. das Prüf-Ergebnis. */
  children?: ReactNode;
  /** Knöpfe am Fuß der Karte. */
  aktionen?: ReactNode;
}

const SIEGEL_ICON = { ok: "check", offen: "beleg", warn: "warnung", fehler: "warnung" } as const;

/** Beleg als Kassenbon. Reiner Baustein ohne eigene Daten oder Aufrufe. */
export function BelegKarte({
  etikett,
  titel,
  label,
  siegel = "offen",
  status,
  zeilen,
  children,
  aktionen,
}: BelegKarteProps) {
  return (
    <article className={styles.karte} aria-label={label}>
      <div className={styles.kopf}>
        <span className={styles.siegel} data-siegel={siegel} aria-hidden="true">
          <Icon name={SIEGEL_ICON[siegel]} groesse={16} />
        </span>
        <div className={styles.titel}>
          <span className={styles.etikett}>{etikett}</span>
          <strong>{titel}</strong>
        </div>
        {status}
      </div>
      <dl className={styles.zeilen}>
        {zeilen.map((zeile) => (
          <div key={zeile.titel} className={styles.zeile}>
            <dt>{zeile.titel}</dt>
            <dd>{zeile.inhalt}</dd>
          </div>
        ))}
      </dl>
      {children}
      {aktionen && <div className={styles.aktionen}>{aktionen}</div>}
    </article>
  );
}
