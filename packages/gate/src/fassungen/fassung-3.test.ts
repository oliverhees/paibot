/**
 * PaiBot – Tests der Tor-Fassung 3 „Apps lesen“:
 * - sie setzt genau den Vertrag aus `@paibot/shared/tor-fassung-3` um (Fassung 2 und das Neue);
 * - sie ist eine Obermenge von Fassung 2 (feste Fälle der Fassung 2 ergeben dieselbe
 *   Entscheidung; die neuen Grenzen stehen dahinter und entfallen);
 * - jede Bedingung von R-014 wirkt (ohne sie ändert sich ein fester Fall bzw., bei Akteur und
 *   Quelle, die Auswertung der Regel selbst);
 * - sie steht unter dem Tor der Fassung 4 weiter in der Liste: R-014 steht in den Standard-Regeln,
 *   ein erlaubter Aufruf eines App-Werkzeugs läuft (mit den Fakten der Fassung 4) durch das echte
 *   Tor; mit Fassung 2 bleibt er ungültig.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import type { PaiBotError } from "@paibot/shared/fehler";
import { ACTIVE_STANDARD_RULES, GATE_FORMAT, type RuleDefinition } from "@paibot/shared/tor";
import {
  APP_ACTION_SHAPES,
  APP_ACTION_TYPES,
  ERROR_CODES_3,
  LIMITS_BY_ID_3,
  MCP_TOOL_CALL_FACTS,
  PRECONDITIONS_3,
  R014_V1,
} from "@paibot/shared/tor-fassung-3";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { evaluate } from "../evaluate";
import { createGate, type GatePorts } from "../gate";
import { ruleSnapshot } from "../regel-hash";
import { GATE_FORMAT_2 } from "./fassung-2";
import korpus2 from "./fassung-2.korpus.json";
import { GATE_FORMAT_3 } from "./fassung-3";
import korpus3 from "./fassung-3.korpus.json";
import { currentGateFormat, GATE_FORMATS, gateFormatSpec, KNOWN_GATE_FORMAT } from "./index";

interface Pruefung {
  name: string;
  result: string;
  value?: unknown;
}

interface Fall {
  name: string;
  action: { type?: string } | null;
  facts: Record<string, unknown> | null;
  rules: RuleDefinition[] | string;
  stand?: number;
  expected: Record<string, unknown> & { limits: Pruefung[] };
}

interface GrenzenFall {
  name: string;
  action: { type: string };
  facts: unknown;
  expected: Pruefung[];
}

type Korpus = {
  ruleSets: Record<string, RuleDefinition[]>;
  cases: Fall[];
  limitCases: GrenzenFall[];
};
const K2 = korpus2 as unknown as Korpus;
const K3 = korpus3 as unknown as Korpus;

function regeln(korpus: Korpus, fall: Fall): RuleDefinition[] {
  if (typeof fall.rules !== "string") return fall.rules;
  const satz = korpus.ruleSets[fall.rules];
  if (satz === undefined) throw new Error(`Regel-Satz ${fall.rules} fehlt.`);
  return satz;
}

function ohneGrund(decision: unknown): Record<string, unknown> {
  const { reason: _reason, ...rest } = decision as Record<string, unknown>;
  return rest;
}

function rechne(spec: typeof GATE_FORMAT_3, korpus: Korpus, fall: Fall, rules?: RuleDefinition[]) {
  const liste = rules ?? regeln(korpus, fall);
  const action = fall.action as never;
  const facts = fall.facts as never;
  const decision =
    fall.stand === undefined
      ? spec.evaluate(action, facts, liste)
      : spec.evaluate(action, facts, { stand: fall.stand, rules: liste as never });
  return ohneGrund(decision);
}

/** JSON-Schema eines Zod-Schemas; nicht darstellbare Teile (Prüf-Funktionen) als „beliebig“. */
function json(schema: unknown): unknown {
  return z.toJSONSchema(schema as z.ZodType, { unrepresentable: "any" });
}

const NEUE_GRENZEN = Object.values(LIMITS_BY_ID_3) as string[];
const ENTFALLEN = NEUE_GRENZEN.map((name) => ({ name, result: "entfaellt" }));

