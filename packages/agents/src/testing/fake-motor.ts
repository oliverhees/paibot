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
import { FAKE_MOTOR_ID } from "../motor";

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

const DEFAULT_CAPABILITIES: MotorCapabilities = {
  streaming: true,
  tools: false,
  reasoning: false,
  abort: true,
  toolsExecutedInternally: false,
};

/**
 * Baut einen Test-Motor (`id` `fake`). Er liefert die Schritte in Reihenfolge, hält bei `pause`
 * die angegebene Zeit an und endet bei Abbruch über `signal` sofort ohne weiteres Ereignis.
 * Standard-Fähigkeiten: Streaming und Abbruch ja, Werkzeuge nein, `toolsExecutedInternally` nein.
 */
export function createFakeMotor(
  script: FakeMotorScript,
  capabilities?: Partial<MotorCapabilities>,
): FakeMotor {
  const calls: TurnInput[] = [];
  const caps: MotorCapabilities = { ...DEFAULT_CAPABILITIES, ...capabilities };
  return {
    id: FAKE_MOTOR_ID,
    calls,
    capabilities: () => ({ ...caps }),
    runTurn(input, signal) {
      const turn = calls.length;
      calls.push(input);
      const steps = typeof script === "function" ? script(input, turn) : script;
      return play([...steps], signal);
    },
  };
}

async function* play(steps: FakeMotorStep[], signal: AbortSignal): AsyncGenerator<MotorEvent> {
  for (const step of steps) {
    if (signal.aborted) return;
    if (step.type === "pause") {
      await sleep(step.ms, signal);
      continue;
    }
    if (step.type === "bis-abbruch") {
      await untilAborted(signal);
      return;
    }
    yield structuredClone(step);
  }
}

/** Wartet `ms` Millisekunden oder bis zum Abbruch, was zuerst kommt. */
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
  });
}

function untilAborted(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) =>
    signal.addEventListener("abort", () => resolve(), { once: true }),
  );
}
