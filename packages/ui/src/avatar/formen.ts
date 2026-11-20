/**
 * PaiBot – Umrisse der Avatar-Formen und feste Paare aus Form und Farbe.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { AvatarShape, BotColor } from "@paibot/shared/objekte";

const kreis = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;

/** Umrisse der Avatar-Formen auf dem 40er-Raster. */
export const FORMEN = {
  blatt: { d: "M4 21A17 17 0 0 1 21 4H32.5Q36 4 36 7.5V19A17 17 0 0 1 19 36H7.5Q4 36 4 32.5Z" },
  bogen: { d: "M5 32.5V19A15 15 0 0 1 35 19V32.5Q35 36 31.5 36H8.5Q5 36 5 32.5Z" },
  kiesel: { d: "M20 4C31 4 36 9 36 20S31 36 20 36 4 31 4 20 9 4 20 4Z" },
  raute: {
    d: "M20 3.5Q22 3.5 23.6 5.1L34.9 16.4Q36.5 18 36.5 20T34.9 23.6L23.6 34.9Q22 36.5 20 36.5T16.4 34.9L5.1 23.6Q3.5 22 3.5 20T5.1 16.4L16.4 5.1Q18 3.5 20 3.5Z",
  },
  dee: { d: "M9.5 4H19A16 16 0 0 1 19 36H9.5Q6 36 6 32.5V7.5Q6 4 9.5 4Z" },
  wabe: { d: "M20 6L32.1 13V27L20 34L7.9 27V13Z", rand: 5 },
  bluete: {
    d: `${kreis(20, 12.6, 9)}${kreis(27.4, 20, 9)}${kreis(20, 27.4, 9)}${kreis(12.6, 20, 9)}`,
  },
} as const satisfies Record<AvatarShape, { d: string; rand?: number }>;

/** Feste Paare: jede Bot-Farbe hat genau eine Form. */
export const FORM_ZU_FARBE: Readonly<Record<BotColor, AvatarShape>> = {
  limette: "blatt",
  orange: "blatt",
  blau: "bogen",
  gruen: "kiesel",
  violett: "raute",
  pink: "bluete",
  tuerkis: "dee",
  gelb: "wabe",
};

/** Form zu einer Bot-Farbe. */
export function formFuer(farbe: BotColor): AvatarShape {
  return FORM_ZU_FARBE[farbe];
}

/** Gesichtsfarbe: dunkel auf Limette, sonst weiß. */
export function gesichtFuer(farbe: BotColor): string {
  return farbe === "limette" ? "var(--bot-gesicht-dunkel)" : "var(--bot-gesicht)";
}

/** Höhe des offenen Mundes je Form. */
export function mundOffenY(form: AvatarShape): number {
  if (form === "bogen") return 27;
  if (form === "bluete") return 24.6;
  return 25.6;
}
