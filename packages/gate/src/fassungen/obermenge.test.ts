/**
 * PaiBot – Fassung 2 ist eine Obermenge von Fassung 1: Jeder feste Fall der Fassung 1
 * (`fassung-1.korpus.json`) ergibt unter Fassung 2 dieselbe Entscheidung, wenn die neuen
 * Pflicht-Fakten mit festen Füllwerten ergänzt werden. Neue Grenzen, Vorbedingungen und Deckel
 * stehen dahinter. Einzige Ausnahme: Fälle der Aktionen `werkzeug.freigeben` und
 * `werkzeug.ausfuehren`, die Fassung 2 nicht kennt (dort „Eingabe ungültig“).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import type { RuleDefinition } from "@paibot/shared/tor";
import { FUELLWERTE_5 } from "@paibot/shared/tor-fassung-5";
import { describe, expect, it } from "vitest";
import korpus from "./fassung-1.korpus.json";
import { GATE_FORMAT_2 } from "./fassung-2";
import { GATE_FORMAT_4 } from "./fassung-4";
import { GATE_FORMAT_5 } from "./fassung-5";

interface Pruefung {
  name: string;
  result: string;
  value?: unknown;
}

interface Fall {
  name: string;
  action: { type?: string } | null;
  facts: Record<string, unknown> | null;
  rules: RuleDefinition[];
  stand?: number;
  expected: Record<string, unknown> & {
    limits: Pruefung[];
    preconditions: Pruefung[];
    reason: string;
  };
}

const KORPUS = korpus as unknown as { cases: Fall[] };
const UNGUELTIG = "Das Tor hat die Aktion abgelehnt. Die Eingabe ist nicht gültig.";
const AUSNAHMEN = ["werkzeug.freigeben", "werkzeug.ausfuehren"];

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/** Füllwerte für die neuen Pflicht-Fakten (bei `modell.anfragen` die Übergangswerte). */
function fuellen(type: string | undefined, facts: Record<string, unknown> | null): unknown {
  if (facts === null) return facts;
  if (type === "modell.anfragen") {
    const input = facts.inputChars;
    const output = facts.maxOutputTokens;
    return {
      ...facts,
      step: 0,
      maxSteps: 1,
      runTokens: 0,
      stepTokenEstimate: isCount(input) && isCount(output) ? Math.ceil(input / 4) + output : 0,
      maxRunTokens: 500000,
      toolCount: 0,
      untrustedInput: false,
      trigger: "chat",
    };
  }
  if (type === "werkzeug.aufrufen") {
    return {
      ...facts,
      toolKey: `eingebaut/${String(facts.toolName)}`,
      toolDigest: `sha256:${"0".repeat(64)}`,
      toolReach: "intern",
      toolForeign: false,
      toolRegistered: true,
      toolOffered: true,
      inputValid: true,
      untrustedInput: false,
      step: 0,
      callIndexInStep: 0,
      maxCallsPerStep: 8,
      callsInRun: 0,
      maxCallsPerRun: 16,
      trigger: "chat",
    };
  }
  return facts;
}

/** Erwartung unter Fassung 2: alte Einträge unverändert, Neues dahinter. */
function erwartung(fall: Fall, facts: unknown): Record<string, unknown> {
  const type = fall.action?.type;
  const { reason: _reason, ...alt } = fall.expected;
  const gueltig = fall.expected.reason !== UNGUELTIG;
  const neu = (name: string, value?: unknown) =>
    gueltig
      ? { name, result: "ok", ...(value === undefined ? {} : { value }) }
      : { name, result: "entfaellt" };
  const f = facts as Record<string, unknown>;
  const limits = [
    ...fall.expected.limits,
    type === "modell.anfragen"
      ? neu("lauf_schritte", 0)
      : { name: "lauf_schritte", result: "entfaellt" },
    type === "werkzeug.aufrufen"
      ? neu("lauf_aufrufe", 0)
      : { name: "lauf_aufrufe", result: "entfaellt" },
    type === "modell.anfragen"
      ? neu("lauf_token", f.stepTokenEstimate)
      : { name: "lauf_token", result: "entfaellt" },
  ];
  const out: Record<string, unknown> = { ...alt, limits };
  if (type === "werkzeug.aufrufen") {
    out.preconditions = [
      ...fall.expected.preconditions,
      ...["werkzeug_angeboten", "eingabe_gueltig", "aufrufe_je_schritt"].map((name) => ({
        name,
        result: gueltig ? "ok" : "entfaellt",
      })),
    ];
    out.caps = [{ name: "fremd_dann_fragen", result: "entfaellt" }];
  }
  return out;
}

