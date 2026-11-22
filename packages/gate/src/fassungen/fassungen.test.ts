/**
 * PaiBot – Tests der Fassungen des Tors: Fassung 2 ist die aktuelle und beschreibt genau die
 * heutigen Verträge, Fassung 1 bleibt, wie sie war, und eine unbekannte Fassung wird nie still wie
 * die aktuelle gerechnet.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { ACTIONS, STORED_ACTION_TYPES } from "@paibot/shared/aktionen";
import { ERROR_CODES } from "@paibot/shared/fehler";
import { ACTIVE_STANDARD_RULES, GATE_FORMAT, LIMIT_NAMES } from "@paibot/shared/tor";
import { describe, expect, it } from "vitest";
import { evaluate } from "../evaluate";
import { checkLimits, LIMIT_FUNCTIONS, LIMIT_ORDER } from "../limits/index";
import { sampleAction, sampleFacts } from "../testdaten";
import { GATE_FORMAT_1 } from "./fassung-1";
import korpus1 from "./fassung-1.korpus.json";
import { GATE_FORMAT_2 } from "./fassung-2";
import { currentGateFormat, GATE_FORMATS, gateFormatSpec, KNOWN_GATE_FORMAT } from "./index";

type Fall1 = { name: string; action: { type: string }; facts: unknown };

/** Beispiel-Fakten der Fassung 1: aus den festen Fällen der Fassung 1, nicht aus den heutigen. */
function fall1(type: string): Fall1 {
  const fall = (korpus1 as unknown as { cases: Fall1[] }).cases.find(
    (entry) => entry.name === `aktion ${type}`,
  );
  if (fall === undefined) throw new Error(`Fall fehlt: ${type}`);
  return fall;
}

describe("Fassungen", () => {
  it("das Tor entscheidet mit Fassung 4, der höchsten bekannten", () => {
    expect(GATE_FORMAT).toBe(4);
    expect(KNOWN_GATE_FORMAT).toBe(4);
    expect(currentGateFormat()).toBe(GATE_FORMATS[4]);
    expect(GATE_FORMATS[1]).toBe(GATE_FORMAT_1);
    expect(GATE_FORMATS[2]).toBe(GATE_FORMAT_2);
    expect(gateFormatSpec(5)).toBeUndefined();
    expect(gateFormatSpec(0)).toBeUndefined();
  });

  it("die Grenzen des Tors sind die der aktuellen Fassung", () => {
    expect(LIMIT_ORDER).toEqual(LIMIT_NAMES);
    expect(LIMIT_ORDER).toEqual(currentGateFormat().limitOrder);
    for (const name of LIMIT_ORDER) {
      expect(LIMIT_FUNCTIONS[name]).toBe(currentGateFormat().limits[name]);
    }
    for (const type of ["modell.anfragen", "werkzeug.aufrufen", "nachricht.senden"] as const) {
      const action = sampleAction(type);
      const facts = sampleFacts(type);
      expect(checkLimits(action, facts)).toEqual(currentGateFormat().checkLimits(action, facts));
    }
  });

  it("eine unbekannte Fassung wird nicht gerechnet", () => {
    const action = sampleAction("nachricht.senden");
    const facts = sampleFacts("nachricht.senden");
    expect(() => evaluate(action, facts, ACTIVE_STANDARD_RULES, { format: 5 })).toThrow(RangeError);
    expect(evaluate(action, facts, ACTIVE_STANDARD_RULES, { format: 4 })).toEqual(
      evaluate(action, facts, ACTIVE_STANDARD_RULES),
    );
  });

  it("ab Fassung 2 bringt jede Fassung Deckel-Reihenfolge, Entscheidung je Aktion und Fehlercode mit", () => {
    for (const spec of Object.values(GATE_FORMATS)) {
      if (spec.format < 2) continue;
      expect(spec.capOrder, String(spec.format)).toBeDefined();
      expect(typeof spec.decisionFor, String(spec.format)).toBe("function");
      expect(typeof spec.denialCode, String(spec.format)).toBe("function");
    }
  });
});

