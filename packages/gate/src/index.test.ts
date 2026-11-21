/**
 * PaiBot – Tests für die Schnittstelle des Tors.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import * as shared from "@paibot/shared";
import { describe, expect, it } from "vitest";
import * as gate from "./index";

describe("Schnittstelle", () => {
  it("reicht die Verträge unverändert weiter", () => {
    expect(gate.ACTIVE_STANDARD_RULES).toBe(shared.ACTIVE_STANDARD_RULES);
    expect(gate.STANDARD_RULE_VERSIONS).toBe(shared.STANDARD_RULE_VERSIONS);
    expect(gate.PRECONDITIONS).toBe(shared.PRECONDITIONS);
    expect(gate.LIMITS_BY_ID).toBe(shared.LIMITS_BY_ID);
    expect(gate.OUTCOMES).toBe(shared.OUTCOMES);
    expect(gate.STAGES).toBe(shared.STAGES);
    expect(gate.ACTIONS).toBe(shared.ACTIONS);
    expect(gate.decisionSchema).toBe(shared.decisionSchema);
    expect(gate.ruleDefinitionSchema).toBe(shared.ruleDefinitionSchema);
    expect(gate.actionRequestSchema).toBe(shared.actionRequestSchema);
  });

  it("exportiert Entscheidung, Grenzen und Tor", async () => {
    const api: Record<string, unknown> = await import("./index");
    for (const name of [
      "evaluate",
      "ruleApplies",
      "conditionHolds",
      "checkLimits",
      "createGate",
      "isGatePermit",
      "checkPreconditions",
      "denialCode",
      "hashRule",
      "ruleSnapshot",
      "verifyRuleSnapshot",
    ]) {
      expect(typeof api[name]).toBe("function");
    }
    expect(gate.LIMIT_ORDER).toEqual(Object.values(shared.LIMITS_BY_ID));
    expect(Object.keys(gate.LIMIT_FUNCTIONS).sort()).toEqual([...gate.LIMIT_NAMES].sort());
  });

  it("ask und prepare werden als fehlende Regel gemeldet, deny als Ablehnung", () => {
    expect(gate.OUTCOME_ERROR_CODE).toEqual({
      deny: "abgelehnt",
      ask: "regel_fehlt",
      prepare: "regel_fehlt",
    });
  });

  it("GateDenied ist ein Fehler mit Code und Grund", () => {
    const ref = { receiptId: shared.newId("receipt"), seq: 2 };
    const denied = new gate.GateDenied(
      {
        outcome: "ask",
        stage: "ask",
        matchedRules: [],
        ruleStand: 1,
        limits: [],
        preconditions: [],
        reason: "Dafür gibt es noch keine Regel.",
      },
      { decision: ref, result: { ...ref, seq: 3 } },
      { actionId: shared.newId("action"), type: "werkzeug.aufrufen" },
    );
    expect(denied).toBeInstanceOf(shared.PaiBotError);
    expect(denied.code).toBe("regel_fehlt");
    expect(denied.status).toBe(403);
    expect(denied.text).toBe("Dafür gibt es noch keine Regel.");
    expect(gate.isGateDenied(denied)).toBe(true);
    expect(denied.waitsForApproval).toBe(true);
  });

  it("createGate liefert ein Tor mit run", () => {
    const tor = gate.createGate({
      rules: { load: () => gate.ruleSnapshot([]) },
      receipts: {
        appendDecision: async () => ({ receiptId: shared.newId("receipt"), seq: 1 }),
        appendResult: async () => ({ receiptId: shared.newId("receipt"), seq: 2 }),
      },
      clock: { now: () => new Date(0) },
    });
    expect(typeof tor.run).toBe("function");
  });

  it("kennt alle Aktionen der Verträge, auch Besitzer-Aktionen und Werkzeug-Aufrufe", () => {
    expect(gate.ACTION_TYPES).toEqual(shared.ACTION_TYPES);
    expect(gate.ACTION_TYPES).toHaveLength(21);
    expect(gate.ACTION_TYPES).toContain("werkzeug.aufrufen");
    expect(gate.ACTION_TYPES).toContain("zugang.passwort_aendern");
    expect(gate.ACTION_TYPES).toContain("unterhaltung.umbenennen");
  });

  it("stellt keine Funktion zum Ausstellen von Berechtigungen bereit", async () => {
    const api: Record<string, unknown> = await import("./index");
    expect(Object.keys(api).filter((name) => /issue|revoke|permit/i.test(name))).toEqual([
      "isGatePermit",
    ]);
  });
});

describe("im Browser nutzbar", () => {
  it("Prüfsumme und Regelstand kommen aus dem Haupteinstieg", () => {
    expect(typeof gate.hashRule).toBe("function");
    expect(typeof gate.ruleSnapshot).toBe("function");
    expect(typeof gate.verifyRuleSnapshot).toBe("function");
  });
});
