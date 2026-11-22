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
  TOOL_REACHES,
  toolActionTypeSchema,
  UNSTORED_ACTION_TYPES,
} from "./actions";
import { ruleDefinitionSchema, STANDARD_RULE_VERSIONS, STANDARD_RULES } from "./gate";
import { newId } from "./id";
import {
  toolKeySchema as objektKennung,
  TOOL_CALL_REACHES,
  TOOL_CALL_STATUSES,
  toolCallSchema,
} from "./objects";
import {
  type ToolEnvelope,
  type ToolResultMessage,
  toolEnvelopeSchema,
  toolKeySchema,
} from "./werkzeug";

const time = "2026-11-20T10:00:00.000Z";
const digest = `hmac-sha256:${"0a".repeat(32)}`;

/** Fakten, die schon `werkzeug.ausfuehren` hat (Werkzeug, Lauf, Abdruck, Not-Aus). */
const basisFakten = {
  botOfConversation: true,
  runRunning: true,
  toolName: "kalender_lesen",
  toolSource: "eingebaut",
  toolKind: "lesen",
  argsDigest: digest,
  killSwitch: false,
};

/** Pflicht-Fakten eines Werkzeug-Wunschs (alle außer `toolServer`). */
const torFakten = {
  toolKey: "eingebaut/kalender.lesen",
  toolDigest: `sha256:${"1b".repeat(32)}`,
  toolReach: "intern",
  toolForeign: false,
  toolRegistered: true,
  toolOffered: true,
  inputValid: true,
  untrustedInput: false,
  step: 0,
  callIndexInStep: 0,
  maxCallsPerStep: 8,
  callsInRun: 0,
  maxCallsPerRun: 16,
  trigger: "chat",
};

const facts = { ...basisFakten, ...torFakten };

