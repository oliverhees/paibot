/**
 * PaiBot – Tests der Tor-Fassung 5: setzt genau den Vertrag um und ist eine Obermenge von
 * Fassung 4. Jeder feste Fall der Fassungen 1 bis 4 ergibt unter Fassung 5 dieselbe Entscheidung
 * wie unter Fassung 4, wenn die neuen Pflicht-Fakten mit den Füllwerten des Vertrags ergänzt werden;
 * die neuen Grenzen stehen dahinter. Ausnahmen sind nur Fälle, die Fassung 4 als ungültig ablehnt,
 * weil es die Aktion oder den Wert dort noch nicht gibt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-27
 */

import { STORED_ACTION_TYPES, UNSTORED_ACTION_TYPES } from "@paibot/shared/aktionen";
import { ACTIVE_STANDARD_RULES, GATE_FORMAT, type RuleDefinition } from "@paibot/shared/tor";
import {
  AUFTRAG_ACTION_SHAPES,
  AUFTRAG_ACTION_TYPES,
  CAPS_5,
  ERROR_CODES_5,
  FUELLWERTE_5,
  LIMITS_BY_ID_5,
  NEW_FACTS_5,
  PRECONDITIONS_5,
  STANDARD_RULES_5,
} from "@paibot/shared/tor-fassung-5";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import korpus1 from "./fassung-1.korpus.json";
import korpus2 from "./fassung-2.korpus.json";
import korpus3 from "./fassung-3.korpus.json";
import { GATE_FORMAT_4 } from "./fassung-4";
import korpus4 from "./fassung-4.korpus.json";
import { GATE_FORMAT_5 } from "./fassung-5";
import korpus5 from "./fassung-5.korpus.json";
import { GATE_FORMATS, KNOWN_GATE_FORMAT } from "./index";

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
}

interface GrenzenFall {
  name: string;
  action: { type: string };
  facts: Record<string, unknown>;
}

type Korpus = {
  ruleSets?: Record<string, RuleDefinition[]>;
  cases: Fall[];
  limitCases?: GrenzenFall[];
};

const K1 = korpus1 as unknown as Korpus;
const K2 = korpus2 as unknown as Korpus;
const K3 = korpus3 as unknown as Korpus;
const K4 = korpus4 as unknown as Korpus;
const K5 = korpus5 as unknown as Korpus;

function regeln(korpus: Korpus, fall: Fall): RuleDefinition[] {
  if (typeof fall.rules !== "string") return fall.rules;
  const satz = korpus.ruleSets?.[fall.rules];
  if (satz === undefined) throw new Error(`Regel-Satz ${fall.rules} fehlt.`);
  return satz;
}

/** JSON-Schema eines Zod-Schemas; nicht darstellbare Teile (Prüf-Funktionen) als „beliebig“. */
function json(schema: unknown): unknown {
  return z.toJSONSchema(schema as z.ZodType, { unrepresentable: "any" });
}

const NEUE_GRENZEN_5 = Object.values(LIMITS_BY_ID_5) as string[];

/** Füllwerte des Vertrags für die neuen Pflicht-Fakten. */
function fuellen5(type: string | undefined, facts: Record<string, unknown> | null): unknown {
  if (facts === null || type === undefined || !Object.hasOwn(FUELLWERTE_5, type)) return facts;
  return { ...facts, ...FUELLWERTE_5[type as keyof typeof FUELLWERTE_5] };
}

/** Füllwert der Fassung 4 (`botPaused`), damit ältere Fälle unter Fassung 4 gültig bleiben. */
const BOT_BEREIT_4 = ["modell.anfragen", "nachricht.senden", "werkzeug.aufrufen"];
function fuellen4(type: string | undefined, facts: Record<string, unknown> | null): unknown {
  if (facts === null || type === undefined || !BOT_BEREIT_4.includes(type)) return facts;
  if (Object.hasOwn(facts, "botPaused")) return facts;
  return { ...facts, botPaused: false };
}

