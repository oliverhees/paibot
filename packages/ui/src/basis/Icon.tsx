/**
 * PaiBot – Linien-Symbole der Oberfläche.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import styles from "./Icon.module.css";

/** Linien-Symbole auf einem 24er-Raster, gezeichnet mit `currentColor`. */
const PFADE = {
  check: <path d="M5 12.5l4.2 4.2L19 7" />,
  abmelden: (
    <>
      <path d="M14 4.5H6.5A1.5 1.5 0 005 6v12a1.5 1.5 0 001.5 1.5H14" />
      <path d="M10.5 12H20M16.5 8.5L20 12l-3.5 3.5" />
    </>
  ),
  schleuse: (
    <>
      <path d="M3 12h5M14 12h7" />
      <path d="M8 5v14M14 5v14" />
      <path d="M18.5 9.2L21 12l-2.5 2.8" />
    </>
  ),
  beleg: (
    <>
      <path d="M6 3h12v18l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4L6 21z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </>
  ),
  chat: (
    <path d="M5 5h14a1.5 1.5 0 011.5 1.5v9A1.5 1.5 0 0119 17h-8l-4.5 3.5V17H5a1.5 1.5 0 01-1.5-1.5v-9A1.5 1.5 0 015 5z" />
  ),
  regeln: (
    <>
      <path d="M11 6.5h9M11 12h9M11 17.5h9" />
      <path d="M3.5 6.5l1.6 1.6L8 5.2M3.5 12l1.6 1.6L8 10.7" />
      <path d="M4 17.5h3.5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5M12 7.6v.2" />
    </>
  ),
  menue: <path d="M4 7h16M4 12h16M4 17h10" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  hoch: <path d="M12 19V5.5M6 11l6-6 6 6" />,
  stopp: <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" stroke="none" />,
  plus: <path d="M12 5v14M5 12h14" />,
  runter: <path d="M6 9.5l6 6 6-6" />,
  kopieren: (
    <>
      <rect x="8.5" y="8.5" width="11" height="11" rx="2.5" />
      <path d="M15.5 8.5V6.5a2 2 0 00-2-2h-7a2 2 0 00-2 2v7a2 2 0 002 2h2" />
    </>
  ),
  extern: (
    <>
      <path d="M14 4.5h5.5V10M19.5 4.5L11 13" />
      <path d="M17 14v4a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 015 18V8.5A1.5 1.5 0 016.5 7H10" />
    </>
  ),
  server: (
    <>
      <rect x="4" y="4.5" width="16" height="6" rx="2" />
      <rect x="4" y="13.5" width="16" height="6" rx="2" />
      <path d="M8 7.5h.1M8 16.5h.1" />
    </>
  ),
  zahnrad: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4L18 18M6 18l1.6-1.6M16.4 7.6L18 6" />
    </>
  ),
  panel: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2.5" />
      <path d="M14.5 5v14" />
    </>
  ),
  punkte: (
    <>
      <circle cx="5.5" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="18.5" cy="12" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  warnung: (
    <>
      <path d="M12 4l9 15.5H3z" />
      <path d="M12 10v4.5M12 17v.2" />
    </>
  ),
  neuLaden: (
    <>
      <path d="M19.5 12a7.5 7.5 0 11-2.2-5.3" />
      <path d="M19.5 4.5v4h-4" />
    </>
  ),
  stift: <path d="M5 19l1-4.5L15.5 5a2 2 0 012.8 0l.7.7a2 2 0 010 2.8L9.5 18 5 19z" />,
  papierkorb: <path d="M5 7h14M10 7V5h4v2M7 7l1 12.5h8L17 7" />,
  suche: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M16 16l4 4" />
    </>
  ),
  links: <path d="M15 6l-6 6 6 6" />,
  rechts: <path d="M9 6l6 6-6 6" />,
  sichern: (
    <>
      <path d="M12 4.5v10M7.5 10.5l4.5 4.5 4.5-4.5" />
      <path d="M5 19.5h14" />
    </>
  ),
  anhang: (
    <path d="M16.5 11.5l-5.6 5.6a3.2 3.2 0 01-4.5-4.5l6.4-6.4a2.1 2.1 0 013 3l-6.2 6.2a1 1 0 01-1.4-1.4l5.5-5.5" />
  ),
  mikrofon: (
    <>
      <rect x="9" y="3.5" width="6" height="11" rx="3" />
      <path d="M6 11.5a6 6 0 0012 0M12 17.5v3" />
    </>
  ),
} as const;

export type IconName = keyof typeof PFADE;

export const ICON_NAMEN = Object.keys(PFADE) as IconName[];

export interface IconProps {
  name: IconName;
  /** Kantenlänge in Pixeln (Standard 16). */
  groesse?: number;
  className?: string;
}

/** Dekoratives Symbol; die Bedeutung trägt immer ein Text daneben oder ein `aria-label`. */
export function Icon({ name, groesse = 16, className }: IconProps) {
  return (
    <svg
      className={className ? `${styles.icon} ${className}` : styles.icon}
      viewBox="0 0 24 24"
      width={groesse}
      height={groesse}
      aria-hidden="true"
      focusable="false"
    >
      {PFADE[name]}
    </svg>
  );
}
