/**
 * PaiBot – Tests der Fassung 2 über die festen Fälle hinaus: Fehlercode einer Ablehnung je
 * Ursache und Reihenfolge, gedeckeltes „fragen“, Vergleich mit fehlendem Fakt, fehlender Not-Aus,
 * fremde Werkzeuge beim Deckel.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { newId } from "@paibot/shared/ids";
import { ACTIVE_STANDARD_RULES, type RuleDefinition } from "@paibot/shared/tor";
import { describe, expect, it } from "vitest";
import { denialCode } from "../evaluate";
import { createGate, isGateDenied } from "../gate";
import { ruleSnapshot } from "../regel-hash";
import { sampleAction, sampleFacts } from "../testdaten";
import { GATE_FORMAT_2, limitLaufToken } from "./fassung-2";

const ERLAUBT_WERKZEUG: RuleDefinition = {
  id: "R-100",
  version: 1,
  action: "werkzeug.aufrufen",
  effect: "allow",
  stage: "execute",
  conditions: [{ fact: "akteur", op: "eq", value: "bot" }],
  priority: 10,
  source: "owner",
  enabled: true,
  title: "Testregel",
  reason: "Werkzeuge erlaubt.",
};

type Typ = "modell.anfragen" | "werkzeug.aufrufen";

/** Fakten der Beispiele ohne `botPaused`: Der Fakt gehört erst zu Fassung 4, Fassung 2 kennt ihn nicht. */
function fakten2(type: Typ): Record<string, unknown> {
  const { botPaused: _botPaused, ...rest } = sampleFacts(type) as Record<string, unknown>;
  return rest;
}

function entscheide(
  type: Typ,
  change: Record<string, unknown>,
  rules: RuleDefinition[] = [...ACTIVE_STANDARD_RULES],
) {
  const facts = { ...fakten2(type), ...change };
  return GATE_FORMAT_2.evaluate(sampleAction(type), facts, rules);
}

/** Code der Fassung 2 und Code, den das Tor benutzt (`evaluate.ts#denialCode`). */
function codes(decision: ReturnType<typeof entscheide>) {
  const ofFormat = GATE_FORMAT_2.denialCode?.(decision);
  expect(denialCode(decision)).toBe(ofFormat);
  return ofFormat;
}

describe("Fehlercode einer Ablehnung in Fassung 2", () => {
  it.each([
    ["G-16", "modell.anfragen", { step: 1 }],
    ["G-17", "werkzeug.aufrufen", { callsInRun: 16 }],
    ["G-18", "modell.anfragen", { runTokens: 499000 }],
  ] as const)("%s allein verletzt: limit_erreicht", (_id, type, change) => {
    const decision = entscheide(type, change, [ERLAUBT_WERKZEUG, ...ACTIVE_STANDARD_RULES]);
    expect(decision.outcome).toBe("deny");
    expect(codes(decision)).toBe("limit_erreicht");
  });

  it("G-01 bis G-04 bleiben abgelehnt", () => {
    expect(codes(entscheide("modell.anfragen", { region: "non_eu" }))).toBe("abgelehnt");
    expect(codes(entscheide("modell.anfragen", { tokensToday: 100000 }))).toBe("abgelehnt");
  });

  it("Not-Aus geht den Grenzen eines Laufs vor: angehalten", () => {
    const decision = entscheide("modell.anfragen", {
      killSwitch: true,
      runTokens: 499000,
      step: 1,
    });
    expect(decision.limits.filter((l) => l.result === "verletzt").map((l) => l.name)).toEqual([
      "not_aus",
      "lauf_schritte",
      "lauf_token",
    ]);
    expect(codes(decision)).toBe("angehalten");
    const werkzeug = entscheide("werkzeug.aufrufen", { killSwitch: true, callsInRun: 16 });
    expect(codes(werkzeug)).toBe("angehalten");
  });

  it("eine verletzte Vorbedingung geht einer Grenze vor: V-12 vor G-17", () => {
    const decision = entscheide("werkzeug.aufrufen", { toolOffered: false, callsInRun: 16 });
    expect(codes(decision)).toBe("werkzeug_unbekannt");
  });

  it("von mehreren verletzten Vorbedingungen zählt die erste nach Kennung", () => {
    const decision = entscheide("werkzeug.aufrufen", { inputValid: false, toolOffered: false });
    expect(codes(decision)).toBe("werkzeug_unbekannt");
    expect(codes(entscheide("werkzeug.aufrufen", { inputValid: false, callIndexInStep: 8 }))).toBe(
      "werkzeug_eingabe_ungueltig",
    );
  });

  it("fragen ohne Deckel: regel_fehlt", () => {
    const decision = entscheide("werkzeug.aufrufen", {});
    expect(decision.outcome).toBe("ask");
    expect(codes(decision)).toBe("regel_fehlt");
  });

  it("gedeckeltes fragen: Beleg regel_fehlt, als Werkzeug-Aufruf freigabe_noetig", async () => {
    const facts = {
      ...fakten2("werkzeug.aufrufen"),
      untrustedInput: true,
      toolKind: "schreiben",
    };
    const decision = entscheide("werkzeug.aufrufen", facts, [ERLAUBT_WERKZEUG]);
    expect(decision).toMatchObject({
      outcome: "ask",
      caps: [{ name: "fremd_dann_fragen", result: "gedeckelt" }],
    });
    expect(codes(decision)).toBe("regel_fehlt");

    // Durch das Tor (vollständiger Regelstand): R-005 fragt, ohne Deckel. Eine eigene Regel, die
    // ein schreibendes Werkzeug erlaubt, steht im Betrieb hinter R-005 und kommt nicht dazu; den
    // Deckel selbst zeigt die Entscheidung oben. Hier gilt: „fragen“ wird im Beleg
    // `regel_fehlt` und für den Werkzeug-Aufruf `freigabe_noetig`.
    const results: unknown[] = [];
    let seq = 0;
    const gate = createGate({
      rules: { load: () => ruleSnapshot(ACTIVE_STANDARD_RULES) },
      receipts: {
        appendDecision: async () => ({ receiptId: newId("receipt"), seq: ++seq }),
        appendResult: async (record) => {
          results.push(record.result);
          return { receiptId: newId("receipt"), seq: ++seq };
        },
      },
      clock: { now: () => new Date(Date.UTC(2026, 10, 21, 12, 0, 0)) },
    });
    const error = await gate
      // Das lebende Tor rechnet mit Fassung 4: dort gehört `botPaused` zu den Fakten des Aufrufs.
      .run(sampleAction("werkzeug.aufrufen"), { ...facts, botPaused: false } as never, async () => {
        throw new Error("darf nicht laufen");
      })
      .catch((caught: unknown) => caught);
    expect(isGateDenied(error)).toBe(true);
    if (!isGateDenied(error)) return;
    expect(results).toEqual([{ status: "denied", code: "regel_fehlt" }]);
    expect(error.toolCallDecision()).toMatchObject({
      outcome: "deny",
      errorCode: "freigabe_noetig",
    });
  });
});

