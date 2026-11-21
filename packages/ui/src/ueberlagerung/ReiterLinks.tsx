/**
 * PaiBot – Reiterzeile aus Links: jeder Reiter ist eine eigene Seite.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import type { ComponentType, ReactNode } from "react";
import { klassen } from "../basis/klassen";
import { ScrollBereich } from "../basis/ScrollBereich";
import styles from "./ReiterLinks.module.css";

export interface ReiterLink {
  id: string;
  text: string;
  href: string;
}

export interface ReiterLinksProps {
  /** Name der Navigation für Screenreader, z. B. „Bereiche der Einstellungen“. */
  label: string;
  reiter: readonly ReiterLink[];
  /** ID des Reiters der aktuellen Seite. */
  aktiv: string;
  className?: string;
  /** Link-Komponente, z. B. die des Frameworks; Standard `a`. */
  link?: ComponentType<{
    href: string;
    className?: string;
    children: ReactNode;
    "aria-current"?: "page";
  }>;
}

function StandardLink(props: {
  href: string;
  className?: string;
  children: ReactNode;
  "aria-current"?: "page";
}) {
  return <a {...props} />;
}

/**
 * Sieht aus wie die Reiter, führt aber zu Seiten: eine Navigation mit Links, die aktuelle Seite mit
 * `aria-current="page"`. Passt die Zeile nicht in die Breite, scrollt sie seitlich ohne Balken.
 */
export function ReiterLinks({
  label,
  reiter,
  aktiv,
  className,
  link: Link = StandardLink,
}: ReiterLinksProps) {
  return (
    <nav aria-label={label} className={klassen(styles.leiste, className)}>
      <ScrollBereich achse="x" className={styles.zeile}>
        <ul className={styles.liste}>
          {reiter.map((r) => (
            <li key={r.id}>
              <Link
                href={r.href}
                className={styles.reiter}
                {...(r.id === aktiv ? { "aria-current": "page" as const } : {})}
              >
                {r.text}
              </Link>
            </li>
          ))}
        </ul>
      </ScrollBereich>
    </nav>
  );
}
