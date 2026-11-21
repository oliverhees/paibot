/**
 * PaiBot – Schalter zwischen den drei Fassungen des Startbereichs.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { StartBegruessung } from "./StartBegruessung";
import { StartStartbrett } from "./StartStartbrett";
import { StartStille, type StartStilleProps } from "./StartStille";
import type { StartFassung } from "./typen";

export interface StartbereichProps extends StartStilleProps {
  /** Welche Fassung gezeigt wird. */
  fassung: StartFassung;
}

/** Zeigt den Startbereich einer leeren Unterhaltung in der gewählten Fassung. */
export function Startbereich({ fassung, sitz, ...daten }: StartbereichProps) {
  switch (fassung) {
    case "startbrett":
      return <StartStartbrett {...daten} />;
    case "stille":
      return <StartStille {...daten} sitz={sitz} />;
    default:
      return <StartBegruessung {...daten} />;
  }
}
