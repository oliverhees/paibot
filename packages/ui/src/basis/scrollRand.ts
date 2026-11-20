/**
 * PaiBot – Berechnet, wo beim Scrollen ein weicher Rand erscheint.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

/** Wo weicher Rand gezeigt wird: dort, wo noch Inhalt weiterläuft. */
export type ScrollRand = "keiner" | "start" | "ende" | "beide";

export interface ScrollMasse {
  /** Aktuelle Position (scrollTop bzw. scrollLeft). */
  position: number;
  /** Gesamte Länge des Inhalts (scrollHeight bzw. scrollWidth). */
  inhalt: number;
  /** Sichtbare Länge (clientHeight bzw. clientWidth). */
  sichtbar: number;
}

/**
 * Bestimmt den weichen Rand aus den Maßen. Eine Toleranz von einem Pixel fängt
 * Rundungen bei gebrochenen Pixeln ab (z. B. bei Zoom).
 */
export function scrollRand({ position, inhalt, sichtbar }: ScrollMasse, toleranz = 1): ScrollRand {
  const rest = inhalt - sichtbar;
  if (rest <= toleranz) return "keiner";
  const pos = Math.abs(position);
  const amStart = pos <= toleranz;
  const amEnde = pos >= rest - toleranz;
  if (amStart) return "ende";
  if (amEnde) return "start";
  return "beide";
}

/** Ob der Bereich überhaupt scrollt (dann braucht er einen Tastatur-Halt). */
export function scrollt(masse: ScrollMasse, toleranz = 1): boolean {
  return masse.inhalt - masse.sichtbar > toleranz;
}
