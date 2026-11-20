/**
 * PaiBot – Tests der Vorbedingungen: jede Vorbedingung erfüllt, verletzt und ohne ihren Fakt,
 * Fehlercode, Begründung und Vorrang vor den Grenzen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { ACTIONS, type ActionRequest, type ActionType, type Facts } from "@paibot/shared/aktionen";
import { t } from "@paibot/shared/texte";
import {
  ACTIVE_STANDARD_RULES,
  decisionSchema,
  PRECONDITION_IDS,
  PRECONDITIONS,
  type PreconditionId,
  type RuleCondition,
} from "@paibot/shared/tor";
import { describe, expect, it } from "vitest";
import { checkPreconditions, denialCode, evaluate } from "./evaluate";
import { ACTION_TYPES, sampleAction, sampleFacts } from "./testdaten";

type Definition = {
  name: string;
  actions: readonly ActionType[];
  when?: readonly RuleCondition[];
  require: readonly RuleCondition[];
  errorCode: string;
};

function definition(id: PreconditionId): Definition {
  return PRECONDITIONS[id] as Definition;
}

function decide(type: ActionType, facts: Record<string, unknown>) {
  const decision = evaluate(
    sampleAction(type) as ActionRequest,
    facts as Facts,
    ACTIVE_STANDARD_RULES,
  );
  expect(decisionSchema.safeParse(decision).success).toBe(true);
  return decision;
}

function resultOf(type: ActionType, facts: Record<string, unknown>, name: string) {
  return checkPreconditions(sampleAction(type), facts as Facts).find((c) => c.name === name)
    ?.result;
}

/**
 * Ein Wert, der die Bedingung sicher nicht erfüllt. Vorbedingungen vergleichen Schalter oder zwei
 * Fakten miteinander (dann ein anderer Abdruck als der im Vergleichs-Fakt).
 */
function violating(condition: RuleCondition): unknown {
  expect(condition.op).toBe("eq");
  if (typeof condition.value === "object" && condition.value !== null) {
    expect(Object.keys(condition.value)).toEqual(["fact"]);
    return `hmac-sha256:${"ff".repeat(32)}`;
  }
  expect(typeof condition.value).toBe("boolean");
  return !condition.value;
}

function reasonFor(ids: readonly PreconditionId[]): string {
  return t("tor.vorbedingung_verletzt", {
    vorbedingungen: ids.map((id) => t("tor.grenze", { id, name: t(`regel.${id}`) })).join(", "),
  });
}

/** Je Vorbedingung und Aktion: erfüllt, verletzt, Fakt fehlt. */
const CASES = PRECONDITION_IDS.flatMap((id) =>
  definition(id).actions.map((type) => [id, type] as const),
);

describe("jede Vorbedingung × erfüllt / verletzt / Fakt fehlt", () => {
  it("jede Vorbedingung gilt für mindestens eine Aktion der Verträge", () => {
    for (const id of PRECONDITION_IDS) {
      expect(definition(id).actions.length, id).toBeGreaterThan(0);
      for (const type of definition(id).actions) expect(ACTION_TYPES).toContain(type);
    }
  });

  it.each(CASES)("%s bei %s: erfüllt → ok, die Entscheidung bleibt", (id, type) => {
    const facts = sampleFacts(type) as Record<string, unknown>;
    expect(resultOf(type, facts, definition(id).name)).toBe("ok");
    const decision = decide(type, facts);
    expect(decision.preconditions).toContainEqual({ name: definition(id).name, result: "ok" });
    expect(decision.reason).not.toBe(reasonFor([id]));
  });

  it.each(CASES)("%s bei %s: verletzt → deny mit Fehlercode und Kennung", (id, type) => {
    for (const condition of definition(id).require) {
      const facts = {
        ...(sampleFacts(type) as Record<string, unknown>),
        [condition.fact]: violating(condition),
      };
      const decision = decide(type, facts);
      expect(decision.outcome).toBe("deny");
      expect(decision.preconditions).toContainEqual({
        name: definition(id).name,
        result: "verletzt",
      });
      expect(decision.reason).toBe(reasonFor([id]));
      expect(decision.reason).toContain(id);
      expect(denialCode(decision)).toBe(definition(id).errorCode);
      // Die Regel, die sonst entschieden hätte, bleibt sichtbar.
      expect(decision.matchedRules).toHaveLength(1);
    }
  });

  it.each(CASES)("%s bei %s: Fakt fehlt → verletzt (nie erlaubt)", (id, type) => {
    for (const condition of definition(id).require) {
      const facts = { ...(sampleFacts(type) as Record<string, unknown>) };
      delete facts[condition.fact];
      expect(resultOf(type, facts, definition(id).name)).toBe("verletzt");
      const decision = decide(type, facts);
      expect(decision.outcome).toBe("deny");
      const optional = ACTIONS[type].facts.shape[
        condition.fact as keyof (typeof ACTIONS)[typeof type]["facts"]["shape"]
      ] as { safeParse(value: unknown): { success: boolean } };
      if (optional.safeParse(undefined).success) {
        // Der Fakt ist im Vertrag optional: die Vorbedingung selbst lehnt ab.
        expect(decision.reason).toBe(reasonFor([id]));
        expect(denialCode(decision)).toBe(definition(id).errorCode);
      } else {
        // Der Fakt ist Pflicht: schon die Eingabe ist ungültig.
        expect(decision.matchedRules).toEqual([]);
      }
    }
  });

  it("Fakt aus dem Prototyp zählt nicht", () => {
    const facts = Object.create({ runActive: false, conversationExists: true });
    Object.assign(facts, { credential: "sitzung" });
    const checks = checkPreconditions(sampleAction("nachricht.senden"), facts as Facts);
    expect(checks.map((c) => c.result)).toEqual(["verletzt", "verletzt"]);
  });

  it("V-04 entfällt, wenn die Datenschleuse ausgeschaltet wird", () => {
    const facts = {
      ...sampleFacts("schleuse.umschalten"),
      mode: "off",
      previousMode: "on",
      schleuseInstalled: false,
    };
    expect(resultOf("schleuse.umschalten", facts, "schleuse_eingerichtet")).toBe("entfaellt");
    expect(decide("schleuse.umschalten", facts).outcome).toBe("allow");
  });

  it("Aktionen ohne Vorbedingungen haben eine leere Liste", () => {
    for (const type of ACTION_TYPES) {
      const has = PRECONDITION_IDS.some((id) => definition(id).actions.includes(type));
      if (has) continue;
      expect(checkPreconditions(sampleAction(type), sampleFacts(type))).toEqual([]);
      expect(decide(type, sampleFacts(type) as Record<string, unknown>).preconditions).toEqual([]);
    }
  });
});