describe("die aktuelle Fassung beschreibt die heutigen Verträge", () => {
  it("dieselben Aktionen (die gespeicherten) und Akteure, Fakten passen", () => {
    const spec = currentGateFormat();
    expect([...spec.actions].sort()).toEqual([...STORED_ACTION_TYPES].sort());
    for (const type of STORED_ACTION_TYPES) {
      expect(spec.actor[type], type).toBe(ACTIONS[type].actor);
      expect(spec.facts[type]?.safeParse(sampleFacts(type)).success, type).toBe(true);
      expect(spec.request.safeParse(sampleAction(type)).success, type).toBe(true);
      const lebend = ACTIONS[type].facts as unknown as {
        shape?: object;
        def?: { schema?: { shape?: object } };
      };
      const fassung = spec.facts[type] as unknown as {
        shape?: object;
        def?: { schema?: { shape?: object } };
      };
      expect(Object.keys(lebend.shape ?? lebend.def?.schema?.shape ?? {}).sort(), type).toEqual(
        Object.keys(fassung.shape ?? fassung.def?.schema?.shape ?? {}).sort(),
      );
    }
    expect([...spec.errorCodes]).toEqual([...ERROR_CODES]);
  });

  it("anbieter.speichern kennt den zweiten Schlüssel, und regel_unbekannt ist ein Fehlercode", () => {
    const facts = sampleFacts("anbieter.speichern");
    for (const managementKeySet of [true, false, undefined]) {
      const mit = managementKeySet === undefined ? facts : { ...facts, managementKeySet };
      expect(GATE_FORMAT_2.facts["anbieter.speichern"]?.safeParse(mit).success).toBe(true);
    }
    expect(
      GATE_FORMAT_2.facts["anbieter.speichern"]?.safeParse({ ...facts, managementKeySet: "ja" })
        .success,
    ).toBe(false);
    expect(GATE_FORMAT_2.errorCodes).toContain("regel_unbekannt");
    const ergebnis = { status: "error", code: "regel_unbekannt" };
    expect(GATE_FORMAT_2.result.safeParse(ergebnis).success).toBe(true);
    expect(GATE_FORMAT_1.result.safeParse(ergebnis).success).toBe(false);
  });

  it("Felder im Beleg: streng, gateFormat und Vorbedingungen Pflicht, Deckel genau bei Werkzeug-Aufrufen", () => {
    const decision = {
      gateFormat: 2,
      outcome: "allow",
      stage: "execute",
      rules: [{ id: "R-001", version: 1 }],
      limits: [{ name: "lauf_token", result: "ok", value: 3 }],
      preconditions: [],
      reason: "Grund.",
    };
    expect(GATE_FORMAT_2.decision.safeParse(decision).success).toBe(true);
    const { gateFormat: _g, ...ohneFassung } = decision;
    expect(GATE_FORMAT_2.decision.safeParse(ohneFassung).success).toBe(false);
    expect(GATE_FORMAT_2.decision.safeParse({ ...decision, gateFormat: 1 }).success).toBe(false);
    const { preconditions: _p, ...ohneVorbedingungen } = decision;
    expect(GATE_FORMAT_2.decision.safeParse(ohneVorbedingungen).success).toBe(false);
    const caps = [{ name: "fremd_dann_fragen", result: "entfaellt" }];
    const fuer = (type: string) => GATE_FORMAT_2.decisionFor?.(type);
    expect(fuer("werkzeug.aufrufen")?.safeParse({ ...decision, caps }).success).toBe(true);
    expect(fuer("werkzeug.aufrufen")?.safeParse(decision).success).toBe(false);
    expect(fuer("werkzeug.aufrufen")?.safeParse({ ...decision, caps: [] }).success).toBe(false);
    expect(fuer("modell.anfragen")?.safeParse(decision).success).toBe(true);
    expect(fuer("modell.anfragen")?.safeParse({ ...decision, caps }).success).toBe(false);
    const result = {
      status: "ok",
      servedBy: { provider: "tensorix", model: "m-1" },
      modelReported: "m-1",
      docStand: "0.3.0",
      found: 2,
    };
    expect(GATE_FORMAT_2.result.safeParse(result).success).toBe(true);
    expect(GATE_FORMAT_2.result.safeParse({ ...result, spur: 1 }).success).toBe(false);
    expect(GATE_FORMAT_1.result.safeParse({ status: "ok", modelReported: "m-1" }).success).toBe(
      false,
    );
  });

  it("die Aktion eines Bots mit dem Besitzer als Akteur passt nicht", () => {
    const action = { ...sampleAction("modell.anfragen"), actor: "besitzer" };
    expect(currentGateFormat().request.safeParse(action).success).toBe(false);
  });
});

