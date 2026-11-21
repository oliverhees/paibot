/**
 * PaiBot – feste Fälle der Tor-Auswertung (`fassung-1.korpus.json`). Die Datei entstand mit dem
 * `evaluate` vom Stand 39d882b, bevor es Fassungen gab, und wird nie angepasst: Jede Abweichung
 * einer späteren Auswertung von diesen Fällen macht den Test rot.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import {
  CONDITION_OPS,
  LIMIT_NAMES,
  PRECONDITION_NAMES,
  type RuleDefinition,
} from "@paibot/shared/tor";
import { describe, expect, it } from "vitest";
import { evaluate } from "../evaluate";
import korpus from "./fassung-1.korpus.json";

interface Fall {
  name: string;
  action: unknown;
  facts: unknown;
  rules: RuleDefinition[];
  stand?: number;
  expected: Record<string, unknown> & {
    outcome: string;
    limits: { name: string; result: string }[];
    preconditions: { name: string; result: string }[];
  };
}

const KORPUS = korpus as unknown as { format: number; cases: Fall[] };

function rechne(fall: Fall): unknown {
  const action = fall.action as never;
  const facts = fall.facts as never;
  if (fall.stand === undefined) return evaluate(action, facts, fall.rules);
  return evaluate(action, facts, { stand: fall.stand, rules: fall.rules as never });
}

describe("Korpus der Fassung 1", () => {
  it("deckt jede Aktion, jedes Ergebnis, jede Vorbedingung, jede Grenze und jeden Operator ab", () => {
    expect(KORPUS.format).toBe(1);
    const names = KORPUS.cases.map((fall) => fall.name);
    expect(new Set(names).size).toBe(names.length);
    const outcomes = new Set(KORPUS.cases.map((fall) => fall.expected.outcome));
    expect([...outcomes].sort()).toEqual(["allow", "ask", "deny", "prepare"]);
    const verletzt = (liste: { name: string; result: string }[]) =>
      liste.filter((c) => c.result === "verletzt").map((c) => c.name);
    const grenzen = new Set(KORPUS.cases.flatMap((fall) => verletzt(fall.expected.limits)));
    const vorbedingungen = new Set(
      KORPUS.cases.flatMap((fall) => verletzt(fall.expected.preconditions)),
    );
    expect([...grenzen].sort()).toEqual([...LIMIT_NAMES].sort());
    expect([...vorbedingungen].sort()).toEqual([...PRECONDITION_NAMES].sort());
    const ops = new Set(
      KORPUS.cases.flatMap((fall) =>
        fall.rules.flatMap((rule) => rule.conditions.map((condition) => condition.op)),
      ),
    );
    expect([...ops].sort()).toEqual([...CONDITION_OPS].sort());
  });

  for (const fall of KORPUS.cases) {
    it(fall.name, () => {
      expect(rechne(fall)).toStrictEqual(fall.expected);
    });
  }
});
