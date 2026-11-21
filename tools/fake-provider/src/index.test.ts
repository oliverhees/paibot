/**
 * PaiBot – Tests für den Test-Anbieter (Modelle, Antworten, Strom, Fehler, Abbruch, Protokoll).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { randomBytes } from "node:crypto";
import { networkInterfaces } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFakeProvider,
  FAKE_CONTROL_KEY_HEADER,
  FAKE_CONTROL_PATHS,
  FAKE_PROVIDER_PATHS,
  type FakeProvider,
  isLoopback,
} from "./index";

const API_KEY = `test-${Math.random().toString(36).slice(2)}`;

let provider: FakeProvider;
let baseUrl: string;
let origin: string;

beforeEach(async () => {
  provider = createFakeProvider({
    apiKey: API_KEY,
    chunkChars: 4,
    reply: "Hallo Welt, das ist ein Test.",
  });
  ({ baseUrl } = await provider.start({ port: 0 }));
  origin = new URL(baseUrl).origin;
});

afterEach(async () => {
  await provider.stop();
});

function post(path: string, body: unknown, key: string | null = API_KEY, signal?: AbortSignal) {
  return fetch(`${origin}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(key === null ? {} : { authorization: `Bearer ${key}` }),
    },
    body: JSON.stringify(body),
    signal,
  });
}

function chat(extra: Record<string, unknown> = {}, content = "Hallo", signal?: AbortSignal) {
  return post(
    FAKE_PROVIDER_PATHS.chatCompletions,
    { model: "fake/test-modell", messages: [{ role: "user", content }], ...extra },
    API_KEY,
    signal,
  );
}

// biome-ignore lint/suspicious/noExplicitAny: Antworten des Test-Anbieters sind frei geformt
type Json = Record<string, any>;

type Sse = { data: string; at: number };

async function readSse(response: Response): Promise<Sse[]> {
  const events: Sse[] = [];
  const reader = response.body?.getReader();
  if (!reader) throw new Error("kein Körper");
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let end = buffer.indexOf("\n\n");
    while (end >= 0) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      if (block.startsWith("data: ")) events.push({ data: block.slice(6), at: Date.now() });
      end = buffer.indexOf("\n\n");
    }
  }
  return events;
}

function jsonEvents(events: Sse[]) {
  return events.filter((e) => e.data !== "[DONE]").map((e) => JSON.parse(e.data) as Json);
}

function textOf(events: Sse[]): string {
  return jsonEvents(events)
    .map((e) => e.choices[0]?.delta?.content ?? "")
    .join("");
}

async function until(check: () => boolean, ms = 2000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("Zeit abgelaufen");
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe("Start und Schnittstelle", () => {
  it("nennt die nachgebildeten Pfade und Steuerpfade", () => {
    expect(FAKE_PROVIDER_PATHS).toEqual({
      models: "/v1/models",
      chatCompletions: "/v1/chat/completions",
    });
    expect(Object.values(FAKE_CONTROL_PATHS).every((p) => p.startsWith("/_steuerung/"))).toBe(true);
  });

  it("bindet standardmäßig nur an 127.0.0.1 und liefert die Basis-URL", async () => {
    expect(baseUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/v1$/);
    const second = createFakeProvider();
    await expect(second.start()).resolves.toMatchObject({
      baseUrl: expect.stringContaining("127.0.0.1"),
    });
    await second.stop();
  });

  it("hat einen Gesundheits-Pfad ohne Anmeldung", async () => {
    const response = await fetch(`${origin}/health`);
    expect(response.status).toBe(200);
  });

  it("unbekannter Pfad: 404, falsche Methode: 405", async () => {
    expect((await fetch(`${origin}/nichts`)).status).toBe(404);
    const wrong = await fetch(`${origin}${FAKE_PROVIDER_PATHS.chatCompletions}`, {
      headers: { authorization: `Bearer ${API_KEY}` },
    });
    expect(wrong.status).toBe(405);
  });

  it("stop beendet den Server, auch bei hängender Anfrage", async () => {
    provider.failNext({ kind: "haengen" });
    const pending = chat().then(
      () => "fertig",
      () => "getrennt",
    );
    await until(() => provider.requests.length === 1);
    await provider.stop();
    await expect(pending).resolves.toBe("getrennt");
  });
});

describe("Modelle", () => {
  it("liefert die Liste im OpenAI-Format mit Zusatzfeldern", async () => {
    const response = await fetch(`${baseUrl}/models`, {
      headers: { authorization: `Bearer ${API_KEY}` },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { object: string; data: Json[] };
    expect(body.object).toBe("list");
    const text = body.data.find((m) => m.id === "fake/test-modell");
    expect(text).toMatchObject({
      object: "model",
      architecture: { modality: "text->text" },
      supported_api_endpoints: ["chat.completions"],
    });
    expect(text?.supported_parameters).toContain("stream");
    const image = body.data.find((m) => m.id === "fake/bild-modell");
    expect(image?.architecture.modality).toBe("text->image");
    expect(image?.supported_api_endpoints).not.toContain("chat.completions");
  });

  it("nimmt eigene Modelle über configure an (ohne Strom: ohne `stream`)", async () => {
    provider.configure({ models: [{ id: "x/ohne-strom", supportsStream: false }] });
    const response = await fetch(`${baseUrl}/models`, {
      headers: { authorization: `Bearer ${API_KEY}` },
    });
    const body = (await response.json()) as { data: Json[] };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.supported_parameters).not.toContain("stream");
  });
});

describe("Anmeldung", () => {
  it("falscher oder fehlender Schlüssel gibt 401 im OpenAI-Fehlerformat", async () => {
    for (const key of ["falsch", null]) {
      const response = await post(
        FAKE_PROVIDER_PATHS.chatCompletions,
        { model: "m", messages: [] },
        key,
      );
      expect(response.status).toBe(401);
      const body = (await response.json()) as { error: { code: string } };
      expect(body.error.code).toBe("invalid_api_key");
    }
    const models = await fetch(`${baseUrl}/models`, {
      headers: { authorization: "Bearer falsch" },
    });
    expect(models.status).toBe(401);
  });

  it("ohne gesetzten Schlüssel ist keine Anmeldung nötig", async () => {
    provider.configure({ apiKey: undefined });
    expect(
      (await post(FAKE_PROVIDER_PATHS.chatCompletions, { model: "m", messages: [] }, null)).status,
    ).toBe(200);
  });

  it("ein 401 verbraucht keinen geplanten Fehler", async () => {
    provider.failNext({ kind: "status", status: 503 });
    await post(FAKE_PROVIDER_PATHS.chatCompletions, { model: "m", messages: [] }, "falsch");
    expect((await chat()).status).toBe(503);
  });
});

describe("Antwort ohne Strom", () => {
  it("liefert eine ganze Antwort mit Token-Zahlen", async () => {
    const response = await chat();
    expect(response.status).toBe(200);
    const body = (await response.json()) as Json;
    expect(body.object).toBe("chat.completion");
    expect(body.model).toBe("fake/test-modell");
    expect(body.choices[0].message).toEqual({
      role: "assistant",
      content: "Hallo Welt, das ist ein Test.",
    });
    expect(body.choices[0].finish_reason).toBe("stop");
    expect(body.usage.prompt_tokens).toBeGreaterThan(0);
    expect(body.usage.completion_tokens).toBeGreaterThan(0);
    expect(body.usage.total_tokens).toBe(body.usage.prompt_tokens + body.usage.completion_tokens);
  });

  it("ungültige Anfragen gehen mit 400 zurück", async () => {
    expect((await post(FAKE_PROVIDER_PATHS.chatCompletions, { model: "m" })).status).toBe(400);
    const raw = await fetch(`${origin}${FAKE_PROVIDER_PATHS.chatCompletions}`, {
      method: "POST",
      headers: { authorization: `Bearer ${API_KEY}` },
      body: "{kaputt",
    });
    expect(raw.status).toBe(400);
  });

  it("die Antwort kann eine Funktion der Nachrichten sein", async () => {
    provider.configure({ reply: (messages) => `Echo: ${String(messages.at(-1)?.content)}` });
    const body = (await (await chat({}, "Guten Tag")).json()) as Json;
    expect(body.choices[0].message.content).toBe("Echo: Guten Tag");
  });
});

describe("Strom", () => {
  it("sendet den Text in Stücken, dann [DONE]", async () => {
    const response = await chat({ stream: true });
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const events = await readSse(response);
    expect(events.at(-1)?.data).toBe("[DONE]");
    const chunks = jsonEvents(events);
    expect(chunks[0]?.choices[0].delta).toEqual({ role: "assistant", content: "" });
    const pieces = chunks.map((c) => c.choices[0]?.delta?.content).filter((c) => c);
    expect(pieces.length).toBeGreaterThan(3);
    expect(pieces.every((p) => p.length <= 4)).toBe(true);
    expect(textOf(events)).toBe("Hallo Welt, das ist ein Test.");
    expect(chunks.at(-1)?.choices[0].finish_reason).toBe("stop");
    // Ohne `include_usage` keine Token-Zahlen.
    expect(chunks.some((c) => "usage" in c)).toBe(false);
  });

  it("liefert mit include_usage die Token-Zahlen im letzten Stück", async () => {
    const events = await readSse(
      await chat({ stream: true, stream_options: { include_usage: true } }),
    );
    const chunks = jsonEvents(events);
    const last = chunks.at(-1);
    expect(last?.choices).toEqual([]);
    expect(last?.usage.prompt_tokens).toBeGreaterThan(0);
    expect(last?.usage.completion_tokens).toBeGreaterThan(0);
    expect(last?.usage.total_tokens).toBe(
      last?.usage.prompt_tokens + last?.usage.completion_tokens,
    );
    expect(chunks.filter((c) => "usage" in c)).toHaveLength(1);
    expect(events.at(-1)?.data).toBe("[DONE]");
  });

  it("achtet die Stückgröße und teilt keine Zeichen mittendrin", async () => {
    provider.configure({ reply: "😀😀😀", chunkChars: 2 });
    const events = await readSse(await chat({ stream: true }));
    expect(textOf(events)).toBe("😀😀😀");
  });
});

describe("Verzögerung", () => {
  it("wartet vor dem ersten Stück", async () => {
    provider.configure({ firstChunkDelayMs: 200 });
    const start = Date.now();
    const events = await readSse(await chat({ stream: true }));
    expect(events[0] && events[0].at - start).toBeGreaterThanOrEqual(180);
  });

  it("wartet zwischen den Stücken", async () => {
    provider.configure({ chunkDelayMs: 60, reply: "abcdefgh", chunkChars: 4 });
    const events = await readSse(await chat({ stream: true }));
    const times = jsonEvents(events).length;
    expect(times).toBeGreaterThanOrEqual(4);
    // Rolle, 2 Textstücke, Ende: mindestens drei Pausen, Gesamtdauer deutlich über null.
    const span = (events.at(-1)?.at ?? 0) - (events[0]?.at ?? 0);
    expect(span).toBeGreaterThanOrEqual(150);
  });

  it("wirkt auch ohne Strom", async () => {
    provider.configure({ firstChunkDelayMs: 150 });
    const start = Date.now();
    await chat();
    expect(Date.now() - start).toBeGreaterThanOrEqual(130);
  });
});

describe("Steuerbare Fehler", () => {
  it("Fehlerstatus mit Standard-Körper", async () => {
    provider.failNext({ kind: "status", status: 429 });
    const response = await chat();
    expect(response.status).toBe(429);
    const body = (await response.json()) as { error: { message: string } };
    expect(body.error.message).toBeTruthy();
    expect((await chat()).status).toBe(200);
  });

  it("Fehlerstatus mit eigenem Körper, mehrfach und auch für die Modell-Liste", async () => {
    provider.failNext({ kind: "status", status: 500, body: { error: { message: "kaputt" } } }, 2);
    const first = await chat();
    expect(first.status).toBe(500);
    expect(await first.json()).toEqual({ error: { message: "kaputt" } });
    const models = await fetch(`${baseUrl}/models`, {
      headers: { authorization: `Bearer ${API_KEY}` },
    });
    expect(models.status).toBe(500);
    expect((await chat()).status).toBe(200);
  });

  it("Abbruch mitten im Strom: der Client bekommt einen Fehler, aber vorher Stücke", async () => {
    provider.failNext({ kind: "abbruch", afterChunks: 3 });
    const response = await chat({ stream: true });
    const seen: string[] = [];
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let failed = false;
    try {
      for (;;) {
        if (!reader) throw new Error("kein Körper");
        const { done, value } = await reader.read();
        if (done) break;
        seen.push(decoder.decode(value));
      }
    } catch {
      failed = true;
    }
    const all = seen.join("");
    expect(all).toContain("data: ");
    expect(all).not.toContain("[DONE]");
    // Entweder Lesefehler oder ein vorzeitiges Ende ohne [DONE]
    expect(failed || !all.includes("[DONE]")).toBe(true);
    expect(provider.requests[0]?.closedByClient).toBe(false);
  });

  it("Abbruch ohne Strom trennt die Verbindung", async () => {
    provider.failNext({ kind: "abbruch", afterChunks: 0 });
    await expect(chat()).rejects.toThrow();
  });

  it("Hängen: es kommt nie eine Antwort, der Abbruch des Clients wird erkannt", async () => {
    provider.failNext({ kind: "haengen" });
    const controller = new AbortController();
    const pending = chat({}, "Hallo", controller.signal).catch(() => "abgebrochen");
    await until(() => provider.requests.length === 1);
    await new Promise((r) => setTimeout(r, 100));
    expect(provider.requests[0]?.closedByClient).toBe(false);
    controller.abort();
    await expect(pending).resolves.toBe("abgebrochen");
    await until(() => provider.requests[0]?.closedByClient === true);
  });
});

describe("Abbruch durch den Client", () => {
  it("wird erkannt und ist abfragbar; der Server schreibt nicht weiter", async () => {
    provider.configure({ chunkDelayMs: 30, reply: "x".repeat(400), chunkChars: 4 });
    const controller = new AbortController();
    const response = await chat({ stream: true }, "Hallo", controller.signal);
    const reader = response.body?.getReader();
    await reader?.read();
    expect(provider.requests[0]?.closedByClient).toBe(false);
    controller.abort();
    await reader?.read().catch(() => undefined);
    await until(() => provider.requests[0]?.closedByClient === true);
    // Läuft der Strom fertig, bleibt closedByClient falsch.
    provider.configure({ chunkDelayMs: 0, reply: "kurz" });
    const events = await readSse(await chat({ stream: true }, "Zweite", undefined));
    expect(events.at(-1)?.data).toBe("[DONE]");
    await until(() => provider.requests.length === 2);
    expect(provider.requests[1]?.closedByClient).toBe(false);
  });
});

describe("Anhalten mitten im Strom", () => {
  it("hält nach den ersten Stücken an, bis der Client schließt; danach kein [DONE]", async () => {
    provider.configure({ reply: "abcdefghijkl", chunkChars: 4, holdAfterChunks: 2 });
    const controller = new AbortController();
    const response = await chat({ stream: true }, "Hallo", controller.signal);
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let text = "";
    while (!text.includes('"efgh"')) {
      const teil = await reader?.read();
      if (!teil || teil.done) break;
      text += decoder.decode(teil.value);
    }
    expect(text).toContain('"abcd"');
    expect(text).toContain('"efgh"');
    // Nichts weiter: das dritte Stück kommt nicht, solange die Verbindung offen ist
    const weiter = await Promise.race([
      reader?.read().then(() => "weiter"),
      new Promise((resolve) => setTimeout(() => resolve("still"), 150)),
    ]);
    expect(weiter).toBe("still");
    controller.abort();
    await until(() => provider.requests[0]?.closedByClient === true);
  });

  it("nimmt holdAfterChunks über die Steuerung an und prüft den Wert", async () => {
    const gut = await fetch(`${origin}/_steuerung/verhalten`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ holdAfterChunks: 1 }),
    });
    expect(gut.status).toBe(200);
    const schlecht = await fetch(`${origin}/_steuerung/verhalten`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ holdAfterChunks: -1 }),
    });
    expect(schlecht.status).toBe(400);
  });
});

describe("Werkzeug-Aufruf", () => {
  const toolCall = { name: "wetter_abfragen", arguments: { stadt: "Berlin", tage: 3 } };

  it("kommt im Strom in gültiger Form an (Name zuerst, Argumente in Stücken)", async () => {
    provider.configure({ reply: "", toolCall });
    const events = await readSse(
      await chat({ stream: true, stream_options: { include_usage: true } }),
    );
    const chunks = jsonEvents(events);
    const calls = chunks.flatMap((c) => c.choices[0]?.delta?.tool_calls ?? []);
    expect(calls[0]).toMatchObject({
      index: 0,
      type: "function",
      function: { name: "wetter_abfragen" },
    });
    expect(calls[0].id).toMatch(/^call_fake_/);
    expect(calls.length).toBeGreaterThan(2);
    expect(calls.slice(1).every((c) => c.index === 0 && !("id" in c) && !c.function.name)).toBe(
      true,
    );
    const args = calls.map((c) => c.function.arguments).join("");
    expect(JSON.parse(args)).toEqual({ stadt: "Berlin", tage: 3 });
    const finish = chunks.find((c) => c.choices[0]?.finish_reason);
    expect(finish?.choices[0].finish_reason).toBe("tool_calls");
    expect(chunks.at(-1)?.usage.completion_tokens).toBeGreaterThan(0);
    expect(textOf(events)).toBe("");
  });

  it("kommt ohne Strom als tool_calls in der Nachricht", async () => {
    provider.configure({ reply: "", toolCall: { ...toolCall, id: "call_eigene_1" } });
    const body = (await (await chat()).json()) as Json;
    expect(body.choices[0].finish_reason).toBe("tool_calls");
    expect(body.choices[0].message.content).toBeNull();
    expect(body.choices[0].message.tool_calls).toEqual([
      {
        id: "call_eigene_1",
        type: "function",
        function: { name: "wetter_abfragen", arguments: JSON.stringify(toolCall.arguments) },
      },
    ]);
  });

  it("nach dem Werkzeug-Ergebnis antwortet er wieder mit Text", async () => {
    provider.configure({ toolCall });
    const response = await post(FAKE_PROVIDER_PATHS.chatCompletions, {
      model: "fake/test-modell",
      messages: [
        { role: "user", content: "Wetter?" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            { id: "c1", type: "function", function: { name: "wetter_abfragen", arguments: "{}" } },
          ],
        },
        { role: "tool", tool_call_id: "c1", content: "sonnig" },
      ],
    });
    const body = (await response.json()) as Json;
    expect(body.choices[0].finish_reason).toBe("stop");
    expect(body.choices[0].message.tool_calls).toBeUndefined();
  });
});

describe("Protokoll", () => {
  it("enthält die gesendeten Nachrichten, Kopfzeilen und Zeitpunkt", async () => {
    const messages = [
      { role: "system", content: "Du bist Pai." },
      { role: "user", content: "Hallo, ich bin Max Mustermann." },
    ];
    await post(FAKE_PROVIDER_PATHS.chatCompletions, {
      model: "fake/test-modell",
      messages,
      stream: false,
    });
    const [entry] = provider.requests;
    expect(entry?.method).toBe("POST");
    expect(entry?.path).toBe(FAKE_PROVIDER_PATHS.chatCompletions);
    expect(entry?.body).toMatchObject({ messages });
    expect(entry?.headers["content-type"]).toBe("application/json");
    expect(Number.isNaN(Date.parse(entry?.receivedAt ?? ""))).toBe(false);
  });

  it("zeigt eigene Kopfzeilen und die Reihenfolge des Eingangs", async () => {
    await fetch(`${baseUrl}/models`, {
      headers: { authorization: `Bearer ${API_KEY}`, "x-litellm-session-id": "u-1" },
    });
    await chat();
    expect(provider.requests.map((r) => r.path)).toEqual([
      FAKE_PROVIDER_PATHS.models,
      FAKE_PROVIDER_PATHS.chatCompletions,
    ]);
    expect(provider.requests[0]?.headers["x-litellm-session-id"]).toBe("u-1");
  });

  it("die Steuerung gibt den Schlüssel nicht im Klartext heraus", async () => {
    await chat();
    const text = await (await fetch(`${origin}${FAKE_CONTROL_PATHS.anfragen}`)).text();
    expect(text).not.toContain(API_KEY);
    expect(text).toContain("Hallo");
  });
});

describe("Steuerung über HTTP", () => {
  const control = (path: string, body?: unknown) =>
    fetch(`${origin}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

  it("legt Verhalten fest, plant Fehler, liest Anfragen und setzt zurück", async () => {
    expect(
      (await control(FAKE_CONTROL_PATHS.verhalten, { reply: "Per HTTP gesetzt", chunkChars: 100 }))
        .status,
    ).toBe(200);
    const body = (await (await chat()).json()) as Json;
    expect(body.choices[0].message.content).toBe("Per HTTP gesetzt");

    expect(
      (await control(FAKE_CONTROL_PATHS.fehler, { kind: "status", status: 502, count: 2 })).status,
    ).toBe(200);
    expect((await chat()).status).toBe(502);
    expect((await chat()).status).toBe(502);
    expect((await chat()).status).toBe(200);

    const list = (await (await fetch(`${origin}${FAKE_CONTROL_PATHS.anfragen}`)).json()) as {
      requests: unknown[];
    };
    expect(list.requests).toHaveLength(4);

    expect((await control(FAKE_CONTROL_PATHS.zuruecksetzen)).status).toBe(200);
    const after = (await (await fetch(`${origin}${FAKE_CONTROL_PATHS.anfragen}`)).json()) as {
      requests: unknown[];
    };
    expect(after.requests).toEqual([]);
  });

  it("steuert Werkzeug-Aufruf und Abbruch über HTTP und weist Unsinn ab", async () => {
    expect(
      (
        await control(FAKE_CONTROL_PATHS.verhalten, {
          reply: "",
          toolCall: { name: "t", arguments: { a: 1 } },
        })
      ).status,
    ).toBe(200);
    expect(((await (await chat()).json()) as Json).choices[0].finish_reason).toBe("tool_calls");
    expect((await control(FAKE_CONTROL_PATHS.verhalten, { toolCall: null })).status).toBe(200);
    expect(((await (await chat()).json()) as Json).choices[0].finish_reason).toBe("stop");

    expect(
      (await control(FAKE_CONTROL_PATHS.fehler, { kind: "abbruch", afterChunks: 1 })).status,
    ).toBe(200);
    await expect(readSse(await chat({ stream: true }))).rejects.toThrow();

    expect((await control(FAKE_CONTROL_PATHS.fehler, { kind: "quatsch" })).status).toBe(400);
    expect((await control(FAKE_CONTROL_PATHS.fehler, { kind: "status", status: 200 })).status).toBe(
      400,
    );
    expect((await control(FAKE_CONTROL_PATHS.verhalten, { chunkChars: 0 })).status).toBe(400);
    expect((await control(FAKE_CONTROL_PATHS.verhalten, { unbekannt: 1 })).status).toBe(400);
    const wrong = await fetch(`${origin}${FAKE_CONTROL_PATHS.zuruecksetzen}`);
    expect(wrong.status).toBe(405);
  });
});

describe("Zurücksetzen", () => {
  it("leert Protokoll, geplante Fehler und Verhalten", async () => {
    provider.configure({
      reply: "anders",
      chunkDelayMs: 500,
      toolCall: { name: "t", arguments: {} },
    });
    provider.failNext({ kind: "status", status: 500 }, 3);
    await fetch(`${baseUrl}/models`, { headers: { authorization: `Bearer ${API_KEY}` } });
    expect(provider.requests).toHaveLength(1);

    provider.reset();
    expect(provider.requests).toEqual([]);
    const body = (await (await chat()).json()) as Json;
    expect(body.choices[0].message.content).toBe("Hallo Welt, das ist ein Test.");
    expect(body.choices[0].message.tool_calls).toBeUndefined();
  });

  it("beendet hängende Anfragen", async () => {
    provider.failNext({ kind: "haengen" });
    const pending = chat().then(
      () => "fertig",
      () => "getrennt",
    );
    await until(() => provider.requests.length === 1);
    provider.reset();
    await expect(pending).resolves.toBe("getrennt");
  });
});

describe("Parallele Anfragen", () => {
  it("stören sich nicht", async () => {
    provider.configure({
      chunkDelayMs: 15,
      reply: (messages) => `Antwort auf ${String(messages.at(-1)?.content)} ${"+".repeat(30)}`,
    });
    const names = ["Anna", "Ben", "Cem", "Dora", "Emil"];
    const results = await Promise.all(
      names.map(async (name) => {
        const events = await readSse(
          await chat({ stream: true, stream_options: { include_usage: true } }, name),
        );
        return { name, text: textOf(events), done: events.at(-1)?.data };
      }),
    );
    for (const result of results) {
      expect(result.text).toBe(`Antwort auf ${result.name} ${"+".repeat(30)}`);
      expect(result.done).toBe("[DONE]");
    }
    expect(provider.requests).toHaveLength(names.length);
  });

  it("ein hängender Aufruf blockiert andere nicht, und Abbruch trifft nur den einen", async () => {
    provider.failNext({ kind: "haengen" });
    const controller = new AbortController();
    const hanging = chat({}, "hängt", controller.signal).catch(() => "abgebrochen");
    await until(() => provider.requests.length === 1);
    const other = await chat({}, "frei");
    expect(other.status).toBe(200);
    controller.abort();
    await hanging;
    await until(() => provider.requests[0]?.closedByClient === true);
    expect(provider.requests[1]?.closedByClient).toBe(false);
  });
});

describe("Schutz der Steuerung", () => {
  it("mit Steuer-Schlüssel: ohne oder mit falschem Schlüssel 401, mit richtigem 200", async () => {
    const key = randomBytes(24).toString("base64url");
    const guarded = createFakeProvider({}, { key });
    const started = await guarded.start({ port: 0 });
    const at = new URL(started.baseUrl).origin;
    try {
      const url = `${at}${FAKE_CONTROL_PATHS.anfragen}`;
      expect((await fetch(url)).status).toBe(401);
      expect((await fetch(url, { headers: { [FAKE_CONTROL_KEY_HEADER]: "falsch" } })).status).toBe(
        401,
      );
      const reset = await fetch(`${at}${FAKE_CONTROL_PATHS.zuruecksetzen}`, {
        method: "POST",
        headers: { [FAKE_CONTROL_KEY_HEADER]: `${key}x` },
      });
      expect(reset.status).toBe(401);
      expect((await fetch(url, { headers: { [FAKE_CONTROL_KEY_HEADER]: key } })).status).toBe(200);
      expect((await fetch(`${at}${FAKE_PROVIDER_PATHS.models}`)).status).toBe(200);
    } finally {
      await guarded.stop();
    }
  });

  it("ohne Schlüssel nur von Loopback", async () => {
    const outside = Object.values(networkInterfaces())
      .flat()
      .find((i) => i !== undefined && i.family === "IPv4" && !i.internal)?.address;
    const open = createFakeProvider();
    const started = await open.start({ host: "0.0.0.0", port: 0 });
    try {
      const local = await fetch(`http://127.0.0.1:${started.port}${FAKE_CONTROL_PATHS.anfragen}`);
      expect(local.status).toBe(200);
      if (outside !== undefined) {
        const remote = await fetch(
          `http://${outside}:${started.port}${FAKE_CONTROL_PATHS.anfragen}`,
        );
        expect(remote.status).toBe(403);
        const api = await fetch(`http://${outside}:${started.port}${FAKE_PROVIDER_PATHS.models}`);
        expect(api.status).toBe(200);
      }
    } finally {
      await open.stop();
    }
  });

  it("erkennt Loopback-Adressen", () => {
    expect(isLoopback("127.0.0.1")).toBe(true);
    expect(isLoopback("127.10.0.3")).toBe(true);
    expect(isLoopback("::1")).toBe(true);
    expect(isLoopback("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopback("10.0.0.1")).toBe(false);
    expect(isLoopback("::ffff:10.0.0.1")).toBe(false);
    expect(isLoopback("1127.0.0.1")).toBe(false);
    expect(isLoopback(undefined)).toBe(false);
  });
});
