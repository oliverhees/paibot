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
import { isNotImplemented } from "@paibot/stub";
import { describe, expect, it } from "vitest";
import * as gate from "./index";

describe("Schnittstelle", () => {
  it("reicht die Verträge unverändert weiter", () => {
    expect(gate.STANDARD_RULES).toBe(shared.STANDARD_RULES);
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
        limits: [],
        reason: "Dafür gibt es noch keine Regel.",
      },
      { decision: ref, result: { ...ref, seq: 3 } },
    );
    expect(denied).toBeInstanceOf(shared.PaiBotError);
    expect(denied.code).toBe("regel_fehlt");
    expect(denied.status).toBe(403);
    expect(denied.text).toBe("Dafür gibt es noch keine Regel.");
    expect(gate.isGateDenied(denied)).toBe(true);
  });

  it("noch nicht umgesetzte Funktionen melden das", () => {
    let caught: unknown;
    try {
      gate.createGate({
        rules: { listActive: async () => [] },
        receipts: {
          appendDecision: async () => ({ receiptId: shared.newId("receipt"), seq: 1 }),
          appendResult: async () => ({ receiptId: shared.newId("receipt"), seq: 2 }),
        },
        clock: { now: () => new Date(0) },
      });
    } catch (error) {
      caught = error;
    }
    expect(isNotImplemented(caught)).toBe(true);
  });
});
