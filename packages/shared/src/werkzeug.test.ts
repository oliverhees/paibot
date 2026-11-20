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
  STORED_ACTION_TYPES,
  TOOL_ACTION_TYPES,
  TOOL_ACTIONS,
  toolActionTypeSchema,
} from "./actions";
import { ruleDefinitionSchema } from "./gate";
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
  it("gehört zu den gespeicherten Aktionen, noch nicht zu ACTIONS", () => {
    expect(TOOL_ACTION_TYPES).toEqual(["werkzeug.aufrufen"]);
    expect(ACTION_TYPES).not.toContain("werkzeug.aufrufen");
    expect(STORED_ACTION_TYPES).toEqual([...ACTION_TYPES, "werkzeug.aufrufen"]);
    expect(TOOL_ACTIONS["werkzeug.aufrufen"].actor).toBe("bot");
    expect(toolActionTypeSchema.parse("werkzeug.aufrufen")).toBe("werkzeug.aufrufen");
  });

  it("Fakten nennen Werkzeug, Quelle und Art, die Argumente nur als Abdruck", () => {
    const schema = TOOL_ACTIONS["werkzeug.aufrufen"].facts;
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

  it("Ziel nennt Unterhaltung, Lauf und Bot", () => {
    const target = TOOL_ACTIONS["werkzeug.aufrufen"].target;
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