/** Füllwerte der Fassung 2 für Fälle des Korpus 1 (wie in `obermenge.test.ts`). */
function fuellen2(type: string | undefined, facts: Record<string, unknown> | null): unknown {
  if (facts === null) return facts;
  if (type === "modell.anfragen") {
    const input = facts.inputChars;
    const output = facts.maxOutputTokens;
    const zahl = (v: unknown): v is number =>
      typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
    return {
      ...facts,
      step: 0,
      maxSteps: 1,
      runTokens: 0,
      stepTokenEstimate: zahl(input) && zahl(output) ? Math.ceil(input / 4) + output : 0,
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

function entscheide(
  format: typeof GATE_FORMAT_4,
  korpus: Korpus,
  fall: Fall,
  facts: unknown,
): Record<string, unknown> {
  const liste = regeln(korpus, fall);
  const action = fall.action as never;
  const decision =
    fall.stand === undefined
      ? format.evaluate(action, facts as never, liste)
      : format.evaluate(action, facts as never, { stand: fall.stand, rules: liste as never });
  const { reason: _reason, ...rest } = decision as unknown as Record<string, unknown>;
  return rest;
}

function gueltig(format: typeof GATE_FORMAT_4, action: unknown, facts: unknown): boolean {
  if (!format.request.safeParse(action).success) return false;
  const type = (action as { type: string }).type;
  return format.facts[type]?.safeParse(facts).success === true;
}

/**
 * Was Fassung 5 zur Entscheidung der Fassung 4 dazulegt, wenn nur die Füllwerte ergänzt sind: die
 * dreizehn neuen Grenzen, alle `entfaellt`, außer G-42 an einem gültigen `werkzeug.aufrufen` (ok,
 * Art `keiner`).
 */
function neueGrenzen(type: string | undefined, ok: boolean): Pruefung[] {
  return NEUE_GRENZEN_5.map((name) =>
    ok && type === "werkzeug.aufrufen" && name === "werkzeug_im_auftrag"
      ? { name, result: "ok", value: "keiner" }
      : { name, result: "entfaellt" },
  );
}

function erwartet5(f4: Record<string, unknown>, type: string | undefined, ok: boolean) {
  return { ...f4, limits: [...(f4.limits as Pruefung[]), ...neueGrenzen(type, ok)] };
}

/**
 * Fälle, die Fassung 4 ablehnt, weil es die Aktion oder den Wert erst in Fassung 5 gibt. Unter
 * Fassung 5 sind sie nicht mehr „ungültige Eingabe“; sie stehen deshalb nicht im Obermengen-Test.
 */
const NEU_IN_5 = [
  "aktion auftrag.uebergeben unbekannt",
  "aktion auftrag.uebergeben unbekannt trotz Regel alles erlaubt",
  "aktion auftrag.melden unbekannt",
  "aktion auftrag.melden unbekannt trotz Regel alles erlaubt",
  "aktion auftrag.abbrechen unbekannt",
  "aktion auftrag.abbrechen unbekannt trotz Regel alles erlaubt",
  "aktion auftrag.abnehmen unbekannt",
  "aktion auftrag.abnehmen unbekannt trotz Regel alles erlaubt",
  "aktion auftrag.zurueckgeben unbekannt",
  "aktion auftrag.zurueckgeben unbekannt trotz Regel alles erlaubt",
  "aktion auftrag.zettel_aendern unbekannt",
  "aktion auftrag.zettel_aendern unbekannt trotz Regel alles erlaubt",
  "aktion auftrag.budget_erhoehen unbekannt",
  "aktion auftrag.budget_erhoehen unbekannt trotz Regel alles erlaubt",
  "team.entwurf_erstellen: Herkunft pai gibt es in Fassung 4 nicht",
];

function obermenge(
  titel: string,
  korpus: Korpus,
  vorher: (type: string | undefined, facts: Record<string, unknown> | null) => unknown,
) {
  describe(titel, () => {
    const faelle = korpus.cases.filter((fall) => !NEU_IN_5.includes(fall.name));
    for (const fall of faelle) {
      it(fall.name, () => {
        const type = fall.action?.type;
        const facts4 = fuellen4(type, vorher(type, fall.facts) as Record<string, unknown> | null);
        const facts5 = fuellen5(type, facts4 as Record<string, unknown> | null);
        const f4 = entscheide(GATE_FORMAT_4, korpus, fall, facts4);
        const ok = gueltig(GATE_FORMAT_4, fall.action, facts4);
        expect(gueltig(GATE_FORMAT_5, fall.action, facts5), "gültig wie in Fassung 4").toBe(ok);
        expect(entscheide(GATE_FORMAT_5, korpus, fall, facts5)).toStrictEqual(
          erwartet5(f4, type, ok),
        );
      });
    }
    for (const fall of korpus.limitCases ?? []) {
      it(`grenzen: ${fall.name}`, () => {
        const type = fall.action.type;
        const facts4 = fuellen4(type, vorher(type, fall.facts) as Record<string, unknown>);
        const facts5 = fuellen5(type, facts4 as Record<string, unknown>);
        const ok = type === "werkzeug.aufrufen";
        expect(GATE_FORMAT_5.checkLimits(fall.action, facts5)).toStrictEqual([
          ...GATE_FORMAT_4.checkLimits(fall.action, facts4),
          ...neueGrenzen(type, ok),
        ]);
      });
    }
  });
}

obermenge("Obermenge: Korpus der Fassung 4 unter Fassung 5", K4, (_type, facts) => facts);
obermenge("Obermenge: Korpus der Fassung 3 unter Fassung 5", K3, (_type, facts) => facts);
obermenge("Obermenge: Korpus der Fassung 2 unter Fassung 5", K2, (_type, facts) => facts);
obermenge("Obermenge: Korpus der Fassung 1 unter Fassung 5", K1, fuellen2);

describe("Obermenge: Ausnahmen sind genau die Fälle, die es erst in Fassung 5 gibt", () => {
  it("jede Ausnahme steht im Korpus 4 und ist dort ungültig", () => {
    for (const name of NEU_IN_5) {
      const fall = K4.cases.find((entry) => entry.name === name);
      expect(fall, name).toBeDefined();
      expect(gueltig(GATE_FORMAT_4, fall?.action, fall?.facts), name).toBe(false);
    }
  });

  it("Herkunft pai ist in Fassung 5 gültig, Herkunft datei und assistent weiter nicht", () => {
    for (const [herkunft, ok] of [
      ["pai", true],
      ["datei", false],
      ["assistent", false],
    ] as const) {
      const fall = K4.cases.find(
        (entry) =>
          entry.name === `team.entwurf_erstellen: Herkunft ${herkunft} gibt es in Fassung 4 nicht`,
      );
      expect(gueltig(GATE_FORMAT_5, fall?.action, fall?.facts), herkunft).toBe(ok);
    }
  });
});

describe("Fassung 5 setzt genau den Vertrag um", () => {
  it("Aktionen: die der Fassung 4 und die sieben neuen; Akteur wie im Vertrag", () => {
    expect([...GATE_FORMAT_5.actions]).toEqual([...GATE_FORMAT_4.actions, ...AUFTRAG_ACTION_TYPES]);
    for (const type of AUFTRAG_ACTION_TYPES) {
      expect(GATE_FORMAT_5.actor[type], type).toBe(AUFTRAG_ACTION_SHAPES[type].actorKind);
    }
  });

  it("Aktionen der Fassung 4: Ziel und Akteur unverändert; Fakten unverändert außer den neuen", () => {
    const geaendert = [...Object.keys(NEW_FACTS_5), "team.entwurf_erstellen"];
    for (const type of GATE_FORMAT_4.actions) {
      expect(json(GATE_FORMAT_5.target[type]), type).toEqual(json(GATE_FORMAT_4.target[type]));
      expect(GATE_FORMAT_5.actor[type], type).toBe(GATE_FORMAT_4.actor[type]);
      if (geaendert.includes(type)) continue;
      expect(json(GATE_FORMAT_5.facts[type]), type).toEqual(json(GATE_FORMAT_4.facts[type]));
    }
  });

  it("neue Fakten an modell.anfragen, werkzeug.aufrufen und nachricht.senden wie im Vertrag", () => {
    for (const [type, neu] of Object.entries(NEW_FACTS_5)) {
      const f4 = json(GATE_FORMAT_4.facts[type]) as {
        properties: Record<string, unknown>;
        required: string[];
      };
      const f5 = json(GATE_FORMAT_5.facts[type]) as typeof f4;
      const properties = Object.fromEntries(
        Object.entries(neu).map(([name, schema]) => {
          const { $schema: _s, ...rest } = json(schema) as Record<string, unknown>;
          return [name, rest];
        }),
      );
      expect(f5.properties, type).toEqual({ ...f4.properties, ...properties });
      const pflicht = Object.entries(neu)
        .filter(([, schema]) => !(schema as z.ZodType).safeParse(undefined).success)
        .map(([name]) => name);
      expect(f5.required, type).toEqual([...f4.required, ...pflicht]);
    }
  });

  it("neue Aktionen: Ziel und Fakten wie im gemeinsamen Vertrag", () => {
    for (const type of AUFTRAG_ACTION_TYPES) {
      const shape = AUFTRAG_ACTION_SHAPES[type];
      expect(json(GATE_FORMAT_5.target[type]), type).toEqual(json(z.strictObject(shape.target)));
      expect(json(GATE_FORMAT_5.facts[type]), type).toEqual(json(z.strictObject(shape.facts)));
    }
  });

  it("Grenzen, Vorbedingungen, Deckel und Fehlercodes: Fassung 4 und das Neue dahinter", () => {
    expect([...GATE_FORMAT_5.limitOrder]).toEqual([...GATE_FORMAT_4.limitOrder, ...NEUE_GRENZEN_5]);
    expect(GATE_FORMAT_5.preconditions).toEqual({
      ...GATE_FORMAT_4.preconditions,
      ...JSON.parse(JSON.stringify(PRECONDITIONS_5)),
    });
    expect(GATE_FORMAT_5.caps).toEqual([
      ...GATE_FORMAT_4.caps,
      ...JSON.parse(JSON.stringify(CAPS_5)),
    ]);
    expect(GATE_FORMAT_5.capOrder).toEqual([
      ...(GATE_FORMAT_4.capOrder ?? []),
      "fremd_dann_verboten",
    ]);
    expect([...GATE_FORMAT_5.errorCodes]).toEqual([...GATE_FORMAT_4.errorCodes, ...ERROR_CODES_5]);
  });

  it("die Standard-Regeln der Fassung 5 im Vertrag sind genau die im Korpus", () => {
    const standard = K5.ruleSets?.standard ?? [];
    for (const rule of STANDARD_RULES_5) {
      expect(
        standard.find((entry) => entry.id === rule.id),
        rule.id,
      ).toEqual(JSON.parse(JSON.stringify(rule)));
    }
  });

  it("jede neue Vorbedingung hängt nur an neuen Aktionen, jede alte bleibt, wie sie war", () => {
    for (const id of Object.keys(PRECONDITIONS_5)) {
      const { actions } = GATE_FORMAT_5.preconditions[id] as { actions: readonly string[] };
      for (const type of actions)
        expect(AUFTRAG_ACTION_TYPES as readonly string[], id).toContain(type);
    }
    for (const [id, vorbedingung] of Object.entries(GATE_FORMAT_4.preconditions)) {
      expect(GATE_FORMAT_5.preconditions[id], id).toEqual(vorbedingung);
    }
  });

  it("Felder im Beleg: Fassung 5, neue Namen und Codes nur hier", () => {
    const decision = {
      gateFormat: 5,
      outcome: "deny",
      stage: "ask",
      rules: [{ id: "R-015", version: 1 }],
      limits: [{ name: "auftrag_tiefe", result: "verletzt", value: 4 }],
      preconditions: [{ name: "uebergabe_weg_erlaubt", result: "verletzt" }],
      caps: [{ name: "fremd_dann_verboten", result: "nicht_noetig" }],
      reason: "Grund.",
    };
    const fuer = GATE_FORMAT_5.decisionFor?.("auftrag.uebergeben");
    expect(fuer?.safeParse(decision).success).toBe(true);
    expect(fuer?.safeParse({ ...decision, gateFormat: 4 }).success).toBe(false);
    expect(GATE_FORMAT_4.decisionFor?.("bot.loeschen")?.safeParse(decision).success).toBe(false);
    for (const code of ERROR_CODES_5) {
      expect(GATE_FORMAT_5.result.safeParse({ status: "denied", code }).success, code).toBe(true);
      expect(GATE_FORMAT_4.result.safeParse({ status: "denied", code }).success, code).toBe(false);
    }
  });
});

describe("Fassung 5 ist in Kraft", () => {
  // Gegenprobe: `GATE_FORMAT = 4` → rot.
  it("das Tor entscheidet mit Fassung 5, der höchsten bekannten; sie steht in der Liste", () => {
    expect(GATE_FORMAT).toBe(5);
    expect(KNOWN_GATE_FORMAT).toBe(5);
    expect(Object.keys(GATE_FORMATS)).toEqual(["1", "2", "3", "4", "5"]);
    expect(GATE_FORMATS[5]).toBe(GATE_FORMAT_5);
  });

  it("die neuen Aktionen sind gespeichert (Regeln und Belege kennen sie, Migration 0019)", () => {
    for (const type of AUFTRAG_ACTION_TYPES) {
      expect(UNSTORED_ACTION_TYPES as readonly string[], type).not.toContain(type);
      expect(STORED_ACTION_TYPES as readonly string[], type).toContain(type);
    }
  });

  it("die aktiven Standard-Regeln sind die des Korpus 5 (ohne R-007, R-008), mit R-009 bei 900", () => {
    const korpus = (korpus5 as { ruleSets: Record<string, RuleDefinition[]> }).ruleSets.standard;
    const erwartet = (korpus ?? []).filter((rule) => rule.id !== "R-007" && rule.id !== "R-008");
    expect([...ACTIVE_STANDARD_RULES].sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      [...erwartet].sort((a, b) => a.id.localeCompare(b.id)),
    );
    expect(ACTIVE_STANDARD_RULES.find((rule) => rule.id === "R-009")?.priority).toBe(900);
  });
});
