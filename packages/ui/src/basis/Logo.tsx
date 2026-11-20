/**
 * PaiBot – Das PaiBot-Zeichen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { FORMEN } from "../avatar/formen";

export interface LogoProps {
  /** Kantenlänge in Pixeln (Standard 40). */
  groesse?: number;
  /** Zugänglicher Name; ohne ihn gilt das Logo als Schmuck. */
  titel?: string;
}

/** Das PaiBot-Zeichen: Blatt-Form in der Akzentfarbe mit Gesicht. */
export function Logo({ groesse = 40, titel }: LogoProps) {
  return (
    <svg
      width={groesse}
      height={groesse}
      viewBox="0 0 40 40"
      role={titel ? "img" : undefined}
      aria-label={titel}
      aria-hidden={titel ? undefined : true}
    >
      {titel && <title>{titel}</title>}
      <path d={FORMEN.blatt.d} fill="var(--accent)" />
      <circle cx="15.5" cy="18" r="2.2" fill="var(--on-accent)" />
      <circle cx="25" cy="18" r="2.2" fill="var(--on-accent)" />
      <path
        d="M15 24.5q5.2 4 10.4 0"
        fill="none"
        stroke="var(--on-accent)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