describe("Fassung 3 setzt genau den Vertrag um", () => {
  it("Aktionen: die der Fassung 2 und die vier für Apps", () => {
    expect([...GATE_FORMAT_3.actions]).toEqual([...GATE_FORMAT_2.actions, ...APP_ACTION_TYPES]);
    for (const type of APP_ACTION_TYPES) expect(GATE_FORMAT_3.actor[type]).toBe("besitzer");
  });

  it("Aktionen der Fassung 2 außer werkzeug.aufrufen: Fakten, Ziel und Akteur unverändert", () => {
    for (const type of GATE_FORMAT_2.actions) {
      expect(json(GATE_FORMAT_3.target[type]), type).toEqual(json(GATE_FORMAT_2.target[type]));
      expect(GATE_FORMAT_3.actor[type], type).toBe(GATE_FORMAT_2.actor[type]);
      if (type === "werkzeug.aufrufen") continue;
      expect(json(GATE_FORMAT_3.facts[type]), type).toEqual(json(GATE_FORMAT_2.facts[type]));
    }
  });

  it("werkzeug.aufrufen: Fakten der Fassung 2 und dazu die Fakten der App, alle optional", () => {
    const f2 = json(GATE_FORMAT_2.facts["werkzeug.aufrufen"]) as {
      properties: Record<string, unknown>;
      required: string[];
    };
    const f3 = json(GATE_FORMAT_3.facts["werkzeug.aufrufen"]) as typeof f2;
    const neu = Object.fromEntries(
      Object.entries(MCP_TOOL_CALL_FACTS).map(([name, schema]) => {
        const { $schema: _s, ...rest } = json(schema) as Record<string, unknown>;
        return [name, rest];
      }),
    );
    expect(f3.properties).toEqual({ ...f2.properties, ...neu });
    expect(f3.required).toEqual(f2.required);
  });

  it("Aktionen für Apps: Ziel und Fakten wie im Vertrag", () => {
    for (const type of APP_ACTION_TYPES) {
      const shape = APP_ACTION_SHAPES[type];
      expect(json(GATE_FORMAT_3.target[type]), type).toEqual(json(z.strictObject(shape.target)));
      expect(json(GATE_FORMAT_3.facts[type]), type).toEqual(json(z.strictObject(shape.facts)));
    }
  });

  it("Grenzen, Vorbedingungen, Deckel und Fehlercodes: Fassung 2 und das Neue dahinter", () => {
    expect([...GATE_FORMAT_3.limitOrder]).toEqual([...GATE_FORMAT_2.limitOrder, ...NEUE_GRENZEN]);
    expect(GATE_FORMAT_3.preconditions).toEqual({
      ...GATE_FORMAT_2.preconditions,
      ...JSON.parse(JSON.stringify(PRECONDITIONS_3)),
    });
    expect(GATE_FORMAT_3.caps).toEqual(GATE_FORMAT_2.caps);
    expect(GATE_FORMAT_3.capOrder).toEqual(GATE_FORMAT_2.capOrder);
    expect([...GATE_FORMAT_3.errorCodes]).toEqual([...GATE_FORMAT_2.errorCodes, ...ERROR_CODES_3]);
  });

  it("Felder im Beleg: Fassung 3, neue Namen und Codes nur hier", () => {
    const decision = {
      gateFormat: 3,
      outcome: "deny",
      stage: "execute",
      rules: [{ id: "R-014", version: 1 }],
      limits: [{ name: "eine_app_je_schritt", result: "verletzt" }],
      preconditions: [{ name: "abdruck_gesehen", result: "ok" }],
      caps: [{ name: "fremd_dann_fragen", result: "nicht_noetig" }],
      reason: "Grund.",
    };
    const fuer = GATE_FORMAT_3.decisionFor?.("werkzeug.aufrufen");
    expect(fuer?.safeParse(decision).success).toBe(true);
    expect(fuer?.safeParse({ ...decision, gateFormat: 2 }).success).toBe(false);
    expect(GATE_FORMAT_2.decisionFor?.("werkzeug.aufrufen").safeParse(decision).success).toBe(
      false,
    );
    const { caps: _caps, ...ohneDeckel } = decision;
    expect(GATE_FORMAT_3.decisionFor?.("app.verbinden").safeParse(ohneDeckel).success).toBe(true);
    expect(GATE_FORMAT_3.decisionFor?.("app.verbinden").safeParse(decision).success).toBe(false);
    for (const code of ERROR_CODES_3) {
      expect(GATE_FORMAT_3.result.safeParse({ status: "denied", code }).success, code).toBe(true);
      expect(GATE_FORMAT_2.result.safeParse({ status: "denied", code }).success, code).toBe(false);
    }
  });

  it("Fehlercode je Ablehnung: V-19, V-38, G-06, G-07, G-08, G-40", () => {
    const code = (name: string) => {
      const fall = K3.cases.find((entry) => entry.name === name);
      if (fall === undefined) throw new Error(name);
      const decision = GATE_FORMAT_3.evaluate(
        fall.action as never,
        fall.facts as never,
        regeln(K3, fall),
      );
      return GATE_FORMAT_3.denialCode?.(decision);
    };
    expect(code("V-19 verletzt addressPublic")).toBe("app_adresse_unzulaessig");
    expect(code("V-38 verletzt abdruck anders")).toBe("werkzeug_abdruck_ungesehen");
    expect(code("R-014 kein zugriff")).toBe("werkzeug_kein_zugriff");
    expect(code("G-07 abdruck weicht ab")).toBe("werkzeug_geaendert");
    expect(code("G-08 ziel weicht ab")).toBe("werkzeug_geaendert");
    expect(code("G-40 zweite app im schritt")).toBe("werkzeug_zweite_app");
    expect(code("G-05 not-aus beim app-werkzeug")).toBe("angehalten");
    expect(code("G-17 app-werkzeug aufrufe aufgebraucht")).toBe("limit_erreicht");
    expect(code("R-014 nur im direkt-chat")).toBe("regel_fehlt");
  });
});