function rechne(fall: Fall, facts: unknown): Record<string, unknown> {
  const action = fall.action as never;
  const decision =
    fall.stand === undefined
      ? GATE_FORMAT_2.evaluate(action, facts, fall.rules)
      : GATE_FORMAT_2.evaluate(action, facts, { stand: fall.stand, rules: fall.rules as never });
  const { reason: _reason, ...rest } = decision as unknown as Record<string, unknown>;
  return rest;
}

const AUSNAHME_FAELLE = KORPUS.cases.filter((fall) => AUSNAHMEN.includes(fall.action?.type ?? ""));
const FAELLE = KORPUS.cases.filter((fall) => !AUSNAHMEN.includes(fall.action?.type ?? ""));

describe("Obermenge: Korpus der Fassung 1 unter Fassung 2", () => {
  it("Zahl der Fälle und der Ausnahmen", () => {
    expect(KORPUS.cases).toHaveLength(128);
    expect(FAELLE).toHaveLength(123);
    expect(AUSNAHME_FAELLE.map((fall) => fall.name).sort()).toEqual([
      "aktion werkzeug.ausfuehren",
      "aktion werkzeug.freigeben",
      "vorbedingung V-05 verletzt werkzeug.ausfuehren",
      "vorbedingung V-08 verletzt werkzeug.freigeben",
      "vorbedingung V-09 verletzt werkzeug.freigeben",
    ]);
  });

  for (const fall of FAELLE) {
    it(fall.name, () => {
      const facts = fuellen(fall.action?.type, fall.facts);
      expect(rechne(fall, facts)).toStrictEqual(erwartung(fall, facts));
    });
  }

  for (const fall of AUSNAHME_FAELLE) {
    it(`Ausnahme: ${fall.name} ist in Fassung 2 ungültig`, () => {
      expect(rechne(fall, fall.facts)).toStrictEqual({
        outcome: "deny",
        stage: "ask",
        matchedRules: [],
        limits: GATE_FORMAT_2.limitOrder.map((name) => ({ name, result: "entfaellt" })),
        preconditions: [],
      });
    });
  }
});

/**
 * Korpus 1 unter Fassung 4, über die Füllwerte der Fassung 2 und den Füllwert `botPaused: false`:
 * Entscheidung, Stufe und gewinnende Regeln sind wie unter Fassung 2. Ausnahmen: die fünf Fälle,
 * die schon Fassung 2 nicht annimmt (siehe oben), und die Fälle mit Quelle `mcp`, die Fassung 3 und
 * damit Fassung 4 ausdrücklich nicht mehr annehmen (geerbt von Fassung 3).
 */
const BOT_BEREIT = ["modell.anfragen", "nachricht.senden", "werkzeug.aufrufen"];
const MCP_AUSNAHMEN = ["werkzeug mcp mit server"];

function rechne4(fall: Fall, facts: unknown) {
  const action = fall.action as never;
  const decision =
    fall.stand === undefined
      ? GATE_FORMAT_4.evaluate(action, facts as never, fall.rules)
      : GATE_FORMAT_4.evaluate(action, facts as never, {
          stand: fall.stand,
          rules: fall.rules as never,
        });
  return decision as unknown as {
    outcome: string;
    stage: string;
    matchedRules: unknown;
    limits: Pruefung[];
  };
}

