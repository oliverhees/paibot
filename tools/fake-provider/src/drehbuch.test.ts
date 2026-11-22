/**
 * PaiBot – Tests für das Drehbuch des Test-Anbieters (Antworten auf der Leitung, im Strom und
 * ohne Strom, auch mit absichtlich ungültigen Werkzeug-Aufrufen).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { connect } from "node:net";
import { networkInterfaces, tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checkScript,
  createFakeProvider,
  FAKE_CONTROL_KEY_HEADER,
  FAKE_CONTROL_PATHS,
  FAKE_PROVIDER_PATHS,
  type FakeProvider,
  type FakeScript,
  type FakeScriptStep,
  toolCallsRepeated,
} from "./index";

// biome-ignore lint/suspicious/noExplicitAny: Antworten des Test-Anbieters sind frei geformt
type Json = Record<string, any>;

interface Assembled {
  /** Rohe, geparste Stücke (nur mit Strom). */
  chunks: Json[];
  text: string;
  reasoning: string | undefined;
  reasoningContent: string | undefined;
  calls: { index: number; id: string; name: string; arguments: string }[];
  finish: string | null;
  usage: Json | undefined;
}

let provider: FakeProvider;
let origin: string;

beforeEach(async () => {
  provider = createFakeProvider({ chunkChars: 4, reply: "Normale Antwort." });
  const started = await provider.start({ port: 0 });
  origin = new URL(started.baseUrl).origin;
});

afterEach(async () => {
  await provider.stop();
});

