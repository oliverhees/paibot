/**
 * PaiBot – kleine Symbole der Fäden (eigene Striche, passend zu den Symbolen der Bausteine).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import type { ReactNode } from "react";

const PFADE = {
  beleg: (
    <>
      <path d="M7 3h10v18l-2.5-1.5L12 21l-2.5-1.5L7 21z" />
      <path d="M10 8h4M10 12h4" />
    </>
  ),
  rechts: <path d="m9 6 6 6-6 6" />,
  unten: <path d="m6 9 6 6 6-6" />,
  oben: <path d="m6 15 6-6 6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  pause: <path d="M9 6v12M15 6v12" />,
  haken: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  senden: <path d="M12 19V6M6 11l6-6 6 6" />,
  post: (
    <>
      <path d="M4 13h4l1.5 3h5L16 13h4" />
      <path d="M5 13 7 5h10l2 8v6H5z" />
    </>
  ),
  faden: <path d="M5 6h14v9H10l-4 3.5V15H5z" />,
  at: (
    <>
      <circle cx="12" cy="12" r="3.6" />
      <path d="M15.6 12v1.6a2.4 2.4 0 0 0 4.8 0V12a8.4 8.4 0 1 0-3.3 6.7" />
    </>
  ),
  uhr: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4.5l3 2" />
    </>
  ),
  ziel: <path d="M6 21V4M6 4h11l-2.5 4L17 12H6" />,
  stab: <path d="m5 19 9.5-9.5M14 5l5 5M12.5 6.5l5 5" />,
  schild: (
    <>
      <path d="M12 3 5 6v5c0 4.5 3 8.2 7 10 4-1.8 7-5.5 7-10V6z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  auge: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  stift: <path d="M5 19l1-4L16 5l3 3L9 18z" />,
  regel: <path d="M4 6h3M4 12h3M4 18h3M10 6h10M10 12h10M10 18h10" />,
  doku: (
    <>
      <path d="M7 3h7l4 4v14H7z" />
      <path d="M14 3v4h4M10 12h5M10 16h5" />
    </>
  ),
  zurueck: <path d="M9 7 4 12l5 5M4 12h11a5 5 0 0 1 0 10" />,
  menue: <path d="M4 7h16M4 12h16M4 17h10" />,
  liste: <path d="M4 6h3M4 12h3M4 18h3M10 6h10M10 12h10M10 18h10" />,
} satisfies Record<string, ReactNode>;

export type SymbolName = keyof typeof PFADE;

/** Dekoratives Symbol; die Bedeutung trägt immer ein Text daneben oder ein `aria-label` am Knopf. */
export function Sym({
  name,
  groesse = 16,
  className,
}: {
  name: SymbolName;
  groesse?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width={groesse}
      height={groesse}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ flex: "none" }}
    >
      {PFADE[name]}
    </svg>
  );
}