/**
 * Fälle der Fassung 2 mit Quelle `mcp`, die Fassung 3 ausdrücklich nicht mehr annimmt: Ihnen fehlen
 * die Fakten der App, ihre Reichweite ist `intern`, sie liefern keine fremden Inhalte. Unter
 * Fassung 3 sind sie ungültig (fail closed). Sonst ändert sich kein Fall.
 */
const AUSNAHMEN_2 = ["R-010 quelle mcp", "gueltig werkzeug kennung mcp zwei ebenen"];

describe("Obermenge: Korpus der Fassung 2 unter Fassung 3", () => {
  const faelle = K2.cases.filter((fall) => !AUSNAHMEN_2.includes(fall.name));

  it("Zahl der Fälle und die Ausnahmen", () => {
    expect(K2.cases).toHaveLength(279);
    expect(faelle).toHaveLength(279 - AUSNAHMEN_2.length);
    for (const name of AUSNAHMEN_2) {
      const fall = K2.cases.find((entry) => entry.name === name);
      expect(fall?.facts?.toolSource, name).toBe("mcp");
      expect(fall?.expected.outcome, name).not.toBe("deny");
    }
  });

  for (const fall of faelle) {
    it(fall.name, () => {
      expect(rechne(GATE_FORMAT_3, K2, fall)).toStrictEqual({
        ...fall.expected,
        limits: [...fall.expected.limits, ...ENTFALLEN],
      });
    });
  }

  for (const name of AUSNAHMEN_2) {
    it(`Ausnahme: ${name} ist in Fassung 3 ungültig`, () => {
      const fall = K2.cases.find((entry) => entry.name === name) as Fall;
      const decision = rechne(GATE_FORMAT_3, K2, fall);
      expect(decision.outcome).toBe("deny");
      expect(decision.matchedRules).toEqual([]);
      expect((decision.limits as Pruefung[]).every((check) => check.result === "entfaellt")).toBe(
        true,
      );
    });
  }

  for (const fall of K2.limitCases) {
    it(`grenzen: ${fall.name}`, () => {
      expect(GATE_FORMAT_3.checkLimits(fall.action, fall.facts)).toStrictEqual([
        ...fall.expected,
        ...ENTFALLEN,
      ]);
    });
  }
});

