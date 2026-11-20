/**
 * PaiBot – Tests der Entscheidung: jede Aktion mit jeder Standard-Regel und jeder Grenze, die
 * Rangfolge der Regeln, Bedingungen und die Reinheit von `evaluate`.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import {
  type ActionRequest,
  type ActionType,
  botActor,
  CREDENTIALS,
  type Facts,
} from "@paibot/shared/aktionen";
import { newId } from "@paibot/shared/ids";
import { t } from "@paibot/shared/texte";
import {
  decisionSchema,
  LIMIT_NAMES,
  LIMITS_BY_ID,
  type LimitName,
  type RuleCondition,
  type RuleDefinition,
  STANDARD_RULES,
} from "@paibot/shared/tor";
import { describe, expect, it } from "vitest";
import { conditionHolds, evaluate, NO_RULE_REASON, ruleApplies } from "./evaluate";
import { ACTION_TYPES, sampleAction, sampleFacts } from "./testdaten";

declare global {
  interface ImportMeta {
    glob(
      pattern: string | string[],
      options: { query: "?raw"; import: "default"; eager: true },
    ): Record<string, string>;
  }
}

/** Quelltext aller Dateien des Pakets (ohne Tests), eingelesen beim Bündeln der Tests. */
const SOURCES = import.meta.glob(["./**/*.ts", "!./**/*.test.ts"], {
  query: "?raw",
  import: "default",
  eager: true,
});

const OWNER_ACTIONS = ACTION_TYPES.filter((type) => type !== "modell.anfragen");
const R001 = STANDARD_RULES[0];
const R002 = STANDARD_RULES[1];
const R999 = STANDARD_RULES[2];

function decide(
  type: ActionType,
  facts?: Facts,
  rules: readonly RuleDefinition[] = STANDARD_RULES,
) {
  const decision = evaluate(
    sampleAction(type) as ActionRequest,
    (facts ?? sampleFacts(type)) as Facts,
    rules,
  );
  expect(decisionSchema.safeParse(decision).success).toBe(true);
  return decision;
}

function rule(change: Partial<RuleDefinition>): RuleDefinition {
  return {
    id: "R-100",
    version: 1,
    action: "*",
    effect: "allow",
    stage: "execute",
    conditions: [],
    priority: 50,
    source: "owner",
    enabled: true,
    title: "Testregel",
    reason: "Testregel greift.",
    ...change,
  };
}

/** Fakten, die genau eine Grenze verletzen, je Aktion; leer, wenn die Grenze die Aktion nicht betrifft. */
const VIOLATIONS: Record<LimitName, Partial<Record<ActionType, Record<string, unknown>[]>>> = {
  schleuse_gefordert: {
    "modell.anfragen": [{ route: "direct" }, { schleuseReachable: false }],
  },
  anbieter_region: {
    "modell.anfragen": [{ region: "non_eu" }, { providerEnabled: false }],
  },
  laenge: {
    "nachricht.senden": [{ inputChars: 32001 }],
    "modell.anfragen": [{ inputChars: 32001 }, { maxOutputTokens: 4096 }],
  },
  tagesbudget: {
    "modell.anfragen": [{ tokensToday: 100000 }, { tokensToday: 250000 }],
  },
  not_aus: {
    "nachricht.senden": [{ killSwitch: true }],
    "modell.anfragen": [{ killSwitch: true }],
  },
};

const LIMIT_ID_BY_NAME = Object.fromEntries(
  Object.entries(LIMITS_BY_ID).map(([id, name]) => [name, id]),
);