/** Quelle `mcp` mit allen Fakten der App (Tor-Fassung 3). */
const mcpFakten = {
  toolSource: "mcp",
  toolServer: "notizen",
  toolKey: "mcp/notizen/suchen",
  toolReach: "nach_aussen",
  toolForeign: true,
  appId: `app_0${"0".repeat(25)}`,
  appToolId: `wzg_0${"0".repeat(25)}`,
  toolVersion: 1,
  toolStatus: "bestaetigt",
  appAccess: "lesen",
  targetDigest: `sha256:${"2c".repeat(32)}`,
  confirmedToolDigest: `sha256:${"1b".repeat(32)}`,
  confirmedTargetDigest: `sha256:${"2c".repeat(32)}`,
  stepAppId: `app_0${"0".repeat(25)}`,
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
    expect(schema.safeParse({ ...facts, ...mcpFakten }).success).toBe(true);
    expect(schema.safeParse({ ...facts, args: { datum: "heute" } }).success).toBe(false);
    expect(schema.safeParse({ ...facts, argsDigest: `sha256:${"0".repeat(64)}` }).success).toBe(
      false,
    );
    expect(schema.safeParse({ ...facts, toolName: "rm -rf" }).success).toBe(false);
    expect(schema.safeParse({ ...facts, toolKind: "loeschen" }).success).toBe(false);
  });

  it.each([
    ...Object.keys(torFakten),
    "toolName",
    "toolSource",
    "toolKind",
    "botOfConversation",
    "runRunning",
    "argsDigest",
    "killSwitch",
  ])("Pflicht-Fakt %s fehlt: ungültig", (name) => {
    const { [name]: _, ...ohne } = facts as Record<string, unknown>;
    expect(ACTIONS["werkzeug.aufrufen"].facts.safeParse(ohne).success).toBe(false);
  });

  it("Kennung, Abdruck, Reichweite und Auslöser haben feste Formen", () => {
    const schema = ACTIONS["werkzeug.aufrufen"].facts;
    for (const [name, value] of [
      ["toolKey", "Eingebaut/x"],
      ["toolKey", "eingebaut"],
      ["toolKey", `${"a".repeat(76)}/${"b".repeat(64)}`],
      ["toolKey", { quelle: "eingebaut" }],
      ["toolDigest", digest],
      ["toolReach", "extern"],
      ["trigger", "zeitplan"],
      ["step", -1],
      ["callIndexInStep", 0.5],
      ["maxCallsPerStep", 0],
      ["maxCallsPerRun", 0],
    ] as const) {
      expect(schema.safeParse({ ...facts, [name]: value }).success, `${name}`).toBe(false);
    }
    expect(
      schema.safeParse({ ...facts, toolKey: `${"a".repeat(75)}/${"b".repeat(64)}` }).success,
    ).toBe(true);
  });

  it("der Server steht genau dann in den Fakten, wenn die Quelle mcp ist", () => {
    for (const type of ["werkzeug.aufrufen", "werkzeug.ausfuehren"] as const) {
      const schema = ACTIONS[type].facts;
      const base =
        type === "werkzeug.aufrufen"
          ? facts
          : {
              ...basisFakten,
              approvalGranted: true,
              approvalConsumed: false,
              approvalExpired: false,
              approvalArgsDigest: digest,
            };
      expect(schema.safeParse(base).success, type).toBe(true);
      // Für `werkzeug.aufrufen` kommen bei `mcp` die Fakten der App dazu.
      const mcp =
        type === "werkzeug.aufrufen"
          ? { ...base, ...mcpFakten }
          : { ...base, toolSource: "mcp", toolServer: "notizen" };
      expect(schema.safeParse(mcp).success, type).toBe(true);
      // mcp ohne Server und ein Server ohne mcp sind ungültig.
      expect(schema.safeParse({ ...mcp, toolServer: undefined }).success, type).toBe(false);
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

  it("nimmt die gespeicherten Angaben zum Werkzeug an (alle optional für alte Zeilen)", () => {
    const voll = {
      ...record,
      toolKey: "eingebaut/kalender.lesen",
      toolDigest: `sha256:${"c".repeat(64)}`,
      reach: "intern",
      foreignContent: false,
      step: 0,
      untrustedInput: true,
      rawName: "Kalender lesen!",
      outputTruncated: true,
      outputChars: 30000,
    };
    expect(toolCallSchema.parse(voll)).toEqual(voll);
    expect(toolCallSchema.safeParse({ ...voll, reach: "ueberall" }).success).toBe(false);
    expect(toolCallSchema.safeParse({ ...voll, rawName: "" }).success).toBe(false);
    expect(toolCallSchema.safeParse({ ...voll, step: -1 }).success).toBe(false);
  });

  it("die Wirkung am Aufruf kennt genau die Werte der Aktionen", () => {
    expect([...TOOL_CALL_REACHES]).toEqual([...TOOL_REACHES]);
  });

  it("lehnt unbekannte Zustände und fremde IDs ab", () => {
    expect(toolCallSchema.safeParse({ ...record, status: "fertig" }).success).toBe(false);
    expect(toolCallSchema.safeParse({ ...record, actionId: newId("run") }).success).toBe(false);
    expect(toolCallSchema.safeParse({ ...record, position: -1 }).success).toBe(false);
  });
});

describe("Hülle eines Werkzeug-Ergebnisses", () => {
  const ok: ToolEnvelope = {
    paibot: "werkzeug-ergebnis",
    werkzeug: "eingebaut/doku.nachschlagen",
    art: "daten",
    status: "ok",
    inhalt: { treffer: [{ seite: "funktion-tor", anker: "grenzen" }] },
  };
  const fehler: ToolEnvelope = {
    paibot: "werkzeug-ergebnis",
    werkzeug: "eingebaut/doku.nachschlagen",
    art: "daten",
    status: "abgelehnt",
    code: "freigabe_noetig",
    text: "Dafür bräuchte ich deine Erlaubnis; das kann ich in dieser Version noch nicht fragen.",
  };

  it("kennt genau Daten oder Fehler bzw. Ablehnung, streng", () => {
    expect(toolEnvelopeSchema.parse(ok)).toEqual(ok);
    expect(toolEnvelopeSchema.parse({ ...ok, gekuerzt: true })).toEqual({ ...ok, gekuerzt: true });
    expect(toolEnvelopeSchema.parse(fehler)).toEqual(fehler);
    expect(toolEnvelopeSchema.parse({ ...fehler, status: "fehler" }).status).toBe("fehler");
    for (const bad of [
      { ...ok, extra: 1 },
      { ...fehler, extra: 1 },
      { ...ok, paibot: "anders" },
      { ...ok, art: "anweisung" },
      { ...ok, status: "fehler" },
      { ...fehler, code: "frei_erfunden" },
      { ...fehler, text: "" },
      { ...fehler, text: "x".repeat(501) },
      { ...ok, werkzeug: "Eingebaut/x" },
      { ...ok, inhalt: undefined },
    ]) {
      expect(toolEnvelopeSchema.safeParse(bad).success, JSON.stringify(bad).slice(0, 60)).toBe(
        false,
      );
    }
  });

  it("Inhalt hat feste Grenzen: Tiefe 8 geht, Tiefe 9 nicht", () => {
    const tief = (n: number): unknown => (n === 0 ? "x" : { a: tief(n - 1) });
    // Tiefe = Zahl der verschachtelten Objekte in `inhalt`.
    expect(toolEnvelopeSchema.safeParse({ ...ok, inhalt: tief(8) }).success).toBe(true);
    expect(toolEnvelopeSchema.safeParse({ ...ok, inhalt: tief(9) }).success).toBe(false);
  });

  it("geht nur als Nachricht mit role tool", () => {
    const nachricht: ToolResultMessage = { role: "tool", callId: "c1", envelope: ok };
    expect(nachricht.role).toBe("tool");
    // @ts-expect-error Eine Hülle steht nie in einer Nachricht des Systems.
    const system: ToolResultMessage = { role: "system", callId: "c1", envelope: ok };
    expect(system.role).toBe("system");
  });

  it("die Kennung eines Werkzeugs kommt aus einer Stelle", () => {
    expect(toolKeySchema).toBe(objektKennung);
  });
});
