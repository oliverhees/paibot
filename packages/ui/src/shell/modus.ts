/**
 * PaiBot – Darstellung der AppShell je nach Breite.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

/** Darstellung der AppShell je nach verfügbarer Breite. */
export type ShellModus = "handy" | "schmal" | "mittel" | "breit";

/** Grenzen in Pixeln; dieselben Werte stehen in den Container-Abfragen der Stile. */
export const SHELL_GRENZEN = { handy: 720, leiste: 960, flaeche: 1180 } as const;

/**
 * - breit: Navigation, Inhalt und Arbeitsfläche nebeneinander
 * - mittel: Navigation fest, Arbeitsfläche legt sich über den Inhalt
 * - schmal: Navigation als Menü von links, Arbeitsfläche legt sich über den Inhalt
 * - handy: Navigation als Menü von links, Arbeitsfläche als Blatt von unten
 */
export function shellModus(breite: number): ShellModus {
  if (breite < SHELL_GRENZEN.handy) return "handy";
  if (breite < SHELL_GRENZEN.leiste) return "schmal";
  if (breite < SHELL_GRENZEN.flaeche) return "mittel";
  return "breit";
}

/** Navigation ist ein eigenes, modales Menü (statt fester Leiste). */
export function navAlsMenue(modus: ShellModus): boolean {
  return modus === "handy" || modus === "schmal";
}

/** Arbeitsfläche liegt über dem Inhalt statt daneben. */
export function flaecheUeberlagert(modus: ShellModus): boolean {
  return modus !== "breit";
}

/** Arbeitsfläche ist modal (Blatt von unten mit Schleier). */
export function flaecheModal(modus: ShellModus): boolean {
  return modus === "handy";
}