describe("jede Aktion × jede Standard-Regel", () => {
  it.each(OWNER_ACTIONS)("%s: R-001 erlaubt dem ausgewiesenen Besitzer", (type) => {
    const decision = decide(type);
    expect(decision).toMatchObject({
      outcome: "allow",
      stage: "execute",
      matchedRules: [{ id: "R-001", version: 1 }],
      reason: R001.reason,
    });
    expect(decision.limits.map((l) => l.name)).toEqual([...LIMIT_NAMES]);
  });

  it.each(
    OWNER_ACTIONS.flatMap((type) => CREDENTIALS.map((credential) => [type, credential] as const)),
  )("%s mit Nachweis %s: R-001 greift", (type, credential) => {
    const facts = { ...sampleFacts(type), credential } as Facts;
    expect(decide(type, facts).matchedRules).toEqual([{ id: "R-001", version: 1 }]);
  });

  it.each(OWNER_ACTIONS)("%s: ohne R-001 bleibt nur R-999 → fragen", (type) => {
    const decision = decide(type, undefined, [R002, R999]);
    expect(decision).toMatchObject({
      outcome: "ask",
      stage: "ask",
      matchedRules: [{ id: "R-999", version: 1 }],
      reason: NO_RULE_REASON,
    });
  });

  it.each(OWNER_ACTIONS)("%s: R-002 betrifft die Aktion nicht", (type) => {
    expect(ruleApplies(R002, sampleAction(type), sampleFacts(type))).toBe(false);
  });

  it("modell.anfragen: R-002 erlaubt dem Bot der Unterhaltung", () => {
    expect(decide("modell.anfragen")).toMatchObject({
      outcome: "allow",
      stage: "execute",
      matchedRules: [{ id: "R-002", version: 1 }],
      reason: R002.reason,
    });
  });

  it("modell.anfragen: R-001 betrifft den Bot nicht", () => {
    expect(ruleApplies(R001, sampleAction("modell.anfragen"), sampleFacts("modell.anfragen"))).toBe(
      false,
    );
    const decision = decide("modell.anfragen", undefined, [R001, R999]);
    expect(decision.outcome).toBe("ask");
    expect(decision.matchedRules).toEqual([{ id: "R-999", version: 1 }]);
  });

  it("modell.anfragen: fremder Bot → R-002 greift nicht, R-999 fragt", () => {
    const facts = { ...sampleFacts("modell.anfragen"), botOfConversation: false };
    expect(decide("modell.anfragen", facts)).toMatchObject({
      outcome: "ask",
      matchedRules: [{ id: "R-999", version: 1 }],
    });
  });

  it.each(ACTION_TYPES)("%s: R-999 allein → fragen", (type) => {
    expect(decide(type, undefined, [R999])).toMatchObject({
      outcome: "ask",
      stage: "ask",
      matchedRules: [{ id: "R-999", version: 1 }],
    });
  });

  it.each(ACTION_TYPES)("%s: keine Regel → fragen mit leerer Regelliste", (type) => {
    expect(decide(type, undefined, [])).toMatchObject({
      outcome: "ask",
      stage: "ask",
      matchedRules: [],
      reason: NO_RULE_REASON,
    });
  });
});

describe("jede Aktion × jede Grenze", () => {
  const cases = ACTION_TYPES.flatMap((type) => LIMIT_NAMES.map((name) => [type, name] as const));

  it.each(cases)("%s × %s", (type, name) => {
    const variants = VIOLATIONS[name][type];
    if (!variants) {
      // Grenze betrifft die Aktion nicht: entfällt oder ok, Aktion bleibt erlaubt.
      const decision = decide(type);
      expect(decision.outcome).toBe("allow");
      const check = decision.limits.find((l) => l.name === name);
      expect(check?.result).not.toBe("verletzt");
      return;
    }
    for (const change of variants) {
      const facts = { ...sampleFacts(type), ...change } as Facts;
      const decision = decide(type, facts);
      expect(decision.outcome).toBe("deny");
      expect(decision.limits.filter((l) => l.result === "verletzt").map((l) => l.name)).toEqual([
        name,
      ]);
      expect(decision.reason).toContain(LIMIT_ID_BY_NAME[name]);
      // Die Regel, die sonst erlaubt hätte, bleibt sichtbar.
      expect(decision.matchedRules).toHaveLength(1);
      expect(decision.stage).toBe("execute");
    }
  });

  it("mehrere verletzte Grenzen werden alle genannt", () => {
    const facts = {
      ...sampleFacts("modell.anfragen"),
      route: "direct",
      killSwitch: true,
    } as Facts;
    const decision = decide("modell.anfragen", facts);
    expect(decision.outcome).toBe("deny");
    expect(decision.reason).toContain("G-01");
    expect(decision.reason).toContain("G-05");
    expect(decision.reason).toBe(
      t("tor.grenze_verletzt", {
        grenzen: [
          t("tor.grenze", { id: "G-01", name: t("regel.G-01") }),
          t("tor.grenze", { id: "G-05", name: t("regel.G-05") }),
        ].join(", "),
      }),
    );
    expect(decision.reason).toBe(
      "Das Tor hat die Aktion abgelehnt. Grenze nicht eingehalten: G-01 „Datenschleuse gefordert“, G-05 „Not-Aus“.",
    );
  });

  it("verletzte Grenze geht vor, auch wenn keine Regel passt", () => {
    const facts = { ...sampleFacts("nachricht.senden"), killSwitch: true } as Facts;
    expect(decide("nachricht.senden", facts, [])).toMatchObject({
      outcome: "deny",
      stage: "ask",
      matchedRules: [],
    });
  });

  it("verletzte Grenze macht auch aus fragen eine Ablehnung", () => {
    const facts = { ...sampleFacts("modell.anfragen"), botOfConversation: false, killSwitch: true };
    expect(decide("modell.anfragen", facts).outcome).toBe("deny");
  });
});