describe("Große Zahlen bei G-18", () => {
  const MAX = Number.MAX_SAFE_INTEGER;
  const token = (change: Record<string, unknown>) =>
    entscheide("modell.anfragen", change).limits.find((l) => l.name === "lauf_token");

  it("Summe außerhalb der sicheren Ganzzahlen: verletzt, ohne Wert, limit_erreicht", () => {
    for (const change of [
      { runTokens: MAX - 10, stepTokenEstimate: 1227, maxRunTokens: MAX },
      { runTokens: MAX, stepTokenEstimate: MAX, maxRunTokens: MAX },
    ]) {
      expect(token(change)).toEqual({ name: "lauf_token", result: "verletzt" });
      expect(codes(entscheide("modell.anfragen", change))).toBe("limit_erreicht");
    }
  });

  it("Summe genau auf der Grenze: ok mit Wert", () => {
    expect(token({ runTokens: MAX - 1227, stepTokenEstimate: 1227, maxRunTokens: MAX })).toEqual({
      name: "lauf_token",
      result: "ok",
      value: MAX,
    });
  });

  it("ein Summand außerhalb der sicheren Ganzzahlen ist ungültige Eingabe", () => {
    const decision = entscheide("modell.anfragen", { runTokens: MAX + 1, maxRunTokens: MAX });
    expect(decision.outcome).toBe("deny");
    expect(decision.limits.every((l) => l.result === "entfaellt")).toBe(true);
    // Die Grenze selbst bleibt auch ohne Eingabeprüfung verletzt und ohne Wert.
    const facts = { ...fakten2("modell.anfragen"), runTokens: MAX + 1 };
    expect(limitLaufToken({ type: "modell.anfragen" }, facts)).toEqual({
      name: "lauf_token",
      result: "verletzt",
    });
  });
});

describe("Fälle außerhalb der festen Fälle", () => {
  it("Vergleich mit einem fehlenden Fakt gilt nie, auch nicht als 0", () => {
    const facts = { callIndexInStep: 0 };
    for (const op of ["lt", "lte", "eq", "gte"] as const) {
      expect(
        GATE_FORMAT_2.conditionHolds(
          { fact: "callIndexInStep", op, value: { fact: "fehlt" } },
          facts,
        ),
        op,
      ).toBe(false);
    }
  });

  it("fehlt der Not-Aus bei einer betroffenen Aktion, gilt G-05 als verletzt", () => {
    const { killSwitch: _, ...ohne } = fakten2("modell.anfragen");
    const checks = GATE_FORMAT_2.checkLimits({ type: "modell.anfragen" }, ohne);
    expect(checks.find((c) => c.name === "not_aus")).toEqual({
      name: "not_aus",
      result: "verletzt",
    });
  });

  it("Deckel hängt an fremden Inhalten im Lauf, nicht am fremden Werkzeug selbst", () => {
    const fremd = { toolForeign: true, toolKind: "schreiben" };
    expect(entscheide("werkzeug.aufrufen", fremd, [ERLAUBT_WERKZEUG]).caps).toEqual([
      { name: "fremd_dann_fragen", result: "entfaellt" },
    ]);
    expect(
      entscheide("werkzeug.aufrufen", { ...fremd, untrustedInput: true }, [ERLAUBT_WERKZEUG]).caps,
    ).toEqual([{ name: "fremd_dann_fragen", result: "gedeckelt" }]);
  });
});