describe("Zustände, die das Tor ablehnt", () => {
  it.each([
    ["Nachricht bei aktivem Lauf", "nachricht.senden", { runActive: true }, "V-02", "lauf_aktiv"],
    [
      "Nachricht in nicht vorhandener Unterhaltung",
      "nachricht.senden",
      { conversationExists: false },
      "V-01",
      "nicht_gefunden",
    ],
    [
      "Abbrechen ohne aktiven Lauf",
      "lauf.abbrechen",
      { runActive: false },
      "V-03",
      "nicht_gefunden",
    ],
    [
      "Datenschleuse einschalten ohne eingerichteten Dienst",
      "schleuse.umschalten",
      { mode: "on", schleuseInstalled: false },
      "V-04",
      "schleuse_nicht_installiert",
    ],
    [
      "Passwort ändern ohne bestätigtes Passwort",
      "zugang.passwort_aendern",
      { currentPasswordVerified: false },
      "V-06",
      "passwort_falsch",
    ],
    [
      "Einrichtung abschließen, wenn sie schon fertig ist",
      "einrichtung.abschliessen",
      { setupOpen: false },
      "V-07",
      "einrichtung_fertig",
    ],
    [
      "Werkzeug-Aufruf, wenn der Lauf nicht mehr läuft",
      "werkzeug.aufrufen",
      { runRunning: false },
      "V-05",
      "nicht_gefunden",
    ],
  ] as const)("%s → %s", (_label, type, change, id, code) => {
    const decision = decide(type, { ...(sampleFacts(type) as Record<string, unknown>), ...change });
    expect(decision.outcome).toBe("deny");
    expect(decision.reason).toBe(reasonFor([id]));
    expect(denialCode(decision)).toBe(code);
  });

  it("beide Vorbedingungen verletzt: beide genannt, Code der ersten nach Kennung", () => {
    const decision = decide("nachricht.senden", {
      ...sampleFacts("nachricht.senden"),
      conversationExists: false,
      runActive: true,
    });
    expect(decision.reason).toBe(reasonFor(["V-01", "V-02"]));
    expect(denialCode(decision)).toBe("nicht_gefunden");
  });

  it("verletzte Vorbedingung geht einer verletzten Grenze vor; beide stehen in der Entscheidung", () => {
    const decision = decide("nachricht.senden", {
      ...sampleFacts("nachricht.senden"),
      runActive: true,
      killSwitch: true,
    });
    expect(decision.outcome).toBe("deny");
    expect(decision.reason).toBe(reasonFor(["V-02"]));
    expect(decision.limits).toContainEqual({ name: "not_aus", result: "verletzt", value: true });
    expect(denialCode(decision)).toBe("lauf_aktiv");
  });

  it("verletzte Vorbedingung macht auch aus „fragen“ eine Ablehnung", () => {
    const decision = decide("werkzeug.aufrufen", {
      ...sampleFacts("werkzeug.aufrufen"),
      runRunning: false,
    });
    expect(decision).toMatchObject({ outcome: "deny", stage: "ask" });
    expect(decision.matchedRules).toMatchObject([{ id: "R-005" }]);
  });

  it("ohne verletzte Vorbedingung: Code aus dem Ergebnis", () => {
    const facts = { ...sampleFacts("nachricht.senden"), killSwitch: true };
    expect(denialCode(decide("nachricht.senden", facts))).toBe("abgelehnt");
    expect(denialCode(decide("werkzeug.aufrufen", sampleFacts("werkzeug.aufrufen")))).toBe(
      "regel_fehlt",
    );
  });
});