describe("Gegenproben: jede Bedingung von R-014 wirkt", () => {
  const passend = K3.cases.filter((fall) => {
    const rules = regeln(K3, fall);
    return rules.some((rule) => rule.id === "R-014" && rule.enabled);
  });

  /** Namen der Fälle, deren Entscheidung sich mit dieser Fassung von R-014 ändert. */
  function geaendert(r014: RuleDefinition): string[] {
    return passend
      .filter((fall) => {
        const rules = regeln(K3, fall).map((rule) => (rule.id === "R-014" ? r014 : rule));
        return (
          JSON.stringify(rechne(GATE_FORMAT_3, K3, fall, rules)) !== JSON.stringify(fall.expected)
        );
      })
      .map((fall) => fall.name);
  }

  it("R-014 abgeschaltet: der erlaubte Lese-Aufruf wird nicht mehr erlaubt", () => {
    expect(geaendert({ ...R014_V1, enabled: false })).toContain("R-014 passt");
  });

  it.each([
    ["botOfConversation", "R-014 nur im direkt-chat"],
    ["trigger", "R-014 ausloeser automation"],
    ["toolKind", "R-014 art schreiben"],
    ["appAccess", "R-014 kein zugriff"],
    ["toolStatus", "R-014 stand neu"],
  ])("ohne Bedingung %s ändert sich ein fester Fall", (fakt, erwartet) => {
    const ohne = {
      ...R014_V1,
      conditions: R014_V1.conditions.filter((condition) => condition.fact !== fakt),
    };
    expect(geaendert(ohne)).toContain(erwartet);
  });

  it("Auslöser ungleich Chat: R-014 passt nicht, es fragt R-005", () => {
    const entry = K3.cases.find((fall) => fall.name === "R-014 ausloeser automation") as Fall;
    expect(entry.expected.outcome).toBe("ask");
    expect(entry.expected.matchedRules).toEqual([{ id: "R-005", version: 1 }]);
  });
});

/*
 * Akteur und Quelle sichert schon die Eingabe ab (nur Bots rufen Werkzeuge auf; Fakten der App gibt
 * es nur bei Quelle `mcp`). Deshalb ändert ohne diese Bedingungen kein fester Fall seine
 * Entscheidung. Geprüft wird hier direkt an der Regel-Auswertung, auf rohen Fakten ohne Schema:
 * Jeder Test weicht in genau einem Fakt vom passenden Aufruf ab.
 */
describe("Bedingungen Akteur und Quelle von R-014, direkt an der Regel-Auswertung", () => {
  const passt = K3.cases.find((fall) => fall.name === "R-014 passt") as Fall;
  const aktion = passt.action as { type: string; actor: string };
  const fakten = passt.facts as Record<string, unknown>;
  const ohne = (fakt: string): RuleDefinition => ({
    ...R014_V1,
    conditions: R014_V1.conditions.filter((condition) => condition.fact !== fakt),
  });

  it("der passende Aufruf: R-014 gilt", () => {
    expect(GATE_FORMAT_3.ruleApplies(R014_V1, aktion, fakten)).toBe(true);
  });

  it("Akteur Besitzer statt Bot: R-014 gilt nicht", () => {
    const besitzer = { ...aktion, actor: "besitzer" };
    expect(GATE_FORMAT_3.ruleApplies(R014_V1, besitzer, fakten)).toBe(false);
    // Gegenprobe im Test: Nur die Bedingung zum Akteur hält diesen Aufruf ab.
    expect(GATE_FORMAT_3.ruleApplies(ohne("akteur"), besitzer, fakten)).toBe(true);
  });

  it("Quelle eingebaut statt mcp: R-014 gilt nicht", () => {
    const eingebaut = { ...fakten, toolSource: "eingebaut" };
    expect(GATE_FORMAT_3.ruleApplies(R014_V1, aktion, eingebaut)).toBe(false);
    // Gegenprobe im Test: Nur die Bedingung zur Quelle hält diesen Aufruf ab.
    expect(GATE_FORMAT_3.ruleApplies(ohne("toolSource"), aktion, eingebaut)).toBe(true);
  });
});

