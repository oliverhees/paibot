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
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createFakeMotor } from "../testing/fake-motor";
import { setupRun } from "../testing/lauf-umgebung";
import { createTestTools } from "../testing/werkzeuge";
import { createToolRegistry } from "../werkzeuge/register";
import {
  abortCode,
  invokeTool,
  MAX_STORED_RAW_INPUT_CHARS,
  outcomeEnvelope,
  prepareCalls,
} from "./aufruf";
import * as bereinigen from "./bereinigen";
import * as huelle from "./huelle";

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

  // Gegenprobe: Prüfung auf `__proto__` in `jsonHasUnwanted` entfernen → die Eingaben mit dem Schlüssel gelten als gültig, rot.
  it("Schlüssel __proto__ in der Eingabe (auch verschachtelt oder getarnt): inputValid false; sonst gültig", async () => {
    const [direkt, daneben, getarnt, gut] = await prepare([
      wish({ input: JSON.parse('{"__proto__":{"frage":"x"}}') }),
      wish({ input: JSON.parse('{"q":"x","__proto__":{"a":1}}') }),
      wish({ input: JSON.parse('{"__pro\u200bto__":{"q":"x"}}') }),
      wish({ input: { q: "x" } }),
    ]);
    expect([direkt, daneben, getarnt].map((c) => c?.inputValid)).toEqual([false, false, false]);
    expect(gut).toMatchObject({ inputValid: true, storedInput: { q: "x" } });
    // Gespeichert wird nur der bereinigte Rohtext, kein Objekt mit dem Schlüssel.
    expect(direkt?.storedInput).toEqual({ roh: '{"__proto__":{"frage":"x"}}' });
  });

  // Die Prüfung auf doppelte Schlüssel greift hier doppelt (auch das Schema kennt `é` nicht); ihr Test mit Gegenprobe steht in `bereinigen.test.ts`.
  it("zwei Schlüssel, die bereinigt gleich sind: inputValid false, nichts wird überschrieben", async () => {
    const [doppelt] = await prepare([wish({ input: JSON.parse('{"e\u0301":1,"\u00e9":2}') })]);
    expect(doppelt?.inputValid).toBe(false);
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

/** `{ a: { a: … 1 } }` mit `levels` Objekten ineinander (ohne Rekursion gebaut). */
function nested(levels: number): JsonValue {
  let value: unknown = 1;
  for (let i = 0; i < levels; i++) value = { a: value };
  return value as JsonValue;
}

// Gegenprobe: Vorprüfung in `prepareCalls` und `outcomeEnvelope` ausbauen → bei 10 000 Ebenen wirft
// die rekursive Prüfung einen RangeError, die Fälle hier werden rot.
describe("Vorprüfung vor dem Bereinigen", () => {
  it("Eingabe mit 10 000 Ebenen: ungültig, kein Wurf, Werkzeug-Schema und Bereinigen bleiben ungenutzt", async () => {
    const registry = await createToolRegistry(createTestTools().tools);
    const tool = registry.byModelName("test_lesen");
    if (tool === undefined) throw new Error("fehlt");
    const parse = vi.spyOn(tool.definition.input, "safeParse");
    const clean = vi.spyOn(bereinigen, "cleanJson");
    const unwanted = vi.spyOn(bereinigen, "jsonHasUnwanted");
    try {
      const [call] = prepareCalls([wish({ input: nested(10_000) })], {
        registry,
        offered: new Set(["test_lesen"]),
        contextKey,
        runId,
        conversationId,
      });
      expect(call?.inputValid).toBe(false);
      expect(call?.storedInput).toEqual({ roh: "" });
      expect(parse).not.toHaveBeenCalled();
      expect(clean).not.toHaveBeenCalled();
      expect(unwanted).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("Eingabe mit einer Million Schlüsseln und mit Kreis: ungültig, schneller Abbruch ohne Bereinigen", async () => {
    const wide: Record<string, number> = {};
    for (let i = 0; i < 1_000_000; i++) wide[`k${i}`] = i;
    const cycle: Record<string, unknown> = {};
    cycle.q = cycle;
    const unwanted = vi.spyOn(bereinigen, "jsonHasUnwanted");
    try {
      for (const input of [wide, cycle]) {
        const [call] = await prepare([wish({ input: input as JsonValue })]);
        expect(call?.inputValid).toBe(false);
      }
      expect(unwanted).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("Eingabe genau an der Grenze (8 Ebenen) wird weiter geprüft, eine Ebene mehr abgelehnt", async () => {
    // Das Test-Werkzeug nimmt nur `q`; die Form ist hier ungültig, aber aus anderem Grund:
    // entscheidend ist, ob die Vorprüfung durchlässt (Schema wird gefragt) oder nicht.
    const registry = await createToolRegistry(createTestTools().tools);
    const tool = registry.byModelName("test_lesen");
    if (tool === undefined) throw new Error("fehlt");
    const parse = vi.spyOn(tool.definition.input, "safeParse");
    try {
      const deps = {
        registry,
        offered: new Set(["test_lesen"]),
        contextKey,
        runId,
        conversationId,
      };
      prepareCalls([wish({ input: { q: nested(7) } })], deps);
      expect(parse).toHaveBeenCalledTimes(1);
      parse.mockClear();
      prepareCalls([wish({ input: { q: nested(8) } })], deps);
      expect(parse).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("Ergebnis mit 10 000 Ebenen, mit Kreis oder mit einer Million Schlüsseln: Hülle fehler, kein Wurf", async () => {
    const registry = await createToolRegistry(createTestTools().tools);
    const tool = registry.byModelName("test_lesen");
    if (tool === undefined) throw new Error("fehlt");
    const cycle: Record<string, unknown> = {};
    cycle.q = cycle;
    const wide: Record<string, number> = {};
    for (let i = 0; i < 1_000_000; i++) wide[`k${i}`] = i;
    const parse = vi.spyOn(tool.definition.output, "safeParse");
    try {
      for (const output of [nested(10_000), cycle, wide]) {
        const envelope = outcomeEnvelope(
          { status: "ok", output: output as never },
          tool,
          { toolResultMaxChars: 16_000 },
          16_000,
          () => {},
        );
        expect(envelope.status).toBe("fehler");
        expect(envelope).toMatchObject({ art: "daten", code: "werkzeug_fehler" });
      }
      expect(parse).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("gültiges Ergebnis bleibt unverändert: Hülle ok", async () => {
    const registry = await createToolRegistry(createTestTools().tools);
    const tool = registry.byModelName("test_lesen");
    if (tool === undefined) throw new Error("fehlt");
    const envelope = outcomeEnvelope(
      { status: "ok", output: { antwort: "Hallo" } as never },
      tool,
      { toolResultMaxChars: 16_000 },
      16_000,
      () => {},
    );
    expect(envelope.status).toBe("ok");
  });
});

/** Test-Werkzeug `test_lesen` mit anderem Eingabe- und Ausgabe-Schema (nur für die Fälle unten). */
async function werkzeugMitSchemas(
  schemas: { input?: unknown; output?: unknown },
  maxOutput = 20_000,
) {
  const def = createTestTools().byName("test_lesen");
  const registry = await createToolRegistry([
    {
      ...def,
      ...(schemas.input === undefined ? {} : { input: schemas.input as never }),
      ...(schemas.output === undefined ? {} : { output: schemas.output as never }),
      limits: { ...def.limits, maxOutputChars: maxOutput },
    },
  ]);
  const tool = registry.byModelName("test_lesen");
  if (tool === undefined) throw new Error("fehlt");
  return { registry, tool };
}

/** Hülle aus einem Ergebnis, mit Platz für 20 000 Zeichen. */
function huelleAus(tool: Awaited<ReturnType<typeof werkzeugMitSchemas>>["tool"], output: unknown) {
  return outcomeEnvelope(
    { status: "ok", output: output as never },
    tool,
    { toolResultMaxChars: 20_000 },
    20_000,
    () => {},
  );
}

// Gegenprobe: Die Vorprüfung für Ergebnisse (`ERGEBNIS_PRUEFUNG_GRENZEN`) aus
// `outcomeEnvelope` nehmen und `truncateContent` wieder quadratisch machen → die breite Form
// rechnete über 100 s am Stück (gemessen: 105 761 ms).
describe("Breites Ergebnis", () => {
  it("256 Objekte × 64 Schlüssel × 6 Ein-Zeichen-Texte: Hülle fehler, unter einer Sekunde", async () => {
    const { tool } = await werkzeugMitSchemas({ output: z.unknown() });
    const form = Array.from({ length: 256 }, () =>
      Object.fromEntries(Array.from({ length: 64 }, (_, k) => [`k${k}`, Array(6).fill("x")])),
    );
    const start = performance.now();
    const envelope = huelleAus(tool, form);
    expect(performance.now() - start).toBeLessThan(1000);
    expect(envelope.status).toBe("fehler");
    expect(envelope).toMatchObject({ art: "daten", code: "werkzeug_fehler" });
  });

  it("ein Objekt mit mehr als 64 Schlüsseln passt nie in die Hülle: Hülle fehler, ohne zu kürzen", async () => {
    const { tool } = await werkzeugMitSchemas({ output: z.unknown() });
    const truncate = vi.spyOn(huelle, "truncateContent");
    try {
      const viele = Object.fromEntries(Array.from({ length: 65 }, (_, k) => [`k${k}`, 1]));
      expect(huelleAus(tool, viele).status).toBe("fehler");
      expect(truncate).not.toHaveBeenCalled();
      const genau = Object.fromEntries(Array.from({ length: 64 }, (_, k) => [`k${k}`, 1]));
      expect(huelleAus(tool, genau).status).toBe("ok");
    } finally {
      vi.restoreAllMocks();
    }
  });
});

// Gegenprobe: Die Vorprüfung nur auf `outcome.output` laufen lassen, nicht auf
// `checked.data` → ein Schema mit `transform` reicht einen riesigen Wert durch.
describe("Vorprüfung auch für den Wert nach dem Schema", () => {
  it("ein transform, das einen 10 000 Ebenen tiefen Wert liefert: Hülle fehler, kein Wurf", async () => {
    const { tool } = await werkzeugMitSchemas({
      output: z.unknown().transform(() => nested(10_000)),
    });
    let envelope: ReturnType<typeof huelleAus> | undefined;
    expect(() => {
      envelope = huelleAus(tool, { klein: 1 });
    }).not.toThrow();
    expect(envelope?.status).toBe("fehler");
  });

  it("ein transform, das einen Kreis liefert: Hülle fehler, kein Wurf", async () => {
    const kreis: Record<string, unknown> = {};
    kreis.q = kreis;
    const { tool } = await werkzeugMitSchemas({ output: z.unknown().transform(() => kreis) });
    let envelope: ReturnType<typeof huelleAus> | undefined;
    expect(() => {
      envelope = huelleAus(tool, 1);
    }).not.toThrow();
    expect(envelope?.status).toBe("fehler");
  });

  it("ein transform, das ein zu breites Objekt liefert: Hülle fehler, ohne zu kürzen", async () => {
    const { tool } = await werkzeugMitSchemas({
      output: z
        .unknown()
        .transform(() => Object.fromEntries(Array.from({ length: 70 }, (_, k) => [`k${k}`, 1]))),
    });
    const truncate = vi.spyOn(huelle, "truncateContent");
    try {
      expect(huelleAus(tool, 1).status).toBe("fehler");
      expect(truncate).not.toHaveBeenCalled();
    } finally {
      vi.restoreAllMocks();
    }
  });
});

// Schemas mit Feldern aus `Object.prototype` (auch verschachtelt, auch feste Schlüsselnamen in einer
// Schlüssel-Wert-Liste) weist das Register beim Aufbau ab, soweit es sie lesen kann
// (`werkzeuge/register.test.ts`); es liest die festen Schlüssel aus dem Schema selbst, ein Schema
// mit Schlüsseln, die erst beim Prüfen entstehen, erkennt es nicht. Darum ist dieser Test keine
// Doppelung: Hier geht es um Werte, die kein JSON sind und die ein registriertes Schema trotzdem
// liefern kann (`Date`, `Map`, Klassen). Ein `Date`, eine `Map` oder eine Klasse sind keine Funktion:
// Der Abdruck und die Hülle würden sie nicht abweisen, `cleanJson` machte daraus still `{}`, und das
// Modell bekäme ein leeres Objekt statt des Werts.
// Gegenprobe für Ergebnisse: In `reineKopie` die Prüfung auf Prototyp und Typ entfernen → die Fälle
// unten werden rot. Für Eingaben ruft `prepareCalls` `jsonHasNonJson` auf den Wert nach dem Schema
// auf; das ist die zweite Hürde für die Eingabe (`reineKopie` gilt für Ergebnisse). Der Fall
// „Eingabe“ unten sichert den Aufruf mit einem Spy und einem von Hand gebauten Register.
describe("Werte, die kein JSON sind, erreichen nie Werkzeug oder Modell", () => {
  class Eigene {
    wert = 1;
  }
  const NICHT_JSON: [string, () => unknown][] = [
    ["Date", () => new Date(0)],
    ["Map", () => new Map([["a", "b"]])],
    ["Set", () => new Set(["a"])],
    ["Klasse", () => new Eigene()],
    ["Objekt mit eigenem Prototyp", () => Object.create({ geerbt: 1 })],
    ["Date in einer Liste", () => [new Date(0)]],
  ];

  for (const [name, bau] of NICHT_JSON) {
    it(`Ergebnis (${name}): Hülle fehler statt eines stillen leeren Objekts`, async () => {
      const { tool } = await werkzeugMitSchemas({ output: z.unknown() });
      const envelope = huelleAus(tool, { a: bau() });
      expect(envelope.status).toBe("fehler");
      expect(envelope).toMatchObject({ code: "werkzeug_fehler" });
    });
  }

  it("Ergebnis: Ein Schema, das erst beim Prüfen ein Date erzeugt, wird abgewiesen", async () => {
    const { tool } = await werkzeugMitSchemas({
      output: z.strictObject({ wann: z.coerce.date() }),
    });
    expect(huelleAus(tool, { wann: "2024-01-01" }).status).toBe("fehler");
  });

  it("Eingabe: Was das Schema liefert, wird noch einmal auf JSON und Grenzen geprüft", async () => {
    // Ein von Hand gebautes Werkzeug, dessen Schema nach dem Prüfen eine Funktion liefert: Solche
    // Schemas (etwa ein Schlüssel-Wert-Schema mit festem Namen `constructor`) kommen heute nicht mehr
    // ins Register, der Aufruf in `prepareCalls` bleibt die zweite Hürde. Gegenprobe: den Aufruf
    // in `prepareCalls` entfernen.
    const { registry, tool } = await werkzeugMitSchemas({
      input: z.strictObject({ q: z.string() }),
    });
    const nachPruefung = { q: () => "x" };
    const falsch = {
      ...tool,
      definition: {
        ...tool.definition,
        input: { safeParse: () => ({ success: true, data: nachPruefung }) },
      },
    };
    const eigenes = { ...registry, byModelName: () => falsch } as unknown as typeof registry;
    const geprueft = vi.spyOn(bereinigen, "jsonHasNonJson");
    try {
      const [call] = prepareCalls([wish({ input: { q: "x" } })], {
        registry: eigenes,
        offered: new Set(["test_lesen"]),
        contextKey,
        runId,
        conversationId,
      });
      expect(geprueft).toHaveBeenCalledWith(nachPruefung);
      expect(call?.inputValid).toBe(false);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("Gegenprobe: reines JSON mit Umlauten, null und verschachtelten Listen bleibt gültig", async () => {
    const { tool } = await werkzeugMitSchemas({ output: z.unknown() });
    const gut = { a: [1, "ä", null, { b: true }] };
    const envelope = huelleAus(tool, gut);
    expect(envelope.status).toBe("ok");
    expect(envelope).toMatchObject({ inhalt: gut });
  });
});

// Gegenprobe: Nach der ersten Prüfung weiter auf dem Wert des Werkzeugs rechnen (statt auf einer
// reinen Kopie) → je nachdem, wie oft der Code liest, rechnet er an der großen Form über eine
// Sekunde. Der Getter liefert die ersten N Lesungen etwas Kleines und danach etwas Riesiges.
describe("Wert, der sich beim Lesen ändert", () => {
  const gross = Object.fromEntries(Array.from({ length: 120_000 }, (_, i) => [`k${i}`, "x"]));

  it("jedes Lesen nach der Kopie ist egal: höchstens 400 ms, nie ein Wurf, Hülle ok oder fehler", async () => {
    const { tool } = await werkzeugMitSchemas({ output: z.unknown() });
    const zeiten: number[] = [];
    for (let lesungen = 1; lesungen <= 12; lesungen += 1) {
      let gelesen = 0;
      const wert = {
        get a() {
          gelesen += 1;
          return gelesen <= lesungen ? 1 : gross;
        },
      };
      const start = performance.now();
      const huelle = huelleAus(tool, wert);
      const dauer = performance.now() - start;
      zeiten.push(Math.round(dauer));
      expect(["ok", "fehler"], `Lesungen ${lesungen}`).toContain(huelle.status);
      expect(dauer, `Lesungen ${lesungen}: ${zeiten.join(", ")} ms`).toBeLessThan(400);
    }
  });

  it("ein Proxy, der bei jedem Lesen etwas anderes liefert, endet in ok oder fehler", async () => {
    const { tool } = await werkzeugMitSchemas({ output: z.unknown() });
    let zaehler = 0;
    const proxy = new Proxy(
      {},
      {
        ownKeys: () => (zaehler++ % 2 === 0 ? ["a"] : Object.keys(gross)),
        getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true, value: 1 }),
        get: () => 1,
      },
    );
    const start = performance.now();
    const huelle = huelleAus(tool, proxy);
    expect(performance.now() - start).toBeLessThan(400);
    expect(["ok", "fehler"]).toContain(huelle.status);
  });
});
