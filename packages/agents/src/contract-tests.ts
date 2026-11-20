/**
 * PaiBot – gemeinsamer Test-Satz, den jeder Motor bestehen muss.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { Motor, TurnInput } from "@paibot/shared/motor";
import { notImplemented } from "@paibot/stub";

/**
 * Fälle des Vertrags:
 * - `antwort`: Text kommt in mindestens zwei `text-delta`, danach genau ein `finish` mit Token-Zahlen
 * - `abbruch`: Abbruch nach dem ersten `text-delta`; danach kein Ereignis mehr, kein `error`
 * - `schluessel_ungueltig`, `anbieter_nicht_erreichbar`, `limit_erreicht`: genau ein `error` mit
 *   diesem Code, kein `finish`
 * - `faehigkeiten`: `capabilities().toolsExecutedInternally` ist `false`
 */
export const MOTOR_CONTRACT_CASES = [
  "antwort",
  "abbruch",
  "schluessel_ungueltig",
  "anbieter_nicht_erreichbar",
  "limit_erreicht",
  "faehigkeiten",
] as const;
export type MotorContractCase = (typeof MOTOR_CONTRACT_CASES)[number];

/** Aufbau für einen Fall: der Motor, die Eingabe und was danach aufzuräumen ist. */
export interface MotorContractSetup {
  motor: Motor;
  input: TurnInput;
  cleanup?: () => Promise<void>;
}

export type MotorContractFactory = (testCase: MotorContractCase) => Promise<MotorContractSetup>;

/**
 * Meldet die Vertrags-Tests als Vitest-Gruppe `name` an. Aufruf in einer Testdatei, z. B.
 * `motorContractTests("AI-SDK-Motor", factory)`.
 */
export function motorContractTests(name: string, factory: MotorContractFactory): void {
  notImplemented("agents.motorContractTests", name, factory);
}