describe("Fassung 3 unter dem Tor der Fassung 4", () => {
  const verbinden = K3.cases.find((fall) => fall.name === "aktion app.verbinden") as Fall;
  const appAufrufFassung3 = K3.cases.find((fall) => fall.name === "R-014 passt") as Fall;
  // Das lebende Tor rechnet mit Fassung 4: Ein Aufruf trägt dort zusätzlich `botPaused`.
  const appAufruf: Fall = {
    ...appAufrufFassung3,
    facts: { ...appAufrufFassung3.facts, botPaused: false },
  };

  it("Fassung 3 steht weiter in der Liste; das Tor entscheidet mit einer höheren", () => {
    expect(GATE_FORMAT).toBe(4);
    expect(currentGateFormat()).not.toBe(GATE_FORMAT_3);
    expect(KNOWN_GATE_FORMAT).toBe(4);
    expect(Object.keys(GATE_FORMATS)).toEqual(["1", "2", "3", "4"]);
    expect(gateFormatSpec(3)).toBe(GATE_FORMAT_3);
    expect(gateFormatSpec(5)).toBeUndefined();
    expect(() =>
      evaluate(appAufruf.action as never, appAufruf.facts as never, ACTIVE_STANDARD_RULES, {
        format: 5,
      }),
    ).toThrow(RangeError);
  });

  it("Fassung 3 rechnet den Aufruf ohne botPaused, mit botPaused ist er für sie ungültig", () => {
    const alt = GATE_FORMAT_3.evaluate(
      appAufrufFassung3.action as never,
      appAufrufFassung3.facts as never,
      ACTIVE_STANDARD_RULES,
    );
    expect(alt.outcome).toBe("allow");
    const mitPause = GATE_FORMAT_3.evaluate(
      appAufruf.action as never,
      appAufruf.facts as never,
      ACTIVE_STANDARD_RULES,
    );
    expect(mitPause.outcome).toBe("deny");
    expect(mitPause.matchedRules).toEqual([]);
  });

  it("die lebenden Standard-Regeln enthalten R-014 genau wie der Vertrag", () => {
    expect(ACTIVE_STANDARD_RULES).toContainEqual(R014_V1);
    const decision = evaluate(
      appAufruf.action as never,
      appAufruf.facts as never,
      ACTIVE_STANDARD_RULES,
    );
    expect(decision.outcome).toBe("allow");
    expect(decision.matchedRules).toEqual([{ id: "R-014", version: 1 }]);
  });

  it("eine Aktion für Apps ist mit Fassung 3 gültig und mit Fassung 2 ungültig", () => {
    const decision = evaluate(
      verbinden.action as never,
      verbinden.facts as never,
      ACTIVE_STANDARD_RULES,
    );
    expect(decision.outcome).toBe("allow");
    const alt = GATE_FORMAT_2.evaluate(verbinden.action, verbinden.facts, ACTIVE_STANDARD_RULES);
    expect(alt.outcome).toBe("deny");
    expect(alt.matchedRules).toEqual([]);
  });

  it("ein Aufruf mit den Fakten der App ist mit Fassung 2 weiter ungültig", () => {
    const decision = GATE_FORMAT_2.evaluate(
      appAufruf.action,
      appAufruf.facts,
      ACTIVE_STANDARD_RULES,
    );
    expect(decision.outcome).toBe("deny");
    expect(decision.matchedRules).toEqual([]);
  });

  it("ohne die Fakten der App passt R-014 nie; es fragt R-005", () => {
    const facts = { ...(appAufruf.facts as Record<string, unknown>) };
    for (const name of Object.keys(MCP_TOOL_CALL_FACTS)) delete facts[name];
    facts.toolSource = "eingebaut";
    delete facts.toolServer;
    facts.toolKey = "eingebaut/doku.nachschlagen";
    facts.toolReach = "intern";
    facts.toolForeign = false;
    const decision = evaluate(appAufruf.action as never, facts as never, ACTIVE_STANDARD_RULES);
    expect(decision.matchedRules).toEqual([{ id: "R-010", version: 1 }]);
    facts.toolKey = "eingebaut/anderes.werkzeug";
    const anders = evaluate(appAufruf.action as never, facts as never, ACTIVE_STANDARD_RULES);
    expect(anders.outcome).toBe("ask");
    expect(anders.matchedRules).toEqual([{ id: "R-005", version: 1 }]);
  });

  function ports(rules: readonly RuleDefinition[]): GatePorts & {
    belege: string[];
    entscheidungen: { gateFormat: number; outcome: string }[];
  } {
    const belege: string[] = [];
    const entscheidungen: { gateFormat: number; outcome: string }[] = [];
    let seq = 1;
    return {
      belege,
      entscheidungen,
      rules: { load: () => ruleSnapshot(rules) },
      receipts: {
        appendDecision: async (record) => {
          belege.push("decision");
          entscheidungen.push({
            gateFormat: record.decision.gateFormat,
            outcome: record.decision.outcome,
          });
          seq += 1;
          return { receiptId: `blg_01m7zempyqasb34830zmcrxq${seq}e` as never, seq };
        },
        appendResult: async () => {
          belege.push("result");
          seq += 1;
          return { receiptId: `blg_01m7zempyqasb34830zmcrxq${seq}e` as never, seq };
        },
      },
      clock: { now: () => new Date(Date.UTC(2026, 10, 22, 10, 0, 0)) },
    };
  }

  async function fehler(promise: Promise<unknown>): Promise<unknown> {
    try {
      await promise;
    } catch (error) {
      return error;
    }
    throw new Error("kein Fehler geworfen");
  }

  it("ein erlaubter App-Aufruf läuft durch das echte Tor: Beleg-Paar mit Fassung 4, ausgeführt", async () => {
    const p = ports(ACTIVE_STANDARD_RULES);
    let ausgefuehrt = false;
    await createGate(p).run(appAufruf.action as never, appAufruf.facts as never, async () => {
      ausgefuehrt = true;
      return { value: 1, result: { status: "ok" } };
    });
    expect(ausgefuehrt).toBe(true);
    expect(p.belege).toEqual(["decision", "result"]);
    expect(p.entscheidungen).toEqual([{ gateFormat: 4, outcome: "allow" }]);
  });

  it("derselbe Aufruf mit geändertem Abdruck wird abgelehnt: nichts ausgeführt, Beleg mit Ablehnung", async () => {
    const p = ports(ACTIVE_STANDARD_RULES);
    let ausgefuehrt = false;
    const facts = {
      ...(appAufruf.facts as Record<string, unknown>),
      confirmedToolDigest: `sha256:${"ee".repeat(32)}`,
    };
    const error = await fehler(
      createGate(p).run(appAufruf.action as never, facts as never, async () => {
        ausgefuehrt = true;
        return { value: 1, result: { status: "ok" } };
      }),
    );
    expect((error as PaiBotError).code).toBe("werkzeug_geaendert");
    expect(ausgefuehrt).toBe(false);
    expect(p.entscheidungen.map((e) => e.outcome)).toEqual(["deny"]);
  });

  it("app.verbinden läuft durch das echte Tor", async () => {
    const p = ports(ACTIVE_STANDARD_RULES);
    await createGate(p).run(verbinden.action as never, verbinden.facts as never, async () => ({
      value: 1,
      result: { status: "ok" },
    }));
    expect(p.entscheidungen).toEqual([{ gateFormat: 4, outcome: "allow" }]);
  });

  it("Fakten einer App ohne alle App-Fakten (nur ein Teil) sind ungültig: kein Beleg", async () => {
    const p = ports(ACTIVE_STANDARD_RULES);
    const facts = { ...(appAufruf.facts as Record<string, unknown>) };
    delete facts.appToolId;
    const error = await fehler(
      createGate(p).run(appAufruf.action as never, facts as never, async () => ({
        value: 1,
        result: { status: "ok" },
      })),
    );
    expect((error as PaiBotError).code).toBe("eingabe_ungueltig");
    expect(p.belege).toEqual([]);
  });
});
