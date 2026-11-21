/**
 * PaiBot – Tests der Fassungen des Tors: Fassung 1 ist die aktuelle, beschreibt genau die heutigen
 * Aktionen, und eine unbekannte Fassung wird nie still wie die aktuelle gerechnet.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { ACTIONS } from "@paibot/shared/aktionen";
import { ERROR_CODES } from "@paibot/shared/fehler";
import { ACTIVE_STANDARD_RULES, GATE_FORMAT, LIMIT_NAMES } from "@paibot/shared/tor";
import { describe, expect, it } from "vitest";
import { evaluate } from "../evaluate";
import { checkLimits, LIMIT_FUNCTIONS, LIMIT_ORDER } from "../limits/index";
import { ACTION_TYPES, sampleAction, sampleFacts } from "../testdaten";
import { GATE_FORMAT_1 } from "./fassung-1";
import { currentGateFormat, GATE_FORMATS, gateFormatSpec, KNOWN_GATE_FORMAT } from "./index";

describe("Fassungen", () => {
  it("das Tor entscheidet mit Fassung 1, der höchsten bekannten", () => {
    expect(GATE_FORMAT).toBe(1);
    expect(KNOWN_GATE_FORMAT).toBe(1);
    expect(currentGateFormat()).toBe(GATE_FORMATS[1]);
    expect(GATE_FORMATS[1]).toBe(GATE_FORMAT_1);
    expect(gateFormatSpec(2)).toBeUndefined();
    expect(gateFormatSpec(0)).toBeUndefined();
  });

  it("die Grenzen des Tors sind die der aktuellen Fassung", () => {
    expect(LIMIT_ORDER).toEqual(LIMIT_NAMES);
    expect(LIMIT_ORDER).toEqual(currentGateFormat().limitOrder);
    for (const name of LIMIT_ORDER) {
      expect(LIMIT_FUNCTIONS[name]).toBe(currentGateFormat().limits[name]);
    }
    const action = sampleAction("modell.anfragen");
    const facts = sampleFacts("modell.anfragen");
    expect(checkLimits(action, facts)).toEqual(currentGateFormat().checkLimits(action, facts));
  });

  it("eine unbekannte Fassung wird nicht gerechnet", () => {
    const action = sampleAction("nachricht.senden");
    const facts = sampleFacts("nachricht.senden");
    expect(() => evaluate(action, facts, ACTIVE_STANDARD_RULES, { format: 2 })).toThrow(RangeError);
    expect(evaluate(action, facts, ACTIVE_STANDARD_RULES, { format: 1 })).toEqual(
      evaluate(action, facts, ACTIVE_STANDARD_RULES),
    );
  });
});

describe("Fassung 1 beschreibt die heutigen Aktionen", () => {
  it("dieselben Aktionen und Akteure, Fakten passen", () => {
    expect([...GATE_FORMAT_1.actions].sort()).toEqual([...ACTION_TYPES].sort());
    for (const type of ACTION_TYPES) {
      expect(GATE_FORMAT_1.actor[type], type).toBe(ACTIONS[type].actor);
      expect(GATE_FORMAT_1.facts[type]?.safeParse(sampleFacts(type)).success, type).toBe(true);
      expect(GATE_FORMAT_1.request.safeParse(sampleAction(type)).success, type).toBe(true);
      expect(Object.keys(ACTIONS[type].facts.shape).sort()).toEqual(
        Object.keys((GATE_FORMAT_1.facts[type] as unknown as { shape: object }).shape).sort(),
      );
    }
    expect([...GATE_FORMAT_1.errorCodes].sort()).toEqual([...ERROR_CODES].sort());
    expect(GATE_FORMAT_1.caps).toEqual([]);
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

  it("die Aktion eines Bots mit dem Besitzer als Akteur passt nicht", () => {
    const action = { ...sampleAction("modell.anfragen"), actor: "besitzer" };
    expect(GATE_FORMAT_1.request.safeParse(action).success).toBe(false);
    expect(GATE_FORMAT_1.request.safeParse({ ...action, type: "werkzeug.irgendwas" }).success).toBe(
      false,
    );
  });
});
