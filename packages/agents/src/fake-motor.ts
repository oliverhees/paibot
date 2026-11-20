/**
 * PaiBot – Test-Motor, der eine vorgegebene Folge von Ereignissen liefert.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { Motor, MotorCapabilities, MotorEvent, TurnInput } from "@paibot/shared/motor";
import { notImplemented } from "@paibot/stub";

/** Ein Schritt des Ablaufs: ein Ereignis, eine Pause oder Warten bis zum Abbruch. */
export type FakeMotorStep = MotorEvent | { type: "pause"; ms: number } | { type: "bis-abbruch" };

/** Feste Folge oder Folge je Runde (`turn` zählt ab 0). */
export type FakeMotorScript =
  | readonly FakeMotorStep[]
  | ((input: TurnInput, turn: number) => readonly FakeMotorStep[]);

export interface FakeMotor extends Motor {
  /** Eingaben aller Runden in Aufruf-Reihenfolge. */
  readonly calls: readonly TurnInput[];
}

/**
 * Baut einen Test-Motor (`id` `fake`). Er liefert die Schritte in Reihenfolge, hält bei `pause`
 * die angegebene Zeit an und endet bei Abbruch über `signal` sofort ohne weiteres Ereignis.
 * Standard-Fähigkeiten: Streaming und Abbruch ja, Werkzeuge nein, `toolsExecutedInternally` nein.
 */
export function createFakeMotor(
  script: FakeMotorScript,
  capabilities?: Partial<MotorCapabilities>,
): FakeMotor {
  return notImplemented("agents.createFakeMotor", script, capabilities);
}
