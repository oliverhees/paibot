/**
 * PaiBot – Tests für Aktionen, Akteure, Fakten, Regeln und Entscheidungen des Tors.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { describe, expect, it } from "vitest";
import {
  ACTION_TYPES,
  ACTIONS,
  type ActionRequest,
  actionRequestSchema,
  actorKind,
  actorSchema,
  botActor,
  type Facts,
  factsSchema,
} from "./actions";
import {
  decisionSchema,
  LIMITS_BY_ID,
  ruleConditionSchema,
  ruleDefinitionSchema,
  ruleIdSchema,
  ruleSchema,
  STANDARD_RULE_IDS,
  STANDARD_RULES,
} from "./gate";
import { idSchema, newId } from "./id";

const botId = idSchema("bot").parse("bot_06f8k2m9qz3w7x1c4b5n8p0r2t");
const conversationId = idSchema("conversation").parse("unt_06f8k2m9qz3w7x1c4b5n8p0r2t");
const runId = idSchema("run").parse("lau_06f8k2m9qz3w7x1c4b5n8p0r2t");
const modelId = idSchema("model").parse("mod_06f8k2m9qz3w7x1c4b5n8p0r2t");
const providerId = idSchema("provider").parse("anb_06f8k2m9qz3w7x1c4b5n8p0r2t");

const modelRequest: ActionRequest<"modell.anfragen"> = {
  actionId: newId("action"),
  type: "modell.anfragen",
  actor: botActor(botId),
  target: { conversationId, runId, botId, modelId },
};

const modelFacts: Facts<"modell.anfragen"> = {
  botOfConversation: true,
  providerId,
  providerEnabled: true,
  region: "eu",
  route: "schleuse",
  requestedMode: "on",
  schleuseReachable: true,
  inputChars: 812,
  maxInputChars: 32000,
  maxOutputTokens: 1024,
  botMaxOutputTokens: 2048,
  tokensToday: 0,
  killSwitch: false,
};

describe("Aktionen", () => {
  it("enthalten genau die Aktionen der Basis", () => {
    expect(ACTION_TYPES).toEqual([
      "einrichtung.abschliessen",
      "zugang.anmelden",
      "zugang.abmelden",
      "zugang.alle_abmelden",
      "zugang.passwort_aendern",
      "anbieter.speichern",
      "anbieter.loeschen",
      "modell.waehlen",
      "bot.aendern",
      "schleuse.umschalten",
      "einstellung.aendern",
      "unterhaltung.anlegen",
      "unterhaltung.umbenennen",
      "unterhaltung.loeschen",
      "nachricht.senden",
      "modell.anfragen",
      "lauf.abbrechen",
      "belege.exportieren",
    ]);
    for (const type of ACTION_TYPES) {
      expect(ACTIONS[type].actor).toBe(type === "modell.anfragen" ? "bot" : "besitzer");
    }
  });

  it("prüfen Akteure", () => {
    expect(actorSchema.safeParse("besitzer").success).toBe(true);
    expect(actorSchema.safeParse(`bot:${botId}`).success).toBe(true);
    expect(actorSchema.safeParse("bot:unt_06f8k2m9qz3w7x1c4b5n8p0r2t").success).toBe(false);
    expect(actorSchema.safeParse("Besitzer").success).toBe(false);
    expect(actorKind(botActor(botId))).toBe("bot");
    expect(actorKind("besitzer")).toBe("besitzer");
  });

  it("nehmen gültige Anfragen an", () => {
    expect(actionRequestSchema.parse(modelRequest)).toEqual(modelRequest);
    const owner = {
      actionId: newId("action"),
      type: "schleuse.umschalten",
      actor: "besitzer",
      target: {},
    };
    expect(actionRequestSchema.parse(owner)).toEqual(owner);
  });

  it("lehnen falschen Akteur, falsches Ziel und unbekannte Aktionen ab", () => {
    const bad: unknown[] = [
      { ...modelRequest, actor: "besitzer" },
      { ...modelRequest, type: "nachricht.senden", target: { conversationId, messageId: runId } },
      { ...modelRequest, target: { conversationId, runId, botId } },
      { ...modelRequest, target: { ...modelRequest.target, extra: 1 } },
      { ...modelRequest, type: "werkzeug.ausfuehren" },
      { ...modelRequest, actionId: runId },
    ];
    for (const value of bad) expect(actionRequestSchema.safeParse(value).success).toBe(false);
  });

  it("prüfen Fakten je Aktion, nur mit Ganzzahlen", () => {
    const schema = factsSchema("modell.anfragen");
    expect(schema.parse(modelFacts)).toEqual(modelFacts);
    expect(schema.safeParse({ ...modelFacts, inputChars: 1.5 }).success).toBe(false);
    expect(schema.safeParse({ ...modelFacts, route: "direkt" }).success).toBe(false);
    expect(schema.safeParse({ ...modelFacts, prompt: "Hallo" }).success).toBe(false);
    expect(schema.safeParse({ ...modelFacts, dailyTokenBudget: 100000 }).success).toBe(true);
    expect(
      factsSchema("bot.aendern").safeParse({ credential: "sitzung", fields: [] }).success,
    ).toBe(false);
    expect(
      factsSchema("zugang.anmelden").parse({ credential: "passwort", remember: true }),
    ).toEqual({
      credential: "passwort",
      remember: true,
    });
  });

  it("Passwort ändern und Unterhaltung umbenennen sind Verwaltungsaktionen des Besitzers", () => {
    for (const type of ["zugang.passwort_aendern", "unterhaltung.umbenennen"] as const) {
      expect(ACTIONS[type].actor).toBe("besitzer");
      expect(factsSchema(type).parse({ credential: "sitzung" })).toEqual({ credential: "sitzung" });
      expect(factsSchema(type).safeParse({}).success).toBe(false);
      expect(factsSchema(type).safeParse({ credential: "sitzung", title: "x" }).success).toBe(
        false,
      );
    }
    const besitzerRegel = STANDARD_RULES.find((rule) => rule.id === "R-001");
    expect(besitzerRegel?.action).toBe("*");
  });
});

describe("Regeln", () => {
  it("Standard-Regeln sind gültig und tragen die lesbaren IDs", () => {
    expect(STANDARD_RULES.map((rule) => rule.id)).toEqual([...STANDARD_RULE_IDS]);
    for (const rule of STANDARD_RULES) expect(ruleDefinitionSchema.parse(rule)).toEqual(rule);
    expect(Object.keys(LIMITS_BY_ID)).toEqual(["G-01", "G-02", "G-03", "G-04", "G-05"]);
  });

  it("Regel-IDs sind lesbar oder erzeugt", () => {
    expect(ruleIdSchema.safeParse("R-001").success).toBe(true);
    expect(ruleIdSchema.safeParse(newId("rule")).success).toBe(true);
    expect(ruleIdSchema.safeParse("R-1").success).toBe(false);
    expect(ruleIdSchema.safeParse("G-01").success).toBe(false);
  });

  it("Bedingungen haben eine kleine, feste Form", () => {
    expect(
      ruleConditionSchema.safeParse({
        fact: "inputChars",
        op: "lte",
        value: { fact: "maxInputChars" },
      }).success,
    ).toBe(true);
    expect(
      ruleConditionSchema.safeParse({ fact: "region", op: "in", value: ["eu", "local"] }).success,
    ).toBe(true);
    expect(ruleConditionSchema.safeParse({ fact: "region", op: "in", value: "eu" }).success).toBe(
      false,
    );
    expect(ruleConditionSchema.safeParse({ fact: "region", op: "eq", value: ["eu"] }).success).toBe(
      false,
    );
    expect(
      ruleConditionSchema.safeParse({ fact: "region", op: "match", value: "e.*" }).success,
    ).toBe(false);
    expect(ruleConditionSchema.safeParse({ fact: "a.b", op: "eq", value: 1 }).success).toBe(false);
    expect(ruleConditionSchema.safeParse({ fact: "x", op: "eq", value: 0.5 }).success).toBe(false);
  });

  it("gespeicherte Regeln haben eine Zeit und gültige Felder", () => {
    const stored = { ...STANDARD_RULES[0], createdAt: "2026-11-20T10:00:00.000Z" };
    expect(ruleSchema.parse(stored)).toEqual(stored);
    expect(ruleSchema.safeParse({ ...stored, version: 0 }).success).toBe(false);
    expect(ruleSchema.safeParse({ ...stored, action: "alles" }).success).toBe(false);
    expect(ruleSchema.safeParse({ ...stored, stage: "fragen" }).success).toBe(false);
  });
});

describe("Entscheidung", () => {
  it("kennt alle Ergebnisse und Stufen", () => {
    const decision = {
      outcome: "allow",
      stage: "execute",
      matchedRules: [{ id: "R-002", version: 1 }],
      limits: [
        { name: "schleuse_gefordert", result: "ok" },
        { name: "laenge", result: "ok", value: 812 },
      ],
      reason: "Bot darf antworten",
    };
    expect(decisionSchema.parse(decision)).toEqual(decision);
    for (const outcome of ["deny", "ask", "prepare"]) {
      expect(decisionSchema.safeParse({ ...decision, outcome }).success).toBe(true);
    }
    expect(decisionSchema.safeParse({ ...decision, outcome: "vielleicht" }).success).toBe(false);
    expect(
      decisionSchema.safeParse({ ...decision, limits: [{ name: "unbekannt", result: "ok" }] })
        .success,
    ).toBe(false);
  });
});
