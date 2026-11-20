/**
 * PaiBot – Tests für den Test-Zugang des Tors (withTestPermit).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { PaiBotError } from "@paibot/shared/fehler";
import { newId } from "@paibot/shared/ids";
import { ACTIVE_STANDARD_RULES } from "@paibot/shared/tor";
import { describe, expect, it } from "vitest";
import pkg from "../package.json";
import { createGate, type GatePorts } from "./gate";
import { isGatePermit } from "./permit";
import { ruleSnapshot } from "./regel-hash";
import { sampleAction, sampleFacts } from "./testdaten";
import { withTestPermit } from "./testing";

describe("withTestPermit", () => {
  it("stellt eine Berechtigung aus, die isGatePermit nur während der Ausführung erkennt", async () => {
    const action = sampleAction("modell.anfragen");
    const facts = sampleFacts("modell.anfragen");
    let kept: unknown;
    const value = await withTestPermit(action, facts, (permit) => {
      kept = permit;
      expect(isGatePermit(permit, "modell.anfragen")).toBe(true);
      expect(isGatePermit(permit, "bot.aendern")).toBe(false);
      expect(isGatePermit({ ...permit })).toBe(false);
      expect(Object.isFrozen(permit)).toBe(true);
      expect(Object.isFrozen(permit.facts)).toBe(true);
      expect(permit.facts).toEqual(facts);
      expect(permit.facts).not.toBe(facts);
      expect(permit.actionId).toBe(action.actionId);
      return 42;
    });
    expect(value).toBe(42);
    expect(isGatePermit(kept)).toBe(false);
  });

  it("zieht die Berechtigung auch nach einem Fehler zurück", async () => {
    let kept: unknown;
    const error = await withTestPermit(
      sampleAction("modell.anfragen"),
      sampleFacts("modell.anfragen"),
      async (permit) => {
        kept = permit;
        throw new Error("kaputt");
      },
    ).catch((e: unknown) => e);
    expect(error).toMatchObject({ message: "kaputt" });
    expect(isGatePermit(kept)).toBe(false);
  });

  it("prüft Aktion und Fakten wie das Tor; ungültig heißt: fn läuft nicht", async () => {
    let called = false;
    const run = (action: unknown, facts: unknown) =>
      withTestPermit(action as never, facts as never, () => {
        called = true;
      }).catch((e: unknown) => e);
    const badActor = { ...sampleAction("modell.anfragen"), actor: "besitzer" };
    const badFacts = { ...sampleFacts("modell.anfragen"), extra: 1 };
    for (const error of [
      await run(badActor, sampleFacts("modell.anfragen")),
      await run(sampleAction("modell.anfragen"), badFacts),
    ]) {
      expect(error).toBeInstanceOf(PaiBotError);
      expect((error as PaiBotError).code).toBe("eingabe_ungueltig");
    }
    expect(called).toBe(false);
  });

  it("die Berechtigung hat dieselbe Form wie eine aus gate.run", async () => {
    const action = sampleAction("nachricht.senden");
    const facts = sampleFacts("nachricht.senden");
    const decisionReceiptId = newId("receipt");
    const issuedAt = new Date(Date.UTC(2026, 10, 20, 10, 0, 0));
    const fromTest = await withTestPermit(action, facts, (p) => structuredClone(p), {
      decisionReceiptId,
      issuedAt,
    });

    const ports: GatePorts = {
      rules: { load: () => ruleSnapshot(ACTIVE_STANDARD_RULES) },
      receipts: {
        appendDecision: async () => ({ receiptId: decisionReceiptId, seq: 1 }),
        appendResult: async () => ({ receiptId: newId("receipt"), seq: 2 }),
      },
      clock: { now: () => issuedAt },
    };
    const { value: fromGate } = await createGate(ports).run(action, facts, async (p) => ({
      value: structuredClone(p),
      result: { status: "ok" },
    }));
    expect(fromTest).toEqual(fromGate);
    expect(Object.keys(fromTest)).toEqual(Object.keys(fromGate));
  });

  it("Test-Berechtigung für modell.anfragen trägt das Ziel wie eine aus gate.run, unveränderlich", async () => {
    const facts = sampleFacts("modell.anfragen");
    await withTestPermit(sampleAction("modell.anfragen"), facts, (permit) => {
      expect(isGatePermit(permit, "modell.anfragen")).toBe(true);
      expect(permit.facts.targetOrigin).toBe(facts.targetOrigin);
      expect(permit.facts.targetDigest).toBe(facts.targetDigest);
      expect(() => {
        (permit.facts as { targetDigest?: string }).targetDigest = `sha256:${"3".repeat(64)}`;
      }).toThrow(TypeError);
      expect(permit.facts.targetDigest).toBe(facts.targetDigest);
    });
  });

  it("gibt es nur über den eigenen Unterpfad, nicht über den Einstieg des Pakets", async () => {
    const root: Record<string, unknown> = await import("./index");
    expect(root.withTestPermit).toBeUndefined();
    expect(pkg.exports["./testing"]).toBe("./src/testing.ts");
  });
});