describe("ungültige Eingaben werden abgelehnt", () => {
  it("unbekannte Aktion → Ablehnung, auch wenn R-001 auf alles passt", () => {
    const action = { ...sampleAction("zugang.abmelden"), type: "datei.loeschen" };
    const decision = evaluate(
      action as unknown as ActionRequest,
      { credential: "sitzung" } as Facts,
      STANDARD_RULES,
    );
    expect(decisionSchema.safeParse(decision).success).toBe(true);
    expect(decision).toMatchObject({ outcome: "deny", matchedRules: [] });
    expect(decision.limits.every((l) => l.result === "entfaellt")).toBe(true);
  });

  it("Bot als Akteur einer Besitzer-Aktion → Ablehnung", () => {
    const action = { ...sampleAction("bot.aendern"), actor: botActor(newId("bot")) };
    const decision = evaluate(
      action as unknown as ActionRequest,
      sampleFacts("bot.aendern") as Facts,
      STANDARD_RULES,
    );
    expect(decision.outcome).toBe("deny");
  });

  it("Besitzer als Akteur von modell.anfragen → Ablehnung", () => {
    const action = { ...sampleAction("modell.anfragen"), actor: "besitzer" };
    const decision = evaluate(
      action as unknown as ActionRequest,
      sampleFacts("modell.anfragen") as Facts,
      STANDARD_RULES,
    );
    expect(decision.outcome).toBe("deny");
  });

  it("Besitzer ohne Nachweis → Ablehnung", () => {
    const decision = evaluate(
      sampleAction("unterhaltung.loeschen") as ActionRequest,
      {} as Facts,
      STANDARD_RULES,
    );
    expect(decision.outcome).toBe("deny");
  });

  it("zusätzliche Fakten (z. B. untergeschobener Akteur) → Ablehnung", () => {
    const facts = { ...sampleFacts("unterhaltung.loeschen"), akteur: "besitzer" };
    expect(decide("unterhaltung.loeschen", facts as Facts).outcome).toBe("deny");
  });
});

describe("Rangfolge der Regeln", () => {
  it("kleinere Priorität entscheidet zuerst", () => {
    const deny = rule({ id: "R-050", effect: "deny", priority: 50, reason: "Gesperrt." });
    const decision = decide("unterhaltung.loeschen", undefined, [...STANDARD_RULES, deny]);
    expect(decision).toMatchObject({
      outcome: "deny",
      matchedRules: [{ id: "R-050", version: 1 }],
      reason: "Gesperrt.",
    });
  });

  it("die Reihenfolge der Eingabe spielt keine Rolle", () => {
    const deny = rule({ id: "R-050", effect: "deny", priority: 50 });
    const a = decide("bot.aendern", undefined, [deny, ...STANDARD_RULES]);
    const b = decide("bot.aendern", undefined, [...[...STANDARD_RULES].reverse(), deny]);
    expect(a).toEqual(b);
  });

  it("bei gleicher Priorität entscheidet die ID, dann die Fassung", () => {
    const b = rule({ id: "R-201", effect: "deny", priority: 10 });
    const a = rule({ id: "R-200", effect: "allow", priority: 10 });
    expect(decide("zugang.abmelden", undefined, [b, a]).matchedRules).toEqual([
      { id: "R-200", version: 1 },
    ]);
    const v2 = rule({ id: "R-200", version: 2, effect: "deny", priority: 10 });
    expect(decide("zugang.abmelden", undefined, [v2, a]).matchedRules).toEqual([
      { id: "R-200", version: 1 },
    ]);
  });

  it("abgeschaltete Regeln zählen nicht", () => {
    const deny = rule({ effect: "deny", priority: 1, enabled: false });
    expect(decide("zugang.abmelden", undefined, [deny, ...STANDARD_RULES]).outcome).toBe("allow");
  });

  it("Regel für eine andere Aktion zählt nicht", () => {
    const deny = rule({ action: "anbieter.loeschen", effect: "deny", priority: 1 });
    expect(decide("zugang.abmelden", undefined, [deny, ...STANDARD_RULES]).outcome).toBe("allow");
    expect(decide("anbieter.loeschen", undefined, [deny, ...STANDARD_RULES]).outcome).toBe("deny");
  });

  it.each([
    ["allow", "execute", "allow"],
    ["allow", "prepare", "prepare"],
    ["allow", "ask", "ask"],
    ["ask", "execute", "ask"],
    ["ask", "ask", "ask"],
    ["deny", "execute", "deny"],
    ["deny", "prepare", "deny"],
  ] as const)("Wirkung %s mit Stufe %s → %s", (effect, stage, outcome) => {
    const decision = decide("zugang.abmelden", undefined, [rule({ effect, stage })]);
    expect(decision.outcome).toBe(outcome);
    expect(decision.stage).toBe(stage);
  });
});

