/**
 * PaiBot – Urteil einer Prüfung von Belegen: läuft (mit Fortschritt), gültig, Vertrauen gebrochen
 * oder ungültig; dazu in Worten, was geprüft wurde.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { Icon } from "../basis/Icon";
import { Ladekreis } from "../basis/Ladekreis";
import styles from "./PruefUrteil.module.css";

/** `gebrochen`: in sich gültig, aber die Vertrauenskette ist unterbrochen (eigene Warnstufe). */
export type PruefUrteilZustand = "laeuft" | "gueltig" | "gebrochen" | "ungueltig";

/** Ein Punkt der Prüfung, immer mit Wort; `hinweis` ist weder bestanden noch Fehler. */
export interface PruefUrteilPunkt {
  art: "ok" | "fehler" | "hinweis";
  text: string;
}

export interface PruefUrteilProps {
  zustand: PruefUrteilZustand;
  titel: string;
  punkte?: readonly PruefUrteilPunkt[];
  /** Fortschritt beim Laden und Prüfen; ohne `gesamt` ohne Balken. */
  fortschritt?: { wert: number; gesamt?: number; text: string };
  /** Kleine Marke, woher das Ergebnis stammt, z. B. „vom Server geprüft“. */
  quelle?: string;
}

const ICON = { gueltig: "check", gebrochen: "warnung", ungueltig: "warnung" } as const;
const PUNKT_ICON = { ok: "check", fehler: "x", hinweis: "info" } as const;

/** Ergebnis einer Prüfung. Wird als Status angesagt (`role="status"`). */
export function PruefUrteil({ zustand, titel, punkte, fortschritt, quelle }: PruefUrteilProps) {
  const anteil =
    fortschritt?.gesamt !== undefined && fortschritt.gesamt > 0
      ? Math.min(100, Math.round((fortschritt.wert / fortschritt.gesamt) * 100))
      : undefined;
  return (
    <div className={styles.urteil} data-zustand={zustand} role="status" aria-live="polite">
      <span className={styles.zeile1}>
        {zustand === "laeuft" ? <Ladekreis /> : <Icon name={ICON[zustand]} groesse={15} />}
        <span>{titel}</span>
        {quelle && <span className={styles.quelle}>{quelle}</span>}
      </span>
      {fortschritt && (
        <div className={styles.fortschritt}>
          {anteil !== undefined && (
            <div
              className={styles.balken}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={fortschritt.gesamt}
              aria-valuenow={fortschritt.wert}
              aria-label={fortschritt.text}
            >
              <span className={styles.fuellung} style={{ width: `${anteil}%` }} />
            </div>
          )}
          <span className={styles.fortschrittText}>{fortschritt.text}</span>
        </div>
      )}
      {punkte && punkte.length > 0 && (
        <ul className={styles.punkte}>
          {punkte.map((p, i) => (
            // Gleiche Texte können zweimal vorkommen; die Reihenfolge ist fest.
            // biome-ignore lint/suspicious/noArrayIndexKey: feste Reihenfolge, keine Umsortierung
            <li key={i} data-art={p.art}>
              <Icon name={PUNKT_ICON[p.art]} groesse={13} />
              <span>{p.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
