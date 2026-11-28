/**
 * PaiBot – Test: Die Test-Werkzeuge erfüllen den Vertrag eines Werkzeugs, ihre Schemas verhalten
 * sich so, wie die Lauf-Tests es voraussetzen, und die Test-Regel erlaubt genau die genannten
 * Werkzeuge (der Deckel für fremde Inhalte greift trotzdem).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { createTestDb } from "@paibot/db/testing";
import { evaluate, ruleSnapshot, toolDefinitionDigest } from "@paibot/gate";
import { createReceiptWriter, verifyChain } from "@paibot/receipts";
import type { ActionRequest, Facts } from "@paibot/shared/aktionen";
import { type BotId, type ConversationId, newId, type RunId } from "@paibot/shared/ids";
import type { JsonValue } from "@paibot/shared/motor";
import { TOOL_KEY_PATTERN, TOOL_NAME_PATTERN } from "@paibot/shared/objekte";
import { ACTIVE_STANDARD_RULES, type RuleDefinition } from "@paibot/shared/tor";
import type { ToolContext, ToolDefinition } from "@paibot/shared/werkzeug";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createFakeMotor } from "./fake-motor";
import { setupRun } from "./lauf-umgebung";
import {
  createTestTools,
  R010_CAPABLE,
  R010_TOOL_KEY,
  TEST_FOREIGN_CLEAN,
  TEST_FOREIGN_TEXT,
  TEST_SECRET_MARKER,
  TEST_TOOL_NAMES,
  type TestToolName,
  testToolKey,
  testToolRule,
} from "./werkzeuge";

const UNERWUENSCHT =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: genau diese Zeichen sollen weg
  /[\u0000-\u0008\u000b-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\u061c\ufeff]/g;

const conversationId = newId("conversation") as ConversationId;
const runId = newId("run") as RunId;
const botId = newId("bot") as BotId;

function ctx(signal = new AbortController().signal): ToolContext {
  return {
    signal,
    // Die Test-Werkzeuge prüfen die Berechtigung nicht; das tut die Steuerung vor `run()`.
    permit: {} as ToolContext["permit"],
    conversationId,
    runId,
    botId,
    ports: {},
  };
}

async function facts(
  def: ToolDefinition<JsonValue, JsonValue>,
  untrustedInput: boolean,
): Promise<Facts<"werkzeug.aufrufen">> {
  return {
    botPaused: false,
    auftragArt: "keiner",
    toolName: def.modelName,
    toolSource: def.source,
    toolKind: def.kind,
    toolKey: def.key,
    toolDigest: await toolDefinitionDigest({
      description: def.description,
      foreignContent: def.foreignContent,
      inputSchema: z.toJSONSchema(def.input) as JsonValue,
      key: def.key,
      kind: def.kind,
      modelName: def.modelName,
      reach: def.reach,
      source: def.source,
      version: def.version,
    }),
    toolReach: def.reach,
    toolForeign: def.foreignContent,
    toolRegistered: true,
    toolOffered: true,
    inputValid: true,
    untrustedInput,
    step: 0,
    callIndexInStep: 0,
    maxCallsPerStep: 8,
    callsInRun: 0,
    maxCallsPerRun: 16,
    killSwitch: false,
    trigger: "chat",
    botOfConversation: true,
    runRunning: true,
    argsDigest: `hmac-sha256:${"0".repeat(64)}`,
  };
}

async function decide(name: TestToolName, rules: readonly RuleDefinition[], untrusted = false) {
  const def = createTestTools().byName(name);
  const action: ActionRequest<"werkzeug.aufrufen"> = {
    actionId: newId("action"),
    type: "werkzeug.aufrufen",
    actor: `bot:${botId}`,
    target: { conversationId, runId, botId },
  };
  return evaluate(action, await facts(def, untrusted), await ruleSnapshot([...rules]));
}

describe("Test-Werkzeuge", () => {
  const { tools } = createTestTools();

  it("gibt es in fester Reihenfolge mit gültigem Namen und gültiger Kennung", () => {
    expect(tools.map((tool) => tool.modelName)).toEqual([...TEST_TOOL_NAMES]);
    for (const tool of tools) {
      expect(TOOL_NAME_PATTERN.test(tool.modelName)).toBe(true);
      expect(tool.modelName).not.toContain("__");
      expect(TOOL_KEY_PATTERN.test(tool.key)).toBe(true);
      expect(tool.key).toBe(testToolKey(tool.modelName as TestToolName));
      expect(tool.source).toBe("eingebaut");
      expect(tool.gateAction).toBe("werkzeug.aufrufen");
      expect(tool.description.length).toBeLessThanOrEqual(1000);
      expect(tool.input).toBeInstanceOf(z.ZodObject);
    }
  });

  it("nur test_fremd liefert fremde Inhalte; schreibend sind test_schreiben und test_langsam_schreiben", () => {
    expect(tools.filter((t) => t.foreignContent).map((t) => t.modelName)).toEqual(["test_fremd"]);
    expect(tools.filter((t) => t.kind === "schreiben").map((t) => t.modelName)).toEqual([
      "test_schreiben",
      "test_langsam_schreiben",
    ]);
  });

  it("Schema von test_lesen: Grenze und Zusatzfeld abgelehnt, Gleitkomma absichtlich angenommen", () => {
    const input = createTestTools().byName("test_lesen").input;
    expect(input.safeParse({ a: 5000 }).success).toBe(false);
    expect(input.safeParse({ q: "x", extra: 1 }).success).toBe(false);
    expect(input.safeParse('{"q":1}').success).toBe(false);
    expect(input.safeParse({ zahl: 1.5 }).success).toBe(true);
  });

  it("zählen jeden Aufruf im Protokoll", async () => {
    const set = createTestTools();
    await set.byName("test_lesen").run({ q: "x" }, ctx());
    await set.byName("test_fremd").run({}, ctx());
    expect(set.protocol.count()).toBe(2);
    expect(set.protocol.count("test_lesen")).toBe(1);
    set.protocol.reset();
    expect(set.protocol.count()).toBe(0);
  });

  it("test_fremd liefert Steuer-, Bidi- und unsichtbare Zeichen", async () => {
    const outcome = await createTestTools().byName("test_fremd").run({}, ctx());
    expect(outcome).toEqual({ status: "ok", output: { text: TEST_FOREIGN_TEXT } });
    expect(TEST_FOREIGN_TEXT).not.toBe(TEST_FOREIGN_CLEAN);
    expect(TEST_FOREIGN_TEXT.replace(UNERWUENSCHT, "")).toBe(TEST_FOREIGN_CLEAN);
  });

  it("test_wirft wirft mit dem Merkmal in der Meldung", async () => {
    await expect(createTestTools().byName("test_wirft").run({}, ctx())).rejects.toThrow(
      TEST_SECRET_MARKER,
    );
  });

  it("test_riesig liefert 100 000 Zeichen", async () => {
    const outcome = await createTestTools().byName("test_riesig").run({}, ctx());
    expect(outcome.status === "ok" && (outcome.output as { text: string }).text.length).toBe(
      100_000,
    );
  });

  it("test_langsam bricht beim Signal sofort mit AbortError ab und hält die Zeit fest", async () => {
    const set = createTestTools({ slowMs: 60_000 });
    const controller = new AbortController();
    const running = set.byName("test_langsam").run({}, ctx(controller.signal));
    setTimeout(() => controller.abort(), 20);
    await expect(running).rejects.toMatchObject({ name: "AbortError" });
    const [call] = set.protocol.calls;
    expect(call?.abortedAt).toBeDefined();
    expect(call?.finished).toBe(false);
  });
});

describe("Test-Regel (nur Auswertung)", () => {
  it("erlaubt die genannten Test-Werkzeuge vor R-005", async () => {
    const rules = [...ACTIVE_STANDARD_RULES, testToolRule(["test_lesen", "test_fremd"])];
    expect((await decide("test_lesen", rules)).outcome).toBe("allow");
    expect((await decide("test_fremd", rules)).outcome).toBe("allow");
  });

  it("ohne sie fragt R-005 (in dieser Fassung abgelehnt), auch für test_lesen", async () => {
    expect((await decide("test_lesen", ACTIVE_STANDARD_RULES)).outcome).toBe("ask");
    expect((await decide("test_schreiben", ACTIVE_STANDARD_RULES)).outcome).toBe("ask");
  });

  it("nicht genannte Werkzeuge bleiben bei R-005", async () => {
    const rules = [...ACTIVE_STANDARD_RULES, testToolRule(["test_lesen", "test_fremd"])];
    expect((await decide("test_schreiben", rules)).outcome).toBe("ask");
  });

  it("der Deckel D-01 macht aus allow ein ask, wenn fremde Inhalte gelesen wurden und das Werkzeug schreibt", async () => {
    const rules = [...ACTIVE_STANDARD_RULES, testToolRule(["test_schreiben"])];
    expect((await decide("test_schreiben", rules, false)).outcome).toBe("allow");
    const gedeckelt = await decide("test_schreiben", rules, true);
    expect(gedeckelt.outcome).toBe("ask");
    expect(gedeckelt.caps).toContainEqual({ name: "fremd_dann_fragen", result: "gedeckelt" });
  });
});

describe("Deckel D-01 mit den Standard-Regeln", () => {
  it("schreibend nach fremden Inhalten: R-005 fragt, Deckel nicht_noetig; ohne fremde Inhalte entfaellt", async () => {
    const mit = await decide("test_schreiben", ACTIVE_STANDARD_RULES, true);
    const ohne = await decide("test_schreiben", ACTIVE_STANDARD_RULES, false);
    expect([mit.outcome, ohne.outcome]).toEqual(["ask", "ask"]);
    expect(mit.caps).toEqual([{ name: "fremd_dann_fragen", result: "nicht_noetig" }]);
    expect(ohne.caps).toEqual([{ name: "fremd_dann_fragen", result: "entfaellt" }]);
  });
});

describe("Erlaubt durch das echte Tor nur über R-010", () => {
  const receiptTools = {
    createWriter: createReceiptWriter,
    verify: (entries: Parameters<typeof verifyChain>[0], options: object) =>
      verifyChain(entries, options as Parameters<typeof verifyChain>[1]),
  };

  it("die Kennung von R-010 geht nur an Werkzeuge, die lesen und intern wirken", () => {
    for (const name of R010_CAPABLE) {
      const tool = createTestTools({ allowedByR010: name }).byName(name);
      expect(tool.key).toBe(R010_TOOL_KEY);
      expect([tool.kind, tool.reach]).toEqual(["lesen", "intern"]);
    }
    expect(() => createTestTools({ allowedByR010: "test_schreiben" })).toThrow();
    expect(() => createTestTools({ allowedByR010: "test_langsam_schreiben" })).toThrow();
  });

  it.each([
    [true, "allow"],
    [false, "ask"],
  ] as const)(
    "Kennung von R-010 %s: Tor entscheidet %s, Kette vertrauenswürdig",
    async (r010, outcome) => {
      const { db } = await createTestDb();
      const env = await setupRun(db, receiptTools, {
        providerBaseUrl: "http://127.0.0.1:9/v1",
        providerKey: `sk-test-${"p".repeat(24)}`,
        motor: createFakeMotor([]),
      });
      const { runId: lauf } = await env.queueMessage("Hallo");
      const def = createTestTools(r010 ? { allowedByR010: "test_lesen" } : {}).byName("test_lesen");
      const action: ActionRequest<"werkzeug.aufrufen"> = {
        actionId: newId("action"),
        type: "werkzeug.aufrufen",
        actor: `bot:${env.botId}`,
        target: { conversationId: env.conversationId, runId: lauf, botId: env.botId },
      };
      const ergebnis = await env.gate
        .run(action, await facts(def, false), async () => ({
          value: "lief",
          result: { status: "ok" },
        }))
        .then(
          (r) => r.decision.outcome,
          (e: { outcome?: string; code?: string }) => e.outcome ?? `fehler:${e.code}`,
        );
      expect(ergebnis).toBe(outcome);
      expect((await env.verify()).ok).toBe(true);
    },
  );
});
