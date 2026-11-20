/**
 * PaiBot – Tests des Motors auf dem Vercel AI SDK gegen den Test-Anbieter: Streaming, Abbruch,
 * Fehler, Werkzeug-Wünsche, Verlauf und Ausgangs-Weg.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createFakeProvider, type FakeProvider } from "@paibot/fake-provider";
import { isPaiBotError } from "@paibot/shared/fehler";
import type { MotorEvent, TurnInput } from "@paibot/shared/motor";
import { simulateReadableStream, streamText } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import pkg from "../package.json";
import { createAiSdkMotor } from "./motor-aisdk";
import { resolveTestModel } from "./testing/test-umgebung";

const API_KEY = `sk-test-${"m".repeat(24)}`;
const REPLY = "Guten Morgen! Hier kommt eine Antwort in mehreren Stücken.";

let provider: FakeProvider;
let baseUrl: string;

beforeAll(async () => {
  provider = createFakeProvider({ apiKey: API_KEY });
  ({ baseUrl } = await provider.start({ port: 0 }));
});
afterAll(() => provider.stop());
afterEach(() => {
  provider.reset();
  provider.configure({
    reply: REPLY,
    chunkChars: 8,
    chunkDelayMs: 0,
    firstChunkDelayMs: 0,
    toolCall: undefined,
  });
  vi.restoreAllMocks();
});

async function input(overrides: Partial<TurnInput> = {}, apiKey = API_KEY): Promise<TurnInput> {
  return {
    system: "Du bist ein Test-Bot.",
    history: [{ role: "user", text: "Wie geht es dir?" }],
    model: await resolveTestModel({ baseUrl, apiKey }),
    limits: { maxOutputTokens: 256, timeoutMs: 10_000 },
    ...overrides,
  };
}

interface Timed {
  event: MotorEvent;
  at: number;
}

async function run(
  turn: TurnInput,
  options: Parameters<typeof createAiSdkMotor>[0] = {},
  signal: AbortSignal = new AbortController().signal,
): Promise<Timed[]> {
  const events: Timed[] = [];
  for await (const event of createAiSdkMotor(options).runTurn(turn, signal)) {
    events.push({ event, at: Date.now() });
  }
  return events;
}

const types = (events: Timed[]) => events.map(({ event }) => event.type);

async function waitFor(check: () => boolean, ms = 2000): Promise<void> {
  const until = Date.now() + ms;
  while (!check()) {
    if (Date.now() > until) throw new Error("Bedingung nicht erreicht");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function chatBody(index = 0): Record<string, unknown> {
  const requests = provider.requests.filter((r) => r.path.endsWith("/chat/completions"));
  return requests[index]?.body as Record<string, unknown>;
}

describe("Bibliothek des Motors", () => {
  it("ist fest auf eine Version gepinnt", () => {
    expect(pkg.dependencies.ai).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.dependencies["@ai-sdk/openai-compatible"]).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("stellt bereit, was der Motor und seine Tests brauchen", () => {
    expect(typeof streamText).toBe("function");
    expect(typeof createOpenAICompatible).toBe("function");
    expect(typeof simulateReadableStream).toBe("function");
    expect(typeof MockLanguageModelV4).toBe("function");
  });
});

describe("Aufbau", () => {
  it("meldet seine Fähigkeiten: Werkzeug-Wünsche ja, eigene Ausführung nein", () => {
    const motor = createAiSdkMotor();
    expect(motor.id).toBe("aisdk");
    expect(motor.capabilities()).toEqual({
      streaming: true,
      tools: true,
      reasoning: false,
      abort: true,
      toolsExecutedInternally: false,
    });
  });

  it("lehnt ungültige Optionen ab", () => {
    let caught: unknown;
    try {
      createAiSdkMotor({ idleTimeoutMs: -1 });
    } catch (error) {
      caught = error;
    }
    expect(isPaiBotError(caught) && caught.code === "eingabe_ungueltig").toBe(true);
  });

  it("ungültige Grenzen oder doppelte Werkzeug-Namen: Fehler-Ereignis, keine Anfrage", async () => {
    const bad = await input({ limits: { maxOutputTokens: 0, timeoutMs: 1000 } });
    expect((await run(bad)).map(({ event }) => event)).toEqual([
      { type: "error", code: "intern", retryable: false, detail: "eingabe_ungueltig" },
    ]);
    const spec = { name: "suche", description: "Sucht", inputSchema: { type: "object" } };
    const twice = await input({ tools: [spec, spec] });
    expect(types(await run(twice))).toEqual(["error"]);
    expect(provider.requests).toHaveLength(0);
  });
});

describe("Streaming mit Token-Zahlen", () => {
  it("liefert Text in Stücken und am Ende finish mit den Token-Zahlen des Anbieters", async () => {
    provider.configure({ chunkChars: 6, chunkDelayMs: 25 });
    const events = await run(await input());
    const deltas = events.filter(({ event }) => event.type === "text-delta");
    expect(deltas.length).toBeGreaterThanOrEqual(5);
    expect(deltas.map(({ event }) => (event as { text: string }).text).join("")).toBe(REPLY);
    // Die Stücke kommen nacheinander an, nicht erst am Ende gesammelt.
    expect((deltas.at(-1)?.at ?? 0) - (deltas[0]?.at ?? 0)).toBeGreaterThanOrEqual(75);
    const last = events.at(-1)?.event;
    expect(last).toEqual({
      type: "finish",
      finishReason: "stop",
      usage: { input: expect.any(Number), output: Math.ceil(REPLY.length / 4) },
    });
    expect((last as { usage: { input: number } }).usage.input).toBeGreaterThan(0);
  });

  it("sendet Modellname, Anweisung, Verlauf, Grenze und Token-Abfrage; kein Wiederholen", async () => {
    await run(await input());
    const body = chatBody();
    expect(body).toMatchObject({
      model: "fake/test-modell",
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: 256,
      messages: [
        { role: "system", content: "Du bist ein Test-Bot." },
        { role: "user", content: "Wie geht es dir?" },
      ],
    });
    expect(body.tools).toBeUndefined();
    expect(provider.requests[0]?.headers.authorization).toBe(`Bearer ${API_KEY}`);
  });
});

describe("Abbruch mitten im Strom", () => {
  it("endet sofort, der Anbieter sieht die Verbindung schließen, kein Fehler-Rauschen", async () => {
    const consoleError = vi.spyOn(console, "error");
    const consoleWarn = vi.spyOn(console, "warn");
    const warning = vi.spyOn(process, "emitWarning");
    provider.configure({ reply: "y".repeat(500), chunkChars: 2, chunkDelayMs: 30 });
    const controller = new AbortController();
    const events: MotorEvent[] = [];
    let abortedAt = 0;
    for await (const event of createAiSdkMotor().runTurn(await input(), controller.signal)) {
      events.push(event);
      if (events.length === 3) {
        abortedAt = Date.now();
        controller.abort();
      }
    }
    const endedAfter = Date.now() - abortedAt;
    expect(events.map((e) => e.type)).toEqual(["text-delta", "text-delta", "text-delta"]);
    expect(endedAfter).toBeLessThan(500);
    await waitFor(() => provider.requests[0]?.closedByClient === true);
    expect(consoleError).not.toHaveBeenCalled();
    expect(consoleWarn).not.toHaveBeenCalled();
    expect(warning).not.toHaveBeenCalled();
  });

  it("Abbruch vor dem ersten Stück schließt die wartende Verbindung", async () => {
    provider.configure({ firstChunkDelayMs: 5000 });
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 100);
    const started = Date.now();
    const events = await run(await input(), {}, controller.signal);
    expect(events).toEqual([]);
    expect(Date.now() - started).toBeLessThan(1000);
    await waitFor(() => provider.requests[0]?.closedByClient === true);
  });

  it("bricht der Aufrufer die Schleife ab, wird die Verbindung ebenfalls geschlossen", async () => {
    provider.configure({ reply: "z".repeat(400), chunkChars: 2, chunkDelayMs: 30 });
    for await (const event of createAiSdkMotor().runTurn(
      await input(),
      new AbortController().signal,
    )) {
      expect(event.type).toBe("text-delta");
      break;
    }
    await waitFor(() => provider.requests[0]?.closedByClient === true);
  });
});

describe("Fehler über die Anbieter-Schicht", () => {
  it.each([
    [401, "schluessel_ungueltig", false],
    [403, "schluessel_ungueltig", false],
    [402, "limit_erreicht", true],
    [429, "limit_erreicht", true],
    [500, "anbieter_nicht_erreichbar", true],
    [503, "anbieter_nicht_erreichbar", true],
    [400, "intern", false],
  ] as const)("HTTP %i → %s", async (status, code, retryable) => {
    provider.failNext({ kind: "status", status });
    const events = await run(await input());
    expect(events.map(({ event }) => event)).toEqual([
      { type: "error", code, retryable, detail: `http_${status}` },
    ]);
    expect(provider.requests).toHaveLength(1);
  });

  it("Verbindung bricht mitten im Strom ab → anbieter_nicht_erreichbar nach dem Teiltext", async () => {
    provider.configure({ chunkChars: 4 });
    provider.failNext({ kind: "abbruch", afterChunks: 3 });
    const events = await run(await input());
    expect(events.at(-1)?.event).toMatchObject({
      type: "error",
      code: "anbieter_nicht_erreichbar",
      retryable: true,
      detail: "strom_abgebrochen",
    });
    expect(types(events).filter((t) => t === "error")).toHaveLength(1);
    expect(types(events)).not.toContain("finish");
    expect(types(events)[0]).toBe("text-delta");
  });

  it("Anbieter antwortet nicht → Zeitgrenze ohne Strom (idleTimeoutMs)", async () => {
    provider.failNext({ kind: "haengen" });
    const started = Date.now();
    const events = await run(await input(), { idleTimeoutMs: 150 });
    expect(events.map(({ event }) => event)).toEqual([
      { type: "error", code: "anbieter_nicht_erreichbar", retryable: true, detail: "zeitgrenze" },
    ]);
    expect(Date.now() - started).toBeLessThan(1500);
    await waitFor(() => provider.requests[0]?.closedByClient === true);
  });

  it("Gesamt-Zeitgrenze der Runde (limits.timeoutMs)", async () => {
    provider.configure({ reply: "w".repeat(200), chunkChars: 2, chunkDelayMs: 20 });
    const events = await run(await input({ limits: { maxOutputTokens: 256, timeoutMs: 200 } }));
    expect(events.at(-1)?.event).toEqual({
      type: "error",
      code: "anbieter_nicht_erreichbar",
      retryable: true,
      detail: "zeitgrenze",
    });
  });

  it("Anbieter nicht erreichbar (kein Server) → anbieter_nicht_erreichbar", async () => {
    const gone = createFakeProvider();
    const { baseUrl: goneUrl } = await gone.start({ port: 0 });
    await gone.stop();
    const turn = await input();
    const model = await resolveTestModel({ baseUrl: goneUrl, apiKey: API_KEY });
    const events = await run({ ...turn, model });
    expect(events.map(({ event }) => event)).toMatchObject([
      { type: "error", code: "anbieter_nicht_erreichbar", retryable: true },
    ]);
  });

  it("Fehler-Ereignisse enthalten nie den Schlüssel", async () => {
    provider.failNext({ kind: "status", status: 401 });
    const events = await run(await input());
    expect(JSON.stringify(events)).not.toContain(API_KEY);
  });
});

describe("Werkzeug-Wünsche und Verlauf", () => {
  const search = {
    name: "suche",
    description: "Sucht in den Notizen.",
    inputSchema: {
      type: "object",
      properties: { begriff: { type: "string" } },
      required: ["begriff"],
    },
  };

  it("meldet einen Werkzeug-Aufruf als tool-call, führt nichts aus und macht keinen zweiten Schritt", async () => {
    provider.configure({
      reply: "",
      toolCall: { id: "call_1", name: "suche", arguments: { begriff: "Kaffee" } },
    });
    const events = await run(await input({ tools: [search] }));
    expect(events.map(({ event }) => event)).toEqual([
      { type: "tool-call", callId: "call_1", name: "suche", input: { begriff: "Kaffee" } },
      { type: "finish", finishReason: "tool-calls", usage: expect.any(Object) },
    ]);
    expect(provider.requests).toHaveLength(1);
    expect(chatBody().tools).toEqual([
      {
        type: "function",
        function: {
          name: "suche",
          description: "Sucht in den Notizen.",
          parameters: search.inputSchema,
        },
      },
    ]);
  });

  it("schickt Aufrufe und Ergebnisse (ok, Fehler, abgelehnt) im Format des Anbieters", async () => {
    await run(
      await input({
        tools: [search],
        history: [
          { role: "user", text: "Such bitte." },
          {
            role: "assistant",
            text: "Ich suche.",
            toolCalls: [
              { callId: "c1", name: "suche", input: { begriff: "a" } },
              { callId: "c2", name: "suche", input: { begriff: "b" } },
              { callId: "c3", name: "suche", input: { begriff: "c" } },
            ],
          },
          {
            role: "tool",
            results: [
              { callId: "c1", name: "suche", status: "ok", output: { treffer: 2 } },
              { callId: "c2", name: "suche", status: "error", output: { fehler: "kaputt" } },
              { callId: "c3", name: "suche", status: "denied", output: "Vom Tor abgelehnt." },
            ],
          },
        ],
      }),
    );
    expect(chatBody().messages).toEqual([
      { role: "system", content: "Du bist ein Test-Bot." },
      { role: "user", content: "Such bitte." },
      {
        role: "assistant",
        content: "Ich suche.",
        tool_calls: ["c1", "c2", "c3"].map((id, i) => ({
          id,
          type: "function",
          function: { name: "suche", arguments: JSON.stringify({ begriff: "abc"[i] }) },
        })),
      },
      { role: "tool", tool_call_id: "c1", content: '{"treffer":2}' },
      { role: "tool", tool_call_id: "c2", content: '{"fehler":"kaputt"}' },
      { role: "tool", tool_call_id: "c3", content: "Vom Tor abgelehnt." },
    ]);
  });
});

describe("Ausgangs-Weg", () => {
  it("nutzt nur das fetch aus dem Modell-Zugang, nie das globale", async () => {
    const original = globalThis.fetch;
    const turn = {
      ...(await input()),
      model: await resolveTestModel({ baseUrl, apiKey: API_KEY, baseFetch: original }),
    };
    const global = vi.fn(async () => {
      throw new Error("globales fetch benutzt");
    });
    vi.stubGlobal("fetch", global);
    try {
      const events = await run(turn);
      expect(events.at(-1)?.event.type).toBe("finish");
    } finally {
      vi.unstubAllGlobals();
    }
    expect(global).not.toHaveBeenCalled();
    expect(provider.requests).toHaveLength(1);
  });
});
