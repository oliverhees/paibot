/**
 * PaiBot – Tests eines einzelnen Werkzeug-Aufrufs: Ausführung nur mit Berechtigung des Tors für
 * genau diesen Aufruf, Prüfen der Wünsche durch die Steuerung.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { randomBytes } from "node:crypto";
import { deriveKey, loadMasterSecret } from "@paibot/crypto";
import { createTestDb } from "@paibot/db/testing";
import { createReceiptWriter, verifyChain } from "@paibot/receipts";
import type { ActionRequest, Facts } from "@paibot/shared/aktionen";
import { isPaiBotError } from "@paibot/shared/fehler";
import { type ActionId, type ConversationId, newId, type RunId } from "@paibot/shared/ids";
import type { JsonValue, ToolCall } from "@paibot/shared/motor";
import { describe, expect, it } from "vitest";
import { createFakeMotor } from "../testing/fake-motor";
import { setupRun } from "../testing/lauf-umgebung";
import { createTestTools } from "../testing/werkzeuge";
import { createToolRegistry } from "../werkzeuge/register";
import { abortCode, invokeTool, MAX_STORED_RAW_INPUT_CHARS, prepareCalls } from "./aufruf";

const contextKey = deriveKey(
  loadMasterSecret({ PAIBOT_SECRET: randomBytes(32).toString("base64") }),
  "context-v1",
);
const runId = newId("run") as RunId;
const conversationId = newId("conversation") as ConversationId;

async function prepare(calls: ToolCall[], offered = ["test_lesen"]) {
  const registry = await createToolRegistry(createTestTools().tools);
  return prepareCalls(calls, {
    registry,
    offered: new Set(offered),
    contextKey,
    runId,
    conversationId,
  });
}

const wish = (change: Partial<ToolCall>): ToolCall => ({
  callId: "c1",
  name: "test_lesen",
  input: { q: "x" },
  ...change,
});

/** Tor, Lauf und ein vorbereiteter Wunsch für `test_lesen` mit seinen Fakten. */
async function gateEnv() {
  const { db } = await createTestDb();
  const env = await setupRun(
    db,
    {
      createWriter: createReceiptWriter,
      verify: (entries: Parameters<typeof verifyChain>[0], options: object) =>
        verifyChain(entries, options as Parameters<typeof verifyChain>[1]),
    },
    {
      providerBaseUrl: "http://127.0.0.1:9/v1",
      providerKey: `sk-test-${"p".repeat(24)}`,
      motor: createFakeMotor([]),
    },
  );
  const tools = createTestTools({ allowedByR010: "test_lesen" });
  const registry = await createToolRegistry(tools.tools);
  const tool = registry.byModelName("test_lesen");
  if (tool === undefined) throw new Error("fehlt");
  const { runId: lauf } = await env.queueMessage("Hallo");
  // Wunsch wie in der Schleife vorbereitet: Abdruck der Eingabe über Lauf und Unterhaltung.
  const [prepared] = prepareCalls([wish({})], {
    registry,
    offered: new Set(["test_lesen"]),
    contextKey: env.deps.keys.context,
    runId: lauf,
    conversationId: env.conversationId,
  });
  if (prepared === undefined) throw new Error("fehlt");
  const action: ActionRequest<"werkzeug.aufrufen"> = {
    actionId: prepared.actionId,
    type: "werkzeug.aufrufen",
    actor: `bot:${env.botId}`,
    target: { conversationId: env.conversationId, runId: lauf, botId: env.botId },
  };
  const facts: Facts<"werkzeug.aufrufen"> = {
    toolName: "test_lesen",
    toolSource: "eingebaut",
    toolKind: "lesen",
    toolKey: tool.definition.key,
    toolDigest: tool.toolDigest,
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
    killSwitch: false,
    trigger: "chat",
    botOfConversation: true,
    runRunning: true,
    argsDigest: prepared.argsDigest,
  };
  const ctx = (permit: unknown, actionId: ActionId) => ({
    permit,
    actionId,
    signal: new AbortController().signal,
    conversationId: env.conversationId,
    runId: lauf,
    botId: env.botId,
    contextKey: env.deps.keys.context,
  });
  return { env, tools, tool, action, facts, ctx, prepared };
}

