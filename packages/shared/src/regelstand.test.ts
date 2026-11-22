/**
 * PaiBot – Tests: Fassungen der Standard-Regeln, Nachweis je Aktion und Vorbedingungen des Tors.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { describe, expect, it } from "vitest";
import { ACTION_TYPES, ACTIONS, CREDENTIALS, TOOL_ACTION_TYPES } from "./actions";
import { ERROR_CODES } from "./errors";
import {
  ACTIVE_STANDARD_RULES,
  CREDENTIAL_SCOPE,
  decisionSchema,
  FALLBACK_PRIORITY,
  GATE_FORMAT,
  OWN_RULE_PRIORITY,
  PRECONDITION_IDS,
  PRECONDITIONS,
  preconditionCheckSchema,
  preconditionsFor,
  priorityFitsSource,
  ruleContent,
  ruleRefSchema,
  STANDARD_PRIORITY_MAX,
  STANDARD_RULE_VERSIONS,
  storedRuleRefSchema,
  UNSTORED_STANDARD_RULE_VERSIONS,
} from "./gate";
import { t } from "./i18n";
import { receiptDecisionSchema } from "./receipts";

const HASH = `sha256:${"ab".repeat(32)}`;

function factNames(action: string): string[] {
  const all = ACTIONS as Record<string, { facts: { shape: object } }>;
  return Object.keys(all[action]?.facts.shape ?? {});
}

describe("Fassungen der Standard-Regeln", () => {
  it("jede Kennung mit Fassung gibt es genau einmal, Fassungen zählen ab 1 lückenlos", () => {
    const keys = STANDARD_RULE_VERSIONS.map((rule) => `${rule.id}@${rule.version}`);
    expect(new Set(keys).size).toBe(keys.length);
    const byId = new Map<string, number[]>();
    for (const rule of STANDARD_RULE_VERSIONS) {
      byId.set(rule.id, [...(byId.get(rule.id) ?? []), rule.version]);
    }
    for (const versions of byId.values()) {
      expect(versions).toEqual(versions.map((_, index) => index + 1));
    }
  });

  it("die aktiven Regeln sind je Kennung die höchste Fassung", () => {
    const latest = new Map<string, number>();
    for (const rule of STANDARD_RULE_VERSIONS) {
      latest.set(rule.id, Math.max(latest.get(rule.id) ?? 0, rule.version));
    }
    expect(ACTIVE_STANDARD_RULES).toHaveLength(latest.size);
    for (const rule of ACTIVE_STANDARD_RULES) expect(rule.version).toBe(latest.get(rule.id));
    for (const rule of ACTIVE_STANDARD_RULES) expect(STANDARD_RULE_VERSIONS).toContain(rule);
  });

  it("die erste Fassung bleibt unverändert erhalten", () => {
    for (const id of ["R-001", "R-002", "R-999"]) {
      expect(
        STANDARD_RULE_VERSIONS.filter((rule) => rule.id === id && rule.version === 1),
      ).toHaveLength(1);
    }
  });

  it("der Einrichtungs-Code gilt nur für die Einrichtung, das Passwort nur fürs Anmelden", () => {
    // Erste passende Regel wie im Tor: Vorrang, dann ID; Bedingungen hier nur akteur/credential.
    const decide = (action: string, credential: string) => {
      const facts: Record<string, string> = { akteur: "besitzer", credential };
      const holds = (c: { fact: string; op: string; value: unknown }) => {
        const left = facts[c.fact];
        if (left === undefined) return false;
        if (c.op === "eq") return left === c.value;
        if (c.op === "ne") return left !== c.value;
        if (c.op === "in") return (c.value as unknown[]).includes(left);
        return false;
      };
      const winner = [...ACTIVE_STANDARD_RULES]
        .filter((rule) => rule.action === "*" || rule.action === action)
        .filter((rule) => rule.conditions.every(holds))
        .sort((a, b) => a.priority - b.priority || (a.id < b.id ? -1 : 1))[0];
      return winner?.effect;
    };
    for (const action of ACTION_TYPES) {
      if ((TOOL_ACTION_TYPES as readonly string[]).includes(action) || action === "modell.anfragen")
        continue;
      for (const credential of CREDENTIALS) {
        const scope = CREDENTIAL_SCOPE[credential];
        const allowed = scope === "*" || (scope as readonly string[]).includes(action);
        expect(decide(action, credential), `${action} ${credential}`).toBe(
          allowed ? "allow" : "deny",
        );
      }
    }
  });

  it("Werkzeug-Aufrufe fragen nach, ohne Regel bleibt es bei der Auffang-Regel", () => {
    const tool = ACTIVE_STANDARD_RULES.find((rule) => rule.action === "werkzeug.aufrufen");
    expect(tool).toMatchObject({ id: "R-005", effect: "ask", stage: "ask" });
    expect(ACTIVE_STANDARD_RULES.at(-1)?.id).toBe("R-999");
  });

  it("die Auffang-Regel begründet mit demselben Satz wie der Fehlertext", () => {
    const fallback = ACTIVE_STANDARD_RULES.find((rule) => rule.id === "R-999");
    expect(fallback?.reason).toBe(t("fehler.regel_fehlt"));
  });

  it("ruleContent nimmt nur den Inhalt, ohne Zeit, Nummer und Prüfsumme", () => {
    const stored = { ...ACTIVE_STANDARD_RULES[0], createdAt: "x", seq: 4, hash: HASH };
    expect(ruleContent(stored)).toEqual(ACTIVE_STANDARD_RULES[0]);
    expect(Object.keys(ruleContent(stored))).not.toContain("createdAt");
  });

  it("Verweise auf Regeln tragen die Prüfsumme des Inhalts; in alten Belegen darf sie fehlen", () => {
    expect(ruleRefSchema.parse({ id: "R-001", version: 2, hash: HASH })).toBeTruthy();
    expect(ruleRefSchema.safeParse({ id: "R-001", version: 2 }).success).toBe(false);
    expect(ruleRefSchema.safeParse({ id: "R-001", version: 2, hash: "ab" }).success).toBe(false);
    expect(storedRuleRefSchema.safeParse({ id: "R-001", version: 2 }).success).toBe(true);
    expect(storedRuleRefSchema.safeParse({ id: "R-001", version: 2, hash: "ab" }).success).toBe(
      false,
    );
  });

  it("Prioritäten in festen Bändern je Quelle", () => {
    for (const rule of [...STANDARD_RULE_VERSIONS, ...UNSTORED_STANDARD_RULE_VERSIONS]) {
      expect(priorityFitsSource(rule.source, rule.priority)).toBe(true);
    }
    expect(priorityFitsSource("standard", OWN_RULE_PRIORITY.min)).toBe(false);
    expect(priorityFitsSource("owner", STANDARD_PRIORITY_MAX)).toBe(false);
    expect(priorityFitsSource("owner", OWN_RULE_PRIORITY.min)).toBe(true);
    expect(priorityFitsSource("proposal", OWN_RULE_PRIORITY.max)).toBe(true);
    expect(priorityFitsSource("owner", FALLBACK_PRIORITY)).toBe(false);
  });
});

describe("Vorbedingungen", () => {
  it("haben fortlaufende IDs, eindeutige Namen und gültige Fehlercodes", () => {
    // V-01 bis V-14 fortlaufend, danach die Nummern der Vorbedingungen für Apps.
    expect(PRECONDITION_IDS).toEqual([
      ...Array.from({ length: 14 }, (_, i) => `V-${String(i + 1).padStart(2, "0")}`),
      "V-19",
      "V-38",
    ]);
    const names = PRECONDITION_IDS.map((id) => PRECONDITIONS[id].name);
    expect(new Set(names).size).toBe(names.length);
    for (const id of PRECONDITION_IDS) {
      expect(ERROR_CODES).toContain(PRECONDITIONS[id].errorCode);
    }
  });

  it("beziehen sich nur auf bekannte Aktionen und auf Fakten dieser Aktionen", () => {
    for (const id of PRECONDITION_IDS) {
      const pre = PRECONDITIONS[id];
      for (const action of pre.actions) {
        expect(ACTION_TYPES).toContain(action);
        const conditions = [...("when" in pre ? pre.when : []), ...pre.require];
        for (const condition of conditions) {
          expect(factNames(action), `${id} ${action}`).toContain(condition.fact);
        }
      }
    }
  });

  it("nennen je Aktion die passenden Vorbedingungen in fester Reihenfolge", () => {
    expect(preconditionsFor("nachricht.senden")).toEqual(["V-01", "V-02"]);
    expect(preconditionsFor("lauf.abbrechen")).toEqual(["V-03"]);
    expect(preconditionsFor("schleuse.umschalten")).toEqual(["V-04"]);
    expect(preconditionsFor("werkzeug.aufrufen")).toEqual(["V-05", "V-12", "V-13", "V-14"]);
    expect(preconditionsFor("zugang.passwort_aendern")).toEqual(["V-06"]);
    expect(preconditionsFor("einrichtung.abschliessen")).toEqual(["V-07"]);
    expect(preconditionsFor("modell.anfragen")).toEqual([]);
  });

  it("stehen in Entscheidung und Beleg, zusammen mit dem Regelstand", () => {
    const decision = {
      outcome: "deny",
      stage: "execute",
      matchedRules: [{ id: "R-001", version: 2, hash: HASH }],
      limits: [],
      preconditions: [
        { name: "unterhaltung_vorhanden", result: "ok" },
        { name: "kein_lauf_aktiv", result: "verletzt" },
      ],
      ruleStand: 7,
      reason: "Abgelehnt.",
    };
    expect(decisionSchema.parse(decision)).toEqual(decision);
    const { matchedRules, ...rest } = decision;
    expect(
      receiptDecisionSchema.parse({ ...rest, rules: matchedRules, gateFormat: GATE_FORMAT }),
    ).toBeTruthy();
    expect(preconditionCheckSchema.safeParse({ name: "frei_erfunden", result: "ok" }).success).toBe(
      false,
    );
    expect(decisionSchema.safeParse({ ...decision, ruleStand: 0 }).success).toBe(false);
  });
});