describe("Bedingungen", () => {
  const facts = { a: 5, b: 7, s: "eu", on: true, list: ["x"] };
  const holds = (fact: string, op: RuleCondition["op"], value: RuleCondition["value"]) =>
    conditionHolds({ fact, op, value } as RuleCondition, facts);

  it.each([
    ["a", "eq", 5, true],
    ["a", "eq", "5", false],
    ["a", "ne", 6, true],
    ["a", "ne", 5, false],
    ["a", "lt", 6, true],
    ["a", "lt", 5, false],
    ["a", "lte", 5, true],
    ["a", "gt", 4, true],
    ["a", "gt", 5, false],
    ["a", "gte", 5, true],
    ["s", "lt", "zz", false],
    ["s", "in", ["eu", "local"], true],
    ["s", "in", ["non_eu"], false],
    ["on", "eq", true, true],
    ["fehlt", "eq", 5, false],
    ["fehlt", "ne", 5, false],
    ["list", "eq", "x", false],
    ["list", "in", ["x"], false],
    ["constructor", "ne", 1, false],
    ["toString", "ne", 1, false],
  ] as const)("%s %s %o → %s", (fact, op, value, expected) => {
    expect(holds(fact, op, value as RuleCondition["value"])).toBe(expected);
  });

  it("vergleicht Fakt mit Fakt", () => {
    expect(holds("a", "lt", { fact: "b" })).toBe(true);
    expect(holds("a", "gte", { fact: "b" })).toBe(false);
    expect(holds("a", "eq", { fact: "a" })).toBe(true);
    expect(holds("a", "ne", { fact: "fehlt" })).toBe(false);
  });

  it("der Akteur kommt aus der Aktion, nicht aus den Fakten", () => {
    const ownerRule = rule({ conditions: [{ fact: "akteur", op: "eq", value: "besitzer" }] });
    const botAction = sampleAction("modell.anfragen");
    const spoofed = { ...sampleFacts("modell.anfragen"), akteur: "besitzer" } as Facts;
    expect(ruleApplies(ownerRule, botAction, spoofed)).toBe(false);
  });

  it("alle Bedingungen müssen gelten", () => {
    const both = rule({
      conditions: [
        { fact: "akteur", op: "eq", value: "besitzer" },
        { fact: "credential", op: "eq", value: "passwort" },
      ],
    });
    expect(ruleApplies(both, sampleAction("zugang.abmelden"), sampleFacts("zugang.abmelden"))).toBe(
      false,
    );
  });
});

describe("evaluate ist rein", () => {
  function deepFreeze<V>(value: V): V {
    if (typeof value === "object" && value !== null) {
      Object.freeze(value);
      for (const inner of Object.values(value)) deepFreeze(inner);
    }
    return value;
  }

  it.each(ACTION_TYPES)(
    "%s: gleiche Eingabe, gleiche Ausgabe; Eingabe bleibt unverändert",
    (type) => {
      const action = deepFreeze(sampleAction(type));
      const facts = deepFreeze(sampleFacts(type));
      const rules = deepFreeze(structuredClone([...STANDARD_RULES]));
      const first = evaluate(action, facts, rules);
      for (let i = 0; i < 5; i += 1) {
        expect(evaluate(action, facts, rules)).toEqual(first);
        expect(evaluate(structuredClone(action), structuredClone(facts), rules)).toEqual(first);
      }
      expect(rules).toEqual(STANDARD_RULES);
    },
  );

  it("das Paket importiert nur @paibot/shared und eigene Dateien", () => {
    expect(Object.keys(SOURCES)).toEqual(
      expect.arrayContaining(["./evaluate.ts", "./gate.ts", "./permit.ts", "./limits/index.ts"]),
    );
    for (const [file, code] of Object.entries(SOURCES)) {
      const specifiers = [...code.matchAll(/(?:import|export)[^;]*?from\s+"([^"]+)"/g)].map(
        (m) => m[1] ?? "",
      );
      const dynamic = [...code.matchAll(/\bimport\s*\(|\brequire\s*\(/g)];
      expect(dynamic, file).toEqual([]);
      for (const specifier of specifiers) {
        const allowed =
          specifier.startsWith("./") ||
          specifier.startsWith("../") ||
          specifier === "@paibot/shared" ||
          specifier.startsWith("@paibot/shared/");
        expect(allowed, `${file}: ${specifier}`).toBe(true);
      }
    }
  });

  it("Entscheidung und Grenzen nutzen weder Zeit noch Zufall noch Netz", () => {
    for (const file of ["./evaluate.ts", "./limits/index.ts"]) {
      const code = (SOURCES[file] ?? "").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      expect(code.length).toBeGreaterThan(500);
      expect(code).not.toMatch(
        /\b(Date|Math\.random|crypto|fetch|process|globalThis|setTimeout|setInterval|performance)\b/,
      );
    }
  });
});