describe("Ausführung nur mit Berechtigung", () => {
  // Gegenprobe: Prüfung in `invokeTool` entfernen → Werkzeug zählt 1, rot.
  it("nachgebaute Berechtigung: wirft, Werkzeug zählt 0", async () => {
    const { tools, tool, action, ctx } = await gateEnv();
    const fake = { actionId: action.actionId, action: "werkzeug.aufrufen", decisionReceiptId: "x" };
    const error = await invokeTool(tool, { q: "x" }, ctx(fake, action.actionId)).catch(
      (e: unknown) => e,
    );
    expect(isPaiBotError(error) && error.code).toBe("intern");
    expect(tools.protocol.count()).toBe(0);
  });

  it("Berechtigung mit fremder actionId bzw. Kopie der Berechtigung: wirft, Werkzeug zählt 0", async () => {
    const { env, tools, tool, action, facts, ctx } = await gateEnv();
    await env.gate.run(action, facts, async (permit) => {
      const other = await invokeTool(
        tool,
        { q: "x" },
        ctx(permit, newId("action") as ActionId),
      ).catch((e: unknown) => e);
      expect(isPaiBotError(other) && other.code).toBe("intern");
      const copy = await invokeTool(tool, { q: "x" }, ctx({ ...permit }, action.actionId)).catch(
        (e: unknown) => e,
      );
      expect(isPaiBotError(copy) && copy.code).toBe("intern");
      return { value: undefined, result: { status: "ok" } };
    });
    expect(tools.protocol.count()).toBe(0);
  });

  it("Berechtigung des Tors mit der Kennung des Aufrufs: Werkzeug läuft genau einmal; danach ist sie zurückgezogen", async () => {
    const { env, tools, tool, action, facts, ctx } = await gateEnv();
    let kept: unknown;
    await env.gate.run(action, facts, async (permit) => {
      kept = permit;
      await invokeTool(tool, { q: "x" }, ctx(permit, action.actionId));
      return { value: undefined, result: { status: "ok" } };
    });
    expect(tools.protocol.count()).toBe(1);
    const late = await invokeTool(tool, { q: "x" }, ctx(kept, action.actionId)).catch(
      (e: unknown) => e,
    );
    expect(isPaiBotError(late) && late.code).toBe("intern");
    expect(tools.protocol.count()).toBe(1);
  });
});

describe("Eingabe gehört zur Entscheidung", () => {
  // Gegenprobe: Vergleich mit `permit.facts.argsDigest` in `invokeTool` entfernen → Werkzeug
  // zählt 1, rot.
  it("andere Eingabe als die entschiedene: kein Start, Fehler intern, Werkzeug zählt 0", async () => {
    const { env, tools, tool, action, facts, ctx, prepared } = await gateEnv();
    await env.gate.run(action, facts, async (permit) => {
      const andere: JsonValue[] = [{ q: "y" }, { q: "x", mehr: 1 }, { roh: "x" }];
      for (const anders of andere) {
        const error = await invokeTool(tool, anders, ctx(permit, action.actionId)).catch(
          (e: unknown) => e,
        );
        expect(isPaiBotError(error) && error.code, JSON.stringify(anders)).toBe("intern");
      }
      expect(tools.protocol.count()).toBe(0);
      await invokeTool(tool, prepared.storedInput, ctx(permit, action.actionId));
      return { value: undefined, result: { status: "ok" } };
    });
    expect(tools.protocol.count()).toBe(1);
  });

  // Gegenprobe: `deepFreeze` weglassen → Änderung gelingt, rot.
  it("die gespeicherte Eingabe ist tief eingefroren", async () => {
    const [call] = await prepare([
      // Ein Name ohne Werkzeug im Register: Die Eingabe bleibt verschachtelt gespeichert.
      wish({ name: "gibt_es_nicht", input: { q: "x", liste: [{ a: "b" }] } }),
    ]);
    const value = call?.storedInput as { q: string; liste: { a: string }[] };
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.liste[0])).toBe(true);
    expect(() => {
      value.q = "y";
    }).toThrow();
  });

  // Gegenprobe: erst prüfen, dann bereinigen → das Schema sieht die alte Form, rot.
  it("erst bereinigen, dann prüfen: das Schema sieht die Form, die das Werkzeug bekommt", async () => {
    // U+0958 wird bei NFC zu zwei Codepunkten; die Eingabe von test_lesen erlaubt höchstens 200.
    const lang = "\u0958".repeat(150);
    const [call] = await prepare([wish({ input: { q: lang } })]);
    expect(lang.normalize("NFC").length).toBe(300);
    expect(call?.inputValid).toBe(false);
  });
});