describe("Obermenge: Korpus der Fassung 1 unter Fassung 4", () => {
  const faelle4 = FAELLE.filter((fall) => !MCP_AUSNAHMEN.includes(fall.name));

  it("Zahl der Fälle und die geerbte Ausnahme (Quelle mcp)", () => {
    expect(FAELLE.map((fall) => fall.name).filter((name) => MCP_AUSNAHMEN.includes(name))).toEqual(
      MCP_AUSNAHMEN,
    );
    expect(faelle4).toHaveLength(FAELLE.length - MCP_AUSNAHMEN.length);
  });

  for (const fall of faelle4) {
    it(fall.name, () => {
      const type = fall.action?.type;
      const gefuellt = fuellen(type, fall.facts) as Record<string, unknown> | null;
      const f2 = rechne(fall, gefuellt);
      const f4facts =
        gefuellt !== null && type !== undefined && BOT_BEREIT.includes(type)
          ? { ...gefuellt, botPaused: false }
          : gefuellt;
      const f4 = rechne4(fall, f4facts);
      expect({ outcome: f4.outcome, stage: f4.stage, matchedRules: f4.matchedRules }).toStrictEqual(
        {
          outcome: f2.outcome,
          stage: f2.stage,
          matchedRules: f2.matchedRules,
        },
      );
    });
  }

  it("die geerbte Ausnahme: Fälle mit Quelle mcp sind unter Fassung 4 ungültig", () => {
    for (const name of MCP_AUSNAHMEN) {
      const fall = FAELLE.find((x) => x.name === name) as Fall;
      const gefuellt = fuellen(fall.action?.type, fall.facts) as Record<string, unknown>;
      const f4 = rechne4(fall, { ...gefuellt, botPaused: false });
      expect(f4.outcome, name).toBe("deny");
      expect(f4.matchedRules, name).toEqual([]);
    }
  });
});

/**
 * Korpus 1 unter Fassung 5, über die Füllwerte der Fassungen 2 und 4 und die der Fassung 5
 * (`FUELLWERTE_5`: Direkt-Chat, kein Auftrag, Zweck `chat`): Entscheidung, Stufe und gewinnende
 * Regeln sind wie unter Fassung 4, mit derselben geerbten Ausnahme (Quelle `mcp`). Die Korpora der
 * Fassungen 2 bis 4 unter Fassung 5 prüft `fassung-5.test.ts`.
 */
function rechne5(fall: Fall, facts: unknown) {
  const action = fall.action as never;
  const decision =
    fall.stand === undefined
      ? GATE_FORMAT_5.evaluate(action, facts as never, fall.rules)
      : GATE_FORMAT_5.evaluate(action, facts as never, {
          stand: fall.stand,
          rules: fall.rules as never,
        });
  return decision as unknown as { outcome: string; stage: string; matchedRules: unknown };
}

describe("Obermenge: Korpus der Fassung 1 unter Fassung 5", () => {
  const faelle5 = FAELLE.filter((fall) => !MCP_AUSNAHMEN.includes(fall.name));

  for (const fall of faelle5) {
    it(fall.name, () => {
      const type = fall.action?.type;
      const gefuellt = fuellen(type, fall.facts) as Record<string, unknown> | null;
      const f4facts =
        gefuellt !== null && type !== undefined && BOT_BEREIT.includes(type)
          ? { ...gefuellt, botPaused: false }
          : gefuellt;
      const fuell5 =
        type === undefined ? undefined : (FUELLWERTE_5 as Record<string, object>)[type];
      const f5facts =
        f4facts !== null && fuell5 !== undefined ? { ...f4facts, ...fuell5 } : f4facts;
      const f4 = rechne4(fall, f4facts);
      const f5 = rechne5(fall, f5facts);
      expect({ outcome: f5.outcome, stage: f5.stage, matchedRules: f5.matchedRules }).toStrictEqual(
        { outcome: f4.outcome, stage: f4.stage, matchedRules: f4.matchedRules },
      );
    });
  }
});