function rawChat(
  stream: boolean,
  extra: Record<string, unknown> = {},
  messages: unknown[] = [{ role: "user", content: "Hallo" }],
  at = origin,
) {
  return fetch(`${at}${FAKE_PROVIDER_PATHS.chatCompletions}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model: "fake/test-modell",
      messages,
      ...(stream ? { stream: true, stream_options: { include_usage: true } } : {}),
      ...extra,
    }),
  });
}

/** Schickt eine Chat-Anfrage und setzt die Antwort auf der Leitung zu einer Form zusammen. */
async function ask(
  stream: boolean,
  extra: Record<string, unknown> = {},
  messages?: unknown[],
  at = origin,
): Promise<Assembled> {
  const response = await rawChat(stream, extra, messages, at);
  expect(response.status).toBe(200);
  if (!stream) {
    const body = (await response.json()) as Json;
    const message = body.choices[0].message as Json;
    return {
      chunks: [],
      text: message.content ?? "",
      reasoning: message.reasoning,
      reasoningContent: message.reasoning_content,
      calls: ((message.tool_calls ?? []) as Json[]).map((c, index) => ({
        index,
        id: c.id,
        name: c.function.name,
        arguments: c.function.arguments,
      })),
      finish: body.choices[0].finish_reason,
      usage: body.usage,
    };
  }
  const raw = await response.text();
  expect(raw.endsWith("data: [DONE]\n\n")).toBe(true);
  const chunks = raw
    .split("\n\n")
    .filter((block) => block.startsWith("data: ") && block !== "data: [DONE]")
    .map((block) => JSON.parse(block.slice(6)) as Json);
  const out: Assembled = {
    chunks,
    text: "",
    reasoning: undefined,
    reasoningContent: undefined,
    calls: [],
    finish: null,
    usage: undefined,
  };
  for (const chunk of chunks) {
    if (chunk.usage) out.usage = chunk.usage;
    const choice = chunk.choices[0];
    if (!choice) continue;
    if (choice.finish_reason) out.finish = choice.finish_reason;
    const delta = choice.delta as Json;
    if (typeof delta.content === "string") out.text += delta.content;
    if (typeof delta.reasoning === "string")
      out.reasoning = (out.reasoning ?? "") + delta.reasoning;
    if (typeof delta.reasoning_content === "string") {
      out.reasoningContent = (out.reasoningContent ?? "") + delta.reasoning_content;
    }
    for (const c of (delta.tool_calls ?? []) as Json[]) {
      if ("id" in c) {
        expect(c.index).toBe(out.calls.length);
        out.calls.push({
          index: c.index,
          id: c.id,
          name: c.function.name,
          arguments: c.function.arguments,
        });
      } else {
        const target = out.calls[c.index];
        expect(target).toBeDefined();
        if (target) target.arguments += c.function.arguments;
      }
    }
  }
  return out;
}

function setScript(steps: FakeScriptStep[], after?: FakeScript["after"]) {
  provider.configure({ script: after ? { steps, after } : { steps } });
}

const BOTH = [
  ["ohne Strom", false],
  ["im Strom", true],
] as const;

describe.each(BOTH)("Drehbuch-Arten, %s", (_label, stream) => {
  it("(a) Text und Aufruf im selben Schritt", async () => {
    setScript([
      { text: "Ich schaue nach.", toolCalls: [{ name: "suche", arguments: { q: "x" } }] },
    ]);
    const r = await ask(stream);
    expect(r.text).toBe("Ich schaue nach.");
    expect(r.calls).toHaveLength(1);
    expect(r.calls[0]).toMatchObject({ name: "suche", arguments: '{"q":"x"}' });
    expect(r.calls[0]?.id).toMatch(/^call_fake_\d+$/);
    expect(r.finish).toBe("tool_calls");
  });

  it("(b) mehrere Aufrufe in einem Schritt, Reihenfolge und Index stimmen", async () => {
    setScript([
      {
        toolCalls: [
          { name: "eins", arguments: { n: 1 } },
          { name: "zwei", arguments: { n: 2 }, pieces: 5 },
          { name: "drei", arguments: "{}" },
        ],
      },
    ]);
    const r = await ask(stream);
    expect(r.calls.map((c) => [c.index, c.name, c.arguments])).toEqual([
      [0, "eins", '{"n":1}'],
      [1, "zwei", '{"n":2}'],
      [2, "drei", "{}"],
    ]);
    expect(new Set(r.calls.map((c) => c.id)).size).toBe(3);
    expect(r.text).toBe("");
  });

  it("(c) 500 Aufrufe in einem Schritt", async () => {
    setScript([
      { toolCalls: toolCallsRepeated(500, (i) => ({ name: `werkzeug_${i}`, arguments: { i } })) },
    ]);
    const r = await ask(stream);
    expect(r.calls).toHaveLength(500);
    for (const [i, call] of r.calls.entries()) {
      expect(call.index).toBe(i);
      expect(call.name).toBe(`werkzeug_${i}`);
      expect(JSON.parse(call.arguments)).toEqual({ i });
    }
    expect(new Set(r.calls.map((c) => c.id)).size).toBe(500);
  });

  it("(d) ungewöhnliche Namen werden genau so gesendet", async () => {
    const names = ["a.b", "", "x".repeat(65), "größe_über", "name‮evil"];
    setScript([{ toolCalls: names.map((name) => ({ name, arguments: {} })) }]);
    const r = await ask(stream);
    expect(r.calls.map((c) => c.name)).toEqual(names);
    expect(r.calls[2]?.name).toHaveLength(65);
    expect(r.calls[4]?.name.includes("‮")).toBe(true);
  });

  it("(e) kaputtes JSON in den Argumenten kommt unverändert an", async () => {
    const broken = '{"frage": "Not';
    setScript([{ toolCalls: [{ name: "doku_nachschlagen", arguments: broken, pieces: 4 }] }]);
    const r = await ask(stream);
    expect(r.calls[0]?.arguments).toBe(broken);
    expect(() => JSON.parse(broken)).toThrow();
  });

  it("(f) Schema-Verstoß: zusätzliches Feld und Text über der Grenze", async () => {
    const tooLong = "ü".repeat(5000);
    setScript([
      {
        toolCalls: [
          { name: "rechnen", arguments: { a: 5000, b: 7, op: "hoch", extra: 1 } },
          { name: "merken", arguments: { text: tooLong } },
        ],
      },
    ]);
    const r = await ask(stream);
    expect(JSON.parse(r.calls[0]?.arguments ?? "")).toEqual({
      a: 5000,
      b: 7,
      op: "hoch",
      extra: 1,
    });
    expect(JSON.parse(r.calls[1]?.arguments ?? "").text).toHaveLength(5000);
  });

  it("(g) doppelte Kennung in einem Schritt wird zweimal gesendet", async () => {
    setScript([
      {
        toolCalls: [
          { id: "doppelt", name: "a", arguments: {} },
          { id: "doppelt", name: "b", arguments: {} },
        ],
      },
    ]);
    const r = await ask(stream);
    expect(r.calls.map((c) => [c.index, c.id])).toEqual([
      [0, "doppelt"],
      [1, "doppelt"],
    ]);
  });

  it("(h) fehlende Verbrauchsangabe trotz include_usage; feste Zahlen sonst", async () => {
    setScript([
      { text: "ohne", usage: false },
      { text: "fest", usage: { prompt: 11, completion: 22 } },
      { text: "geschätzt" },
    ]);
    const ohne = await ask(stream, { stream_options: { include_usage: true } });
    expect(ohne.usage).toBeUndefined();
    if (stream) expect(ohne.chunks.some((c) => "usage" in c)).toBe(false);
    const fest = await ask(stream, { stream_options: { include_usage: true } });
    expect(fest.usage).toEqual({ prompt_tokens: 11, completion_tokens: 22, total_tokens: 33 });
    const geschaetzt = await ask(stream, { stream_options: { include_usage: true } });
    expect(geschaetzt.usage?.completion_tokens).toBeGreaterThan(0);
  });

  it("(i) Denk-Text in `reasoning` und in `reasoning_content`", async () => {
    setScript([
      { reasoning: { text: "Ich überlege kurz." }, text: "Antwort A" },
      { reasoning: { text: "Zweiter Gedanke.", field: "reasoning_content" }, text: "Antwort B" },
    ]);
    const a = await ask(stream);
    expect(a.reasoning).toBe("Ich überlege kurz.");
    expect(a.reasoningContent).toBeUndefined();
    expect(a.text).toBe("Antwort A");
    const b = await ask(stream);
    expect(b.reasoningContent).toBe("Zweiter Gedanke.");
    expect(b.reasoning).toBeUndefined();
    expect(b.text).toBe("Antwort B");
  });

  it("(j) Aufruf, obwohl die Anfrage keine `tools` enthält", async () => {
    setScript([{ toolCalls: [{ name: "unerbeten", arguments: { x: 1 } }] }]);
    const r = await ask(stream);
    expect(r.calls[0]?.name).toBe("unerbeten");
    const last = provider.requests.at(-1)?.body as Json;
    expect("tools" in last).toBe(false);
  });

  it("(k) `letzten-wiederholen` liefert nach dem letzten Schritt endlos Aufrufe (20 Anfragen)", async () => {
    setScript(
      [{ text: "Start" }, { toolCalls: [{ name: "wieder", arguments: { n: 1 } }] }],
      "letzten-wiederholen",
    );
    const first = await ask(stream);
    expect(first.calls).toHaveLength(0);
    for (let i = 0; i < 19; i += 1) {
      const r = await ask(stream);
      expect(r.calls.map((c) => c.name)).toEqual(["wieder"]);
      expect(r.finish).toBe("tool_calls");
    }
    expect(provider.scriptPosition()).toBe(20);
    expect(provider.requests.slice(1).every((q) => q.scriptStep === 1)).toBe(true);
  });

  it("(k2) ohne `after` kommt nach dem letzten Schritt wieder das normale Verhalten", async () => {
    setScript([{ toolCalls: [{ name: "einmal", arguments: {} }] }]);
    expect((await ask(stream)).calls).toHaveLength(1);
    const normal = await ask(stream);
    expect(normal.calls).toHaveLength(0);
    expect(normal.text).toBe("Normale Antwort.");
    expect(provider.requests.at(-1)?.scriptStep).toBeUndefined();
  });

  it("(l) mehrere Schritte nacheinander mit `role: tool`-Nachrichten dazwischen", async () => {
    setScript([
      { toolCalls: [{ id: "c1", name: "suche", arguments: { q: "a" } }] },
      { text: "Noch einer.", toolCalls: [{ id: "c2", name: "suche", arguments: { q: "b" } }] },
      { text: "Fertig." },
    ]);
    const user = { role: "user", content: "Frage" };
    const call = (id: string) => ({
      role: "assistant",
      content: null,
      tool_calls: [{ id, type: "function", function: { name: "suche", arguments: "{}" } }],
    });
    const one = await ask(stream, {}, [user]);
    expect(one.calls.map((c) => c.id)).toEqual(["c1"]);
    const two = await ask(stream, {}, [
      user,
      call("c1"),
      { role: "tool", tool_call_id: "c1", content: "E1" },
    ]);
    expect(two.text).toBe("Noch einer.");
    expect(two.calls.map((c) => c.id)).toEqual(["c2"]);
    const three = await ask(stream, {}, [
      user,
      call("c1"),
      { role: "tool", tool_call_id: "c1", content: "E1" },
      call("c2"),
      { role: "tool", tool_call_id: "c2", content: "E2" },
    ]);
    expect(three.text).toBe("Fertig.");
    expect(three.calls).toHaveLength(0);
    expect(three.finish).toBe("stop");
  });

  it("`finish` überschreibt den Standard-Abschlussgrund", async () => {
    setScript([{ text: "abgeschnitten", finish: "length" }]);
    expect((await ask(stream)).finish).toBe("length");
  });
});

describe.each(BOTH)("Ränder der Aufruf-Kennung, %s", (_label, stream) => {
  it("leere und 201 Zeichen lange Kennung werden genau so gesendet", async () => {
    const long = "k".repeat(201);
    setScript([
      {
        toolCalls: [
          { id: "", name: "leer", arguments: {} },
          { id: long, name: "lang", arguments: {} },
          { id: "k".repeat(200), name: "grenze", arguments: {} },
        ],
      },
    ]);
    const r = await ask(stream);
    expect(r.calls[0]?.id).toBe("");
    expect(r.calls[1]?.id).toBe(long);
    expect(r.calls[1]?.id).toHaveLength(201);
    expect(r.calls[2]?.id).toHaveLength(200);
  });
});

describe("Aufbau des Stroms", () => {
  it("Name im ersten Stück, Argumente in `pieces` Stücken, Denk-Text vor Text", async () => {
    setScript([
      {
        reasoning: { text: "denkt" },
        text: "Text",
        toolCalls: [{ name: "w", arguments: "0123456789", pieces: 5 }],
      },
    ]);
    const r = await ask(true);
    const deltas = r.chunks
      .map((c) => c.choices[0]?.delta as Json | undefined)
      .filter(Boolean) as Json[];
    const calls = deltas.flatMap((d) => d.tool_calls ?? []) as Json[];
    expect(calls[0]).toMatchObject({
      index: 0,
      type: "function",
      function: { name: "w", arguments: "" },
    });
    expect(calls.slice(1).map((c) => c.function.arguments)).toEqual(["01", "23", "45", "67", "89"]);
    expect(calls.slice(1).every((c) => !("id" in c) && !("name" in c.function))).toBe(true);
    const reasoningAt = deltas.findIndex((d) => typeof d.reasoning === "string");
    const firstText = deltas.findIndex((d) => typeof d.content === "string" && d.content !== "");
    expect(reasoningAt).toBeGreaterThanOrEqual(0);
    expect(reasoningAt).toBeLessThan(firstText);
  });

  it("Standard sind drei Stücke", async () => {
    setScript([{ toolCalls: [{ name: "w", arguments: "abcdefghi" }] }]);
    const r = await ask(true);
    const pieces = r.chunks
      .flatMap((c) => (c.choices[0]?.delta?.tool_calls ?? []) as Json[])
      .slice(1)
      .map((c) => c.function.arguments);
    expect(pieces).toEqual(["abc", "def", "ghi"]);
  });

  it("alte Einstellung `toolCall` bleibt unverändert (Stücke nach chunkChars)", async () => {
    provider.configure({ reply: "", toolCall: { name: "alt", arguments: "0123456789" } });
    const r = await ask(true);
    const pieces = r.chunks
      .flatMap((c) => (c.choices[0]?.delta?.tool_calls ?? []) as Json[])
      .slice(1)
      .map((c) => c.function.arguments);
    expect(pieces).toEqual(["0123", "4567", "89"]);
  });
});

describe("Protokoll (anfragen)", () => {
  it("nennt je Anfrage `scriptStep`, angebotene `tools` und `role: tool`-Inhalte", async () => {
    const key = randomBytes(16).toString("base64url");
    const guarded = createFakeProvider({}, { key });
    const started = await guarded.start({ port: 0 });
    const at = new URL(started.baseUrl).origin;
    try {
      guarded.configure({
        script: {
          steps: [
            { toolCalls: [{ id: "c1", name: "suche", arguments: { q: "a" } }] },
            { toolCalls: [{ id: "c2", name: "suche", arguments: { q: "b" } }] },
            { text: "Fertig." },
          ],
        },
      });
      const tools = [
        { type: "function", function: { name: "suche", parameters: { type: "object" } } },
      ];
      const user = { role: "user", content: "Frage" };
      const call = (id: string) => ({
        role: "assistant",
        content: null,
        tool_calls: [{ id, type: "function", function: { name: "suche", arguments: "{}" } }],
      });
      await ask(false, { tools }, [user], at);
      await ask(
        false,
        { tools },
        [user, call("c1"), { role: "tool", tool_call_id: "c1", content: "Ergebnis EINS" }],
        at,
      );
      await ask(
        true,
        { tools },
        [
          user,
          call("c1"),
          { role: "tool", tool_call_id: "c1", content: "Ergebnis EINS" },
          call("c2"),
          { role: "tool", tool_call_id: "c2", content: "Ergebnis ZWEI" },
        ],
        at,
      );
      const list = (await (
        await fetch(`${at}${FAKE_CONTROL_PATHS.anfragen}`, {
          headers: { [FAKE_CONTROL_KEY_HEADER]: key },
        })
      ).json()) as { requests: Json[] };
      expect(list.requests.map((q) => q.scriptStep)).toEqual([0, 1, 2]);
      expect(
        list.requests.every((q) => JSON.stringify(q.body.tools) === JSON.stringify(tools)),
      ).toBe(true);
      const toolContents = (q: Json) =>
        (q.body.messages as Json[]).filter((m) => m.role === "tool").map((m) => m.content);
      expect(toolContents(list.requests[0] as Json)).toEqual([]);
      expect(toolContents(list.requests[1] as Json)).toEqual(["Ergebnis EINS"]);
      expect(toolContents(list.requests[2] as Json)).toEqual(["Ergebnis EINS", "Ergebnis ZWEI"]);
    } finally {
      await guarded.stop();
    }
  });

  it("Anfragen, die nicht beantwortet werden, verbrauchen keinen Schritt", async () => {
    setScript([{ text: "eins" }, { text: "zwei" }]);
    provider.failNext({ kind: "status", status: 503 });
    expect((await rawChat(false)).status).toBe(503);
    const bad = await fetch(`${origin}${FAKE_PROVIDER_PATHS.chatCompletions}`, {
      method: "POST",
      body: "kein json",
    });
    expect(bad.status).toBe(400);
    expect(provider.scriptPosition()).toBe(0);
    expect((await ask(false)).text).toBe("eins");
    expect(provider.scriptPosition()).toBe(1);
    expect(provider.requests.map((q) => q.scriptStep)).toEqual([undefined, undefined, 0]);
  });
});

describe("Steuerung des Drehbuchs über HTTP", () => {
  const script: FakeScript = {
    steps: [{ text: "Aus der Steuerung", toolCalls: [{ name: "t", arguments: { a: 1 } }] }],
  };
  const send = (at: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(`${at}${FAKE_CONTROL_PATHS.drehbuch}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });

  it("mit Steuer-Schlüssel: ohne oder mit falschem Schlüssel 401 und das Drehbuch bleibt ungesetzt", async () => {
    const key = randomBytes(24).toString("base64url");
    const guarded = createFakeProvider({ reply: "normal" }, { key });
    const started = await guarded.start({ port: 0 });
    const at = new URL(started.baseUrl).origin;
    try {
      expect((await send(at, script)).status).toBe(401);
      expect((await send(at, script, { [FAKE_CONTROL_KEY_HEADER]: `${key}x` })).status).toBe(401);
      expect((await ask(false, {}, undefined, at)).calls).toHaveLength(0);
      const ok = await send(at, script, { [FAKE_CONTROL_KEY_HEADER]: key });
      expect(ok.status).toBe(200);
      const r = await ask(false, {}, undefined, at);
      expect(r.text).toBe("Aus der Steuerung");
      expect(r.calls[0]?.name).toBe("t");
    } finally {
      await guarded.stop();
    }
  });

  it("ohne Schlüssel von außerhalb von Loopback: 403", async () => {
    const outside = Object.values(networkInterfaces())
      .flat()
      .find((i) => i !== undefined && i.family === "IPv4" && !i.internal)?.address;
    // Ohne fremde Adresse im Rechner lässt sich 403 nicht auslösen; dann gilt der Test als übersprungen.
    if (outside === undefined) return;
    const open = createFakeProvider();
    const started = await open.start({ host: "0.0.0.0", port: 0 });
    try {
      const remote = await send(`http://${outside}:${started.port}`, script);
      expect(remote.status).toBe(403);
      expect((await send(`http://127.0.0.1:${started.port}`, script)).status).toBe(200);
    } finally {
      await open.stop();
    }
  });

  it("prüft die Form: falsche Form gibt 400 mit Grund, richtige 200", async () => {
    const bad: [unknown, RegExp][] = [
      ["kein json", /kein gültiges JSON/],
      [{}, /steps/],
      [{ steps: "x" }, /steps/],
      [{ steps: [], after: "immer" }, /after/],
      [{ steps: [], after: "letzten-wiederholen" }, /mindestens einen Schritt/],
      [{ steps: [{ text: 5 }] }, /text/],
      [{ steps: [{ toolCalls: [{ name: 1, arguments: {} }] }] }, /name/],
      [{ steps: [{ toolCalls: [{ name: "a", arguments: 5 }] }] }, /arguments/],
      [{ steps: [{ toolCalls: [{ name: "a", arguments: {}, pieces: 0 }] }] }, /pieces/],
      [{ steps: [{ usage: true }] }, /usage/],
      [{ steps: [{ finish: "fertig" }] }, /finish/],
      [{ steps: [{ reasoning: { text: "x", field: "andere" } }] }, /reasoning/],
      [{ steps: [{ unbekannt: 1 }] }, /unbekanntes Feld/],
    ];
    for (const [body, reason] of bad) {
      const response = await send(origin, body);
      expect(response.status, JSON.stringify(body)).toBe(400);
      expect(JSON.stringify(await response.json())).toMatch(reason);
    }
    expect(provider.scriptPosition()).toBe(0);
    const good = await send(origin, { steps: [{ usage: false }], after: "normal" });
    expect(good.status).toBe(200);
    expect((await fetch(`${origin}${FAKE_CONTROL_PATHS.drehbuch}`)).status).toBe(405);
  });

  it("setzt die Position auf 0; `zuruecksetzen` löscht das Drehbuch", async () => {
    expect((await send(origin, script)).status).toBe(200);
    expect((await ask(false)).text).toBe("Aus der Steuerung");
    expect(provider.scriptPosition()).toBe(1);
    expect((await send(origin, script)).status).toBe(200);
    expect(provider.scriptPosition()).toBe(0);
    expect((await ask(true)).calls).toHaveLength(1);
    const reset = await fetch(`${origin}${FAKE_CONTROL_PATHS.zuruecksetzen}`, { method: "POST" });
    expect(reset.status).toBe(200);
    expect(provider.scriptPosition()).toBe(0);
    const after = await ask(false);
    expect(after.calls).toHaveLength(0);
    expect(after.text).toBe("Normale Antwort.");
  });

  it("`verhalten` nimmt `script` mit derselben Prüfung an und entfernt es mit null", async () => {
    const behaviour = (body: unknown) =>
      fetch(`${origin}${FAKE_CONTROL_PATHS.verhalten}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    expect((await behaviour({ script: { steps: [{ text: "x" }], after: "kaputt" } })).status).toBe(
      400,
    );
    expect((await behaviour({ script })).status).toBe(200);
    expect((await ask(false)).text).toBe("Aus der Steuerung");
    expect((await behaviour({ script: null })).status).toBe(200);
    expect((await ask(false)).text).toBe("Normale Antwort.");
  });
});

describe("Prozess ohne Schlüssel", () => {
  it("lauscht nur auf 127.0.0.1", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "fake-provider-"));
    const outfile = path.join(dir, "fake-provider.mjs");
    const here = path.dirname(fileURLToPath(import.meta.url));
    await build({
      entryPoints: [path.join(here, "main.ts")],
      outfile,
      bundle: true,
      platform: "node",
      format: "esm",
      target: "node22",
      logLevel: "silent",
    });
    const child = spawn(process.execPath, [outfile], {
      env: { PATH: process.env.PATH ?? "", FAKE_PROVIDER_PORT: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    try {
      const baseUrl = await new Promise<string>((resolve, reject) => {
        let seen = "";
        const timer = setTimeout(
          () => reject(new Error(`Start dauerte zu lange: ${seen}`)),
          15_000,
        );
        child.once("error", reject);
        child.stdout.on("data", (part: Buffer) => {
          seen += part.toString("utf8");
          const found = /bereit: (http:\/\/\S+)/.exec(seen);
          if (found?.[1]) {
            clearTimeout(timer);
            resolve(found[1]);
          }
        });
      });
      const url = new URL(baseUrl);
      expect(url.hostname).toBe("127.0.0.1");
      const port = Number(url.port);
      const local = await send127(port);
      expect(local).toBe(200);
      const outside = Object.values(networkInterfaces())
        .flat()
        .find((i) => i !== undefined && i.family === "IPv4" && !i.internal)?.address;
      if (outside !== undefined) {
        await expect(canConnect(outside, port)).resolves.toBe(false);
      }
    } finally {
      child.kill("SIGTERM");
      await new Promise((resolve) => child.once("exit", resolve));
      await rm(dir, { recursive: true, force: true });
    }
  });
});

async function send127(port: number): Promise<number> {
  const response = await fetch(`http://127.0.0.1:${port}${FAKE_CONTROL_PATHS.drehbuch}`, {
    method: "POST",
    body: JSON.stringify({ steps: [] }),
  });
  return response.status;
}