describe("Normalisieren", () => {
  // Gegenprobe: Werte von invalid/rawInput des SDK übernehmen → rot.
  it("Name gegen TOOL_NAME_PATTERN, nicht registriert, nicht angeboten → passende Fakten", async () => {
    const [punkt, leer, fremd, nichtAngeboten, gut] = await prepare([
      wish({ name: "a.b", callId: "1" }),
      wish({ name: "", callId: "2" }),
      wish({ name: "gibt_es_nicht", callId: "3" }),
      wish({ name: "test_fremd", input: {}, callId: "4" }),
      wish({ callId: "5", invalid: true }),
    ]);
    expect(punkt).toMatchObject({
      name: "unbekannt",
      rawName: "a.b",
      toolRegistered: false,
      toolKey: "eingebaut/unbekannt",
      kind: "schreiben",
      reach: "nach_aussen",
      foreignContent: true,
    });
    expect(leer?.name).toBe("unbekannt");
    expect(leer?.rawName).toBeUndefined();
    expect(fremd).toMatchObject({
      name: "gibt_es_nicht",
      toolRegistered: false,
      toolOffered: false,
    });
    expect(fremd?.rawName).toBeUndefined();
    expect(nichtAngeboten).toMatchObject({
      toolRegistered: true,
      toolOffered: false,
      inputValid: true,
    });
    // `invalid` des SDK ist nur Auskunft: geprüft wird selbst.
    expect(gut).toMatchObject({ toolRegistered: true, toolOffered: true, inputValid: true });
  });

  it("callId leer oder über 200 Zeichen: inputValid false, Ersatz pb-<index> in der Zeile, an das Modell die gesendete", async () => {
    const [leer, lang] = await prepare([wish({ callId: "" }), wish({ callId: "k".repeat(201) })]);
    expect(leer).toMatchObject({ inputValid: false, storedCallId: "pb-0", sentCallId: "" });
    expect(lang).toMatchObject({
      inputValid: false,
      storedCallId: "pb-1",
      sentCallId: "k".repeat(201),
    });
  });

  it("doppelte callId: Endung -<index> in der Zeile, Eingabe bleibt gültig", async () => {
    const calls = await prepare([
      wish({ callId: "x" }),
      wish({ callId: "x" }),
      wish({ callId: "x" }),
    ]);
    expect(calls.map((c) => [c.storedCallId, c.inputValid])).toEqual([
      ["x", true],
      ["x-1", true],
      ["x-2", true],
    ]);
  });

  it("Eingabe kein reines Objekt oder rawInput gesetzt: inputValid false, nie geparst", async () => {
    const calls = await prepare([
      wish({ input: '{"q":"x"}' }),
      wish({ input: [{ q: "x" }] }),
      wish({ input: null }),
      wish({ input: 5 }),
      wish({ input: null, rawInput: '{"q": "Not' }),
      wish({ input: { q: "x" }, rawInput: "{" }),
    ]);
    for (const call of calls) expect(call.inputValid).toBe(false);
    expect(calls[0]?.storedInput).toEqual({ roh: '{"q":"x"}' });
    expect(calls[4]?.storedInput).toEqual({ roh: '{"q": "Not' });
  });

  // Gegenprobe: Fehler aus toolCallDigestText nicht abfangen bzw. Gleitkomma nicht prüfen → rot.
  it("Gleitkommazahl: inputValid false, args = { roh }, kein Fehler", async () => {
    const [call] = await prepare([wish({ input: { zahl: 1.5 } })]);
    expect(call).toMatchObject({ inputValid: false, storedInput: { roh: '{"zahl":1.5}' } });
    expect(call?.argsDigest).toMatch(/^hmac-sha256:/);
  });

  it("gültige Eingabe: bereinigt (NFC) gespeichert; Steuerzeichen machen sie ungültig", async () => {
    const [nfc, steuer] = await prepare([
      wish({ input: { q: "é" } }),
      wish({ input: { q: "a\u202eb" } }),
    ]);
    expect(nfc).toMatchObject({ inputValid: true, storedInput: { q: "é" } });
    expect(steuer?.inputValid).toBe(false);
  });

  it("gespeicherte Eingabe ungültig: { roh } gekürzt auf 2 000 Zeichen und bereinigt", async () => {
    const [call] = await prepare([wish({ input: `\u202e${"y".repeat(5000)}` })]);
    expect((call?.storedInput as { roh: string } | undefined)?.roh).toBe(
      "y".repeat(MAX_STORED_RAW_INPUT_CHARS),
    );
  });

  // Gegenprobe: Code immer unterbrochen → rot.
  it("Abbruch: Code ausgang_unbekannt bei schreiben oder nach_aussen, sonst unterbrochen", () => {
    expect(abortCode({ kind: "lesen", reach: "intern" })).toBe("unterbrochen");
    expect(abortCode({ kind: "schreiben", reach: "intern" })).toBe("ausgang_unbekannt");
    expect(abortCode({ kind: "lesen", reach: "nach_aussen" })).toBe("ausgang_unbekannt");
  });
});
