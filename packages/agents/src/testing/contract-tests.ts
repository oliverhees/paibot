/**
 * PaiBot – gemeinsamer Test-Satz, den jeder Motor bestehen muss.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { Motor, MotorEvent, TurnInput } from "@paibot/shared/motor";
import { describe, expect, it } from "vitest";

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

/** Nach dem Abbruch muss die Runde spätestens so schnell zu Ende sein. */
const ABORT_GRACE_MS = 1000;

/** Sammelt alle Ereignisse einer Runde; optional wird nach dem ersten `text-delta` abgebrochen. */
async function collect(
  setup: MotorContractSetup,
  abortAfterFirstDelta = false,
): Promise<{ before: MotorEvent[]; after: MotorEvent[]; endedAfterAbortMs?: number }> {
  const controller = new AbortController();
  const before: MotorEvent[] = [];
  const after: MotorEvent[] = [];
  let abortedAt: number | undefined;
  for await (const event of setup.motor.runTurn(setup.input, controller.signal)) {
    (abortedAt === undefined ? before : after).push(event);
    if (abortAfterFirstDelta && abortedAt === undefined && event.type === "text-delta") {
      abortedAt = Date.now();
      controller.abort();
    }
  }
  return {
    before,
    after,
    ...(abortedAt === undefined ? {} : { endedAfterAbortMs: Date.now() - abortedAt }),
  };
}

async function withSetup(
  factory: MotorContractFactory,
  testCase: MotorContractCase,
  check: (setup: MotorContractSetup) => Promise<void>,
): Promise<void> {
  const setup = await factory(testCase);
  try {
    await check(setup);
  } finally {
    await setup.cleanup?.();
  }
}

function expectSingleError(events: MotorEvent[], code: MotorContractCase): void {
  const errors = events.filter((event) => event.type === "error");
  expect(errors).toHaveLength(1);
  expect(errors[0]).toMatchObject({ type: "error", code });
  expect(typeof (errors[0] as { retryable: unknown }).retryable).toBe("boolean");
  expect(events.some((event) => event.type === "finish")).toBe(false);
  expect(events[events.length - 1]?.type).toBe("error");
}

/**
 * Meldet die Vertrags-Tests als Vitest-Gruppe `name` an. Aufruf in einer Testdatei, z. B.
 * `motorContractTests("AI-SDK-Motor", factory)`.
 */
export function motorContractTests(name: string, factory: MotorContractFactory): void {
  describe(`Motor-Vertrag: ${name}`, () => {
    it("antwort: Text in Stücken, danach genau ein finish mit Token-Zahlen", async () => {
      await withSetup(factory, "antwort", async (setup) => {
        const { before: events } = await collect(setup);
        const deltas = events.filter((event) => event.type === "text-delta");
        expect(deltas.length).toBeGreaterThanOrEqual(2);
        expect(deltas.every((event) => event.text.length > 0)).toBe(true);
        const finishes = events.filter((event) => event.type === "finish");
        expect(finishes).toHaveLength(1);
        expect(events[events.length - 1]).toBe(finishes[0]);
        const { usage, finishReason } = finishes[0] as Extract<MotorEvent, { type: "finish" }>;
        expect(typeof finishReason).toBe("string");
        for (const count of [usage.input, usage.output]) {
          expect(Number.isInteger(count)).toBe(true);
          expect(count).toBeGreaterThan(0);
        }
        expect(events.some((event) => event.type === "error")).toBe(false);
      });
    });

    it("abbruch: nach dem Abbruch kein Ereignis mehr, kein Fehler, schnelles Ende", async () => {
      await withSetup(factory, "abbruch", async (setup) => {
        const result = await collect(setup, true);
        expect(result.before.at(-1)?.type).toBe("text-delta");
        expect(result.after).toEqual([]);
        expect(result.endedAfterAbortMs).toBeLessThan(ABORT_GRACE_MS);
      });
    });

    it("abbruch: schon abgebrochenes Signal ergibt eine leere Runde", async () => {
      await withSetup(factory, "abbruch", async (setup) => {
        const controller = new AbortController();
        controller.abort();
        const events: MotorEvent[] = [];
        for await (const event of setup.motor.runTurn(setup.input, controller.signal)) {
          events.push(event);
        }
        expect(events).toEqual([]);
      });
    });

    for (const code of [
      "schluessel_ungueltig",
      "anbieter_nicht_erreichbar",
      "limit_erreicht",
    ] as const) {
      it(`${code}: genau ein error mit diesem Code, kein finish, keine Ausnahme`, async () => {
        await withSetup(factory, code, async (setup) => {
          const { before } = await collect(setup);
          expectSingleError(before, code);
        });
      });
    }

    it("faehigkeiten: der Motor führt keine Werkzeuge selbst aus", async () => {
      await withSetup(factory, "faehigkeiten", async (setup) => {
        const capabilities = setup.motor.capabilities();
        expect(capabilities.toolsExecutedInternally).toBe(false);
        expect(typeof setup.motor.id).toBe("string");
        expect(setup.motor.id.length).toBeGreaterThan(0);
      });
    });
  });
}
