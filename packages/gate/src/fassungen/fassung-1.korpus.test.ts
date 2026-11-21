/**
 * PaiBot – feste Fälle der Tor-Auswertung (`fassung-1.korpus.json`). Die Datei entstand mit dem
 * `evaluate` vom Stand 39d882b, bevor es Fassungen gab, und wird nie angepasst: Jede Abweichung
 * einer späteren Auswertung von diesen Fällen macht den Test rot. Verglichen wird alles außer dem
 * Grund (`reason`): Texte gehören nicht zum Inhalt einer Fassung; ein eigener Test prüft nur,
 * dass jeder Grund ein Text aus einem vorhandenen Text-Schlüssel oder aus einer Regel ist.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { de, t } from "@paibot/shared/texte";
import { CONDITION_OPS, type RuleDefinition } from "@paibot/shared/tor";
import { describe, expect, it } from "vitest";
import { evaluate } from "../evaluate";
import { GATE_FORMAT_1 } from "./fassung-1";
import korpus1 from "./fassung-1.korpus.json";
import korpus2 from "./fassung-2.korpus.json";
import { gateFormatSpec } from "./index";

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

const KORPUS = korpus1 as unknown as { format: number; cases: Fall[] };

function rechne(fall: Fall): unknown {
  const action = fall.action as never;
  const facts = fall.facts as never;
  if (fall.stand === undefined) return evaluate(action, facts, fall.rules, { format: 1 });
  return evaluate(action, facts, { stand: fall.stand, rules: fall.rules as never }, { format: 1 });
}

function ohneGrund(value: unknown): Record<string, unknown> {
  const { reason: _reason, ...rest } = value as Record<string, unknown>;
  return rest;
}

describe("Korpus der Fassung 1", () => {
  it("deckt jede Aktion, jedes Ergebnis, jede Vorbedingung, jede Grenze und jeden Operator der Fassung 1 ab", () => {
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
    // Abdeckung gegen die Listen der Fassung 1, nicht gegen die heutigen Verträge.
    expect([...grenzen].sort()).toEqual([...GATE_FORMAT_1.limitOrder].sort());
    const namen1 = Object.values(GATE_FORMAT_1.preconditions).map((p) => p.name);
    expect([...vorbedingungen].sort()).toEqual([...namen1].sort());
    const ops = new Set(
      KORPUS.cases.flatMap((fall) =>
        fall.rules.flatMap((rule) => rule.conditions.map((condition) => condition.op)),
      ),
    );
    expect([...ops].sort()).toEqual([...CONDITION_OPS].sort());
  });

  for (const fall of KORPUS.cases) {
    it(fall.name, () => {
      expect(ohneGrund(rechne(fall))).toStrictEqual(ohneGrund(fall.expected));
    });
  }
});

/** Texte, die als Grund vorkommen dürfen: ganze Texte oder der feste Anfang einer Vorlage. */
function erlaubterGrund(reason: string, rules: readonly RuleDefinition[]): boolean {
  if (rules.some((rule) => rule.reason === reason)) return true;
  const ganz = [
    t("fehler.regel_fehlt"),
    `${t("fehler.abgelehnt")} ${t("fehler.eingabe_ungueltig")}`,
    t("tor.deckel.D-01"),
  ];
  if (ganz.includes(reason)) return true;
  const vorlagen = [de["tor.grenze_verletzt"], de["tor.vorbedingung_verletzt"]];
  return vorlagen.some((vorlage) => reason.startsWith(vorlage.slice(0, vorlage.indexOf("{"))));
}

describe("Grund jeder Entscheidung", () => {
  const faelle: { format: number; fall: Fall }[] = [
    ...KORPUS.cases.map((fall) => ({ format: 1, fall })),
  ];
  const k2 = korpus2 as unknown as {
    ruleSets: Record<string, RuleDefinition[]>;
    cases: (Omit<Fall, "rules"> & { rules: RuleDefinition[] | string })[];
  };
  if (gateFormatSpec(2) !== undefined) {
    for (const fall of k2.cases) {
      const rules = typeof fall.rules === "string" ? (k2.ruleSets[fall.rules] ?? []) : fall.rules;
      faelle.push({ format: 2, fall: { ...fall, rules } as Fall });
    }
  }

  it("ist ein nicht leerer Text ≤ 500 aus einem vorhandenen Text-Schlüssel oder einer Regel", () => {
    expect(faelle.length).toBeGreaterThan(KORPUS.cases.length);
    for (const { format, fall } of faelle) {
      const action = fall.action as never;
      const facts = fall.facts as never;
      const decision =
        fall.stand === undefined
          ? evaluate(action, facts, fall.rules, { format })
          : evaluate(action, facts, { stand: fall.stand, rules: fall.rules as never }, { format });
      const reason = decision.reason;
      expect(typeof reason, fall.name).toBe("string");
      expect(reason.length, fall.name).toBeGreaterThan(0);
      expect(reason.length, fall.name).toBeLessThanOrEqual(500);
      expect(erlaubterGrund(reason, fall.rules), `${format} ${fall.name}: ${reason}`).toBe(true);
    }
  });
});