function canConnect(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ host, port, timeout: 2000 });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

describe("Anbieter je Schritt", () => {
  it("ein Schritt mit servedBy meldet Anbieter und Modell in jedem Stück; ohne das Feld wie bisher", async () => {
    provider.configure({
      script: {
        steps: [
          { text: "eins", servedBy: { provider: "anbieter-a", model: "modell-a" } },
          { text: "zwei", servedBy: { provider: "anbieter-b" } },
          { text: "drei" },
        ],
      },
    });
    const a = await ask(true);
    expect(a.chunks.every((chunk) => chunk.provider === "anbieter-a")).toBe(true);
    expect(a.chunks.every((chunk) => chunk.model === "modell-a")).toBe(true);
    const b = await ask(false);
    expect(b.text).toBe("zwei");
    const c = await ask(true);
    expect(c.chunks.some((chunk) => "provider" in chunk)).toBe(false);
    expect(c.chunks.every((chunk) => chunk.model === "fake/test-modell")).toBe(true);
  });

  it("servedBy wird geprüft", () => {
    expect(checkScript({ steps: [{ servedBy: { provider: "" } }] })).toMatch(/servedBy/);
    expect(checkScript({ steps: [{ servedBy: { provider: "a", x: 1 } }] })).toMatch(/servedBy/);
    expect(checkScript({ steps: [{ servedBy: { provider: "a", model: 5 } }] })).toMatch(/servedBy/);
    expect(typeof checkScript({ steps: [{ servedBy: { provider: "a", model: "m" } }] })).toBe(
      "object",
    );
  });
});
