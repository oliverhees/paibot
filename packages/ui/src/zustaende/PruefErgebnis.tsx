/**
 * PaiBot – Ergebnis einer Beleg-Prüfung.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { t } from "@paibot/shared/texte";
import { Icon } from "../basis/Icon";
import { Ladekreis } from "../basis/Ladekreis";
import styles from "./PruefErgebnis.module.css";

export interface PruefPunkt {
  ok: boolean;
  text: string;
}

export type PruefErgebnisProps =
  | { zustand: "laeuft"; titel?: string; punkte?: readonly PruefPunkt[] }
  | { zustand: "gueltig"; titel?: string; punkte?: readonly PruefPunkt[] }
  | { zustand: "ungueltig"; seq?: number; titel?: string; punkte?: readonly PruefPunkt[] };

function standardTitel(p: PruefErgebnisProps): string {
  if (p.zustand === "laeuft") return t("pruefung.laeuft");
  if (p.zustand === "gueltig") return t("pruefung.gueltig");
  return p.seq === undefined ? t("pruefung.kette.fehler") : t("pruefung.ungueltig", { seq: p.seq });
}

/** Ergebnis einer Beleg-Prüfung: läuft, gültig oder ungültig mit Stelle; jeder Punkt mit Wort. */
export function PruefErgebnis(props: PruefErgebnisProps) {
  const titel = props.titel ?? standardTitel(props);
  return (
    <div className={styles.ergebnis} data-zustand={props.zustand} role="status" aria-live="polite">
      <span className={styles.zeile1}>
        {props.zustand === "laeuft" ? (
          <Ladekreis />
        ) : (
          <Icon name={props.zustand === "gueltig" ? "check" : "warnung"} groesse={15} />
        )}
        {titel}
      </span>
      {props.punkte && props.punkte.length > 0 && (
        <ul className={styles.punkte}>
          {props.punkte.map((p) => (
            <li key={p.text} data-ok={p.ok}>
              <Icon name={p.ok ? "check" : "x"} groesse={13} />
              <span>{p.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
