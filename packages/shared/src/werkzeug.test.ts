/**
 * PaiBot – Tests: Aktion für Werkzeug-Aufrufe und gespeicherter Werkzeug-Aufruf.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { describe, expect, it } from "vitest";
import {
  ACTION_TYPES,
  ACTIONS,
  STORED_ACTION_TYPES,
  TOOL_ACTION_TYPES,
  TOOL_ACTIONS,
  toolActionTypeSchema,
  UNSTORED_ACTION_TYPES,
} from "./actions";
import { ruleDefinitionSchema, STANDARD_RULE_VERSIONS, STANDARD_RULES } from "./gate";
import { newId } from "./id";
import { TOOL_CALL_STATUSES, toolCallSchema } from "./objects";

const time = "2026-11-20T10:00:00.000Z";
const digest = `hmac-sha256:${"0a".repeat(32)}`;

const facts = {
  botOfConversation: true,
  runRunning: true,
  toolName: "kalender_lesen",
  toolSource: "eingebaut",
  toolKind: "lesen",
  argsDigest: digest,
  killSwitch: false,
};

describe("Aktion werkzeug.aufrufen", () => {
  it("steht in ACTIONS; gespeichert werden alle Aktionen außer den noch nicht speicherbaren", () => {
    expect(TOOL_ACTION_TYPES).toEqual(["werkzeug.aufrufen", "werkzeug.ausfuehren"]);
    expect(ACTION_TYPES).toContain("werkzeug.aufrufen");
    expect(UNSTORED_ACTION_TYPES).toEqual(["werkzeug.freigeben", "werkzeug.ausfuehren"]);
    expect(STORED_ACTION_TYPES).toEqual(
      ACTION_TYPES.filter((type) => !(UNSTORED_ACTION_TYPES as readonly string[]).includes(type)),
    );
    expect(STORED_ACTION_TYPES).toContain("werkzeug.aufrufen");
    expect(ACTIONS["werkzeug.aufrufen"].actor).toBe("bot");
    expect(TOOL_ACTIONS["werkzeug.aufrufen"]).toBe(ACTIONS["werkzeug.aufrufen"]);
    expect(toolActionTypeSchema.parse("werkzeug.aufrufen")).toBe("werkzeug.aufrufen");
  });

  it("veraltete Namen zeigen auf dieselben Werte, solange es sie gibt", () => {
    expect(STANDARD_RULES.map((rule) => [rule.id, rule.version])).toEqual([
      ["R-001", 1],
      ["R-002", 1],
      ["R-999", 1],
    ]);
    for (const rule of STANDARD_RULES) expect(STANDARD_RULE_VERSIONS).toContain(rule);
  });

  it("Fakten nennen Werkzeug, Quelle und Art, die Argumente nur als Abdruck", () => {
    const schema = ACTIONS["werkzeug.aufrufen"].facts;
    expect(schema.parse(facts)).toEqual(facts);
    expect(schema.safeParse({ ...facts, toolSource: "mcp", toolServer: "notizen" }).success).toBe(
      true,
    );
    expect(schema.safeParse({ ...facts, args: { datum: "heute" } }).success).toBe(false);
    expect(schema.safeParse({ ...facts, argsDigest: `sha256:${"0".repeat(64)}` }).success).toBe(
      false,
    );
    expect(schema.safeParse({ ...facts, toolName: "rm -rf" }).success).toBe(false);
    expect(schema.safeParse({ ...facts, toolKind: "loeschen" }).success).toBe(false);
  });

  it("der Server steht genau dann in den Fakten, wenn die Quelle mcp ist", () => {
    for (const type of ["werkzeug.aufrufen", "werkzeug.ausfuehren"] as const) {
      const schema = ACTIONS[type].facts;
      const base =
        type === "werkzeug.aufrufen"
          ? facts
          : {
              ...facts,
              approvalGranted: true,
              approvalConsumed: false,
              approvalExpired: false,
              approvalArgsDigest: digest,
            };
      expect(schema.safeParse(base).success, type).toBe(true);
      expect(schema.safeParse({ ...base, toolSource: "mcp", toolServer: "notizen" }).success).toBe(
        true,
      );
      // mcp ohne Server und ein Server ohne mcp sind ungültig.
      expect(schema.safeParse({ ...base, toolSource: "mcp" }).success, type).toBe(false);
      expect(schema.safeParse({ ...base, toolServer: "notizen" }).success, type).toBe(false);
    }
  });

  it("Freigabe und Ausführung sind eigene Aktionen mit Verweis auf den wartenden Aufruf", () => {
    expect(ACTIONS["werkzeug.freigeben"].actor).toBe("besitzer");
    expect(ACTIONS["werkzeug.ausfuehren"].actor).toBe("bot");
    const toolCallId = newId("action");
    expect(
      ACTIONS["werkzeug.freigeben"].target.safeParse({
        conversationId: newId("conversation"),
        runId: newId("run"),
        toolCallId,
      }).success,
    ).toBe(true);
    const ausfuehren = ACTIONS["werkzeug.ausfuehren"].target;
    const target = {
      conversationId: newId("conversation"),
      runId: newId("run"),
      botId: newId("bot"),
      toolCallId,
      approvalId: newId("action"),
    };
    expect(ausfuehren.safeParse(target).success).toBe(true);
    const { approvalId: _a, ...ohneFreigabe } = target;
    expect(ausfuehren.safeParse(ohneFreigabe).success).toBe(false);
    const freigabe = ACTIONS["werkzeug.freigeben"].facts;
    const answer = {
      credential: "sitzung",
      answer: "erteilen",
      callWaiting: true,
      callExpired: false,
      argsDigest: digest,
      waitingArgsDigest: digest,
    };
    expect(freigabe.safeParse(answer).success).toBe(true);
    expect(freigabe.safeParse({ ...answer, answer: "vielleicht" }).success).toBe(false);
    expect(freigabe.safeParse({ ...answer, input: { datum: "heute" } }).success).toBe(false);
  });

  it("Ziel nennt Unterhaltung, Lauf und Bot", () => {
    const target = ACTIONS["werkzeug.aufrufen"].target;
    const ok = {
      conversationId: newId("conversation"),
      runId: newId("run"),
      botId: newId("bot"),
    };
    expect(target.safeParse(ok).success).toBe(true);
    expect(target.safeParse({ ...ok, callId: "call_1" }).success).toBe(false);
  });

  it("Regeln dürfen sich auf die Aktion beziehen", () => {
    const rule = {
      id: "R-100",
      version: 1,
      action: "werkzeug.aufrufen",
      effect: "ask",
      stage: "ask",
      conditions: [],
      priority: 50,
      source: "owner",
      enabled: true,
      title: "Fragen",
      reason: "Fragen.",
    };
    expect(ruleDefinitionSchema.safeParse(rule).success).toBe(true);
  });
});

describe("Werkzeug-Aufruf im Verlauf", () => {
  const record = {
    actionId: newId("action"),
    conversationId: newId("conversation"),
    runId: newId("run"),
    messageId: newId("message"),
    position: 0,
    callId: "call_1",
    name: "kalender_lesen",
    source: "eingebaut",
    kind: "lesen",
    input: { datum: "2026-11-20" },
    argsDigest: digest,
    status: "succeeded",
    decisionReceiptId: newId("receipt"),
    resultReceiptId: newId("receipt"),
    resultStatus: "ok",
    output: { termine: [] },
    createdAt: time,
    updatedAt: time,
    finishedAt: time,
  };

  it("nimmt einen erledigten Aufruf an", () => {
    expect(toolCallSchema.parse(record)).toEqual(record);
    expect(TOOL_CALL_STATUSES).toContain("waiting_approval");
  });

  it("lehnt unbekannte Zustände und fremde IDs ab", () => {
    expect(toolCallSchema.safeParse({ ...record, status: "fertig" }).success).toBe(false);
    expect(toolCallSchema.safeParse({ ...record, actionId: newId("run") }).success).toBe(false);
    expect(toolCallSchema.safeParse({ ...record, position: -1 }).success).toBe(false);
  });
});