describe("Fassung 1 bleibt, wie sie war", () => {
  it("alle Aktionen von damals, auch die Freigabe-Aktionen; Fakten aus den festen Fällen passen", () => {
    expect(GATE_FORMAT_1.actions).toHaveLength(27);
    expect(GATE_FORMAT_1.actions).toContain("werkzeug.freigeben");
    expect(GATE_FORMAT_1.actions).toContain("werkzeug.ausfuehren");
    for (const type of GATE_FORMAT_1.actions) {
      const fall = fall1(type);
      expect(GATE_FORMAT_1.facts[type]?.safeParse(fall.facts).success, type).toBe(true);
      expect(GATE_FORMAT_1.request.safeParse(fall.action).success, type).toBe(true);
    }
    expect(GATE_FORMAT_1.caps).toEqual([]);
    expect(GATE_FORMAT_1.limitOrder).toHaveLength(5);
    expect(GATE_FORMAT_1.errorCodes).not.toContain("regel_unbekannt");
    expect(
      GATE_FORMAT_1.facts["anbieter.speichern"]?.safeParse({
        ...(fall1("anbieter.speichern").facts as object),
        managementKeySet: true,
      }).success,
    ).toBe(false);
  });

  it("Felder im Beleg: streng, gateFormat höchstens 1, servedBy im Ergebnis", () => {
    const decision = {
      outcome: "allow",
      stage: "execute",
      rules: [{ id: "R-001", version: 1 }],
      limits: [{ name: "laenge", result: "ok", value: 3 }],
      reason: "Grund.",
    };
    expect(GATE_FORMAT_1.decision.safeParse(decision).success).toBe(true);
    expect(GATE_FORMAT_1.decision.safeParse({ ...decision, gateFormat: 1 }).success).toBe(true);
    expect(GATE_FORMAT_1.decision.safeParse({ ...decision, gateFormat: 2 }).success).toBe(false);
    expect(GATE_FORMAT_1.decision.safeParse({ ...decision, caps: [] }).success).toBe(false);
    const result = { status: "ok", servedBy: { provider: "tensorix", model: "m-1" } };
    expect(GATE_FORMAT_1.result.safeParse(result).success).toBe(true);
    expect(GATE_FORMAT_1.result.safeParse({ ...result, code: "neu_code" }).success).toBe(false);
    expect(GATE_FORMAT_1.result.safeParse({ ...result, spur: 1 }).success).toBe(false);
    expect(GATE_FORMAT_1.result.safeParse({ status: "fertig" }).success).toBe(false);
  });

  it("Fakten der Fassung 2 an modell.anfragen sind für Fassung 1 ungültig", () => {
    const action = fall1("modell.anfragen").action;
    expect(GATE_FORMAT_1.request.safeParse(action).success).toBe(true);
    expect(
      GATE_FORMAT_1.facts["modell.anfragen"]?.safeParse(sampleFacts("modell.anfragen")).success,
    ).toBe(false);
  });
});
