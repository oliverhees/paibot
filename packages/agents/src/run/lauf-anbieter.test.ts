/**
 * PaiBot – Verhaltens-Tests der Lauf-Steuerung mit dem echten Motor gegen den Test-Anbieter:
 * Antwort, Datenschleuse, umgebogene Adresse, Abbruch, Fehler des Anbieters, Werkzeug-Wunsch.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createGzip } from "node:zlib";
import { repo } from "@paibot/db";
import { createTestDb } from "@paibot/db/testing";
import { createFakeProvider, type FakeProvider } from "@paibot/fake-provider";
import { SCHLEUSE_SESSION_HEADER, type SchleuseConnection } from "@paibot/llm";
import { type FakeSchleuse, startFakeSchleuse } from "@paibot/llm/testing";
import { createReceiptWriter, verifyChain } from "@paibot/receipts";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createAiSdkMotor } from "../motor-aisdk";
import { type RunSetup, type RunSetupOptions, setupRun } from "../testing/lauf-umgebung";
import { executeRun } from "./ausfuehren";
import { readSchleuseStatus } from "./kontext";

const PROVIDER_KEY = `sk-test-${"p".repeat(24)}`;
const SCHLEUSE_KEY = `sk-schleuse-${"s".repeat(20)}`;
const MARKER = "Kastanienallee-Geheimnis";
const QUESTION = `Erzähl mir etwas über das ${MARKER}.`;
const REPLY = "Das ist eine Antwort vom Test-Anbieter in mehreren Stücken.";
// Steht nur in der Meldung der Datenschleuse bei einem Block.
const BLOCK_WORD = "Zitronenfalter4711";

const RECEIPT_TOOLS = {
  createWriter: createReceiptWriter,
  verify: (entries: Parameters<typeof verifyChain>[0], options: object) =>
    verifyChain(entries, options as Parameters<typeof verifyChain>[1]),
};

let provider: FakeProvider;
/** Test-Anbieter hinter der Datenschleuse; er sieht nur, was die Datenschleuse weiterreicht. */
let behind: FakeProvider;
let schleuse: FakeSchleuse;
let providerUrl: string;
let attacker: Server;
let attackerUrl: string;
const attackerSeen: string[] = [];
/** Ein bösartiger Anbieter: antwortet mit einer Bombe, einer endlosen Zeile oder riesigem Fehler. */
let hostile: Server;
let hostileUrl: string;
let hostileMode = "bombe-200";
const hostileClosed: string[] = [];
let gzipBomb: Buffer;

/** 400 MiB Nullen als gzip, ohne sie je ganz im Speicher zu haben (gepackt einige hundert KB). */
async function zeroBomb(total: number): Promise<Buffer> {
  const gzip = createGzip({ level: 9 });
  const out: Buffer[] = [];
  gzip.on("data", (chunk: Buffer) => out.push(chunk));
  const done = new Promise((resolve) => gzip.on("end", resolve));
  const zeros = Buffer.alloc(1024 * 1024);
  for (let written = 0; written < total; written += zeros.length) {
    if (!gzip.write(zeros)) await new Promise((resolve) => gzip.once("drain", resolve));
  }
  gzip.end();
  await done;
  return Buffer.concat(out);
}

beforeAll(async () => {
  provider = createFakeProvider({ apiKey: PROVIDER_KEY, reply: REPLY });
  ({ baseUrl: providerUrl } = await provider.start({ port: 0 }));
  behind = createFakeProvider({ apiKey: PROVIDER_KEY, reply: "Antwort über die Schleuse." });
  const { baseUrl: behindUrl } = await behind.start({ port: 0 });
  schleuse = await startFakeSchleuse({
    apiKey: SCHLEUSE_KEY,
    upstream: behindUrl,
    blockReason: BLOCK_WORD,
  });
  attacker = createServer((req, res) => {
    attackerSeen.push(`${req.url} ${req.headers.authorization ?? ""}`);
    res.writeHead(200, { "content-type": "application/json" }).end("{}");
  });
  await new Promise<void>((resolve) => attacker.listen(0, "127.0.0.1", resolve));
  attackerUrl = `http://127.0.0.1:${(attacker.address() as AddressInfo).port}/v1`;
  gzipBomb = await zeroBomb(400 * 1024 * 1024);
  hostile = createServer((req, res) => {
    const mode = hostileMode;
    res.on("close", () => hostileClosed.push(mode));
    req.resume();
    if (mode.startsWith("bombe-")) {
      res.writeHead(Number(mode.slice(6)), {
        "content-type": mode === "bombe-200" ? "text/event-stream" : "application/json",
        "content-encoding": "gzip",
      });
      res.end(gzipBomb);
      return;
    }
    // Endlose Zeile ohne Zeilenumbruch im Ereignis-Strom.
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write("data: ");
    const piece = Buffer.alloc(16 * 1024, 0x61);
    let open = true;
    res.on("close", () => {
      open = false;
    });
    const pump = () => {
      while (open && res.write(piece)) {
        // weiter, solange Platz ist
      }
      if (open) res.once("drain", pump);
    };
    pump();
  });
  await new Promise<void>((resolve) => hostile.listen(0, "127.0.0.1", resolve));
  hostileUrl = `http://127.0.0.1:${(hostile.address() as AddressInfo).port}/v1`;
}, 120_000);

afterAll(async () => {
  await provider.stop();
  await behind.stop();
  await schleuse.close();
  attacker.closeAllConnections();
  await new Promise((resolve) => attacker.close(resolve));
  hostile.closeAllConnections();
  await new Promise((resolve) => hostile.close(resolve));
});

afterEach(() => {
  schleuse.requests.length = 0;
  schleuse.setMode("durchlassen");
  for (const fake of [provider, behind]) {
    fake.reset();
    fake.configure({ chunkChars: 8, chunkDelayMs: 0, firstChunkDelayMs: 0, toolCall: undefined });
  }
  provider.configure({ reply: REPLY });
  vi.restoreAllMocks();
});

async function setup(extra: Partial<RunSetupOptions> = {}): Promise<RunSetup> {
  const { db } = await createTestDb();
  const env = await setupRun(db, RECEIPT_TOOLS, {
    providerBaseUrl: providerUrl,
    providerKey: PROVIDER_KEY,
    motor: createAiSdkMotor(),
    ...extra,
  });
  provider.reset();
  provider.configure({ reply: REPLY });
  return env;
}

const never = () => new AbortController().signal;

function chatRequests(fake: FakeProvider) {
  return fake.requests.filter((r) => r.path.endsWith("/chat/completions"));
}

function schleuseChats() {
  return schleuse.requests.filter((r) => r.method === "POST" && r.url === "/v1/chat/completions");
}

/** Lauf mit geforderter Datenschleuse; ihr Zustand kommt aus der echten Prüfung in zwei Stufen. */
async function setupSchleuse(connection: SchleuseConnection = schleuseConnection()) {
  const env = await setup({
    schleuse: connection,
    schleuseStatus: () => readSchleuseStatus(connection, { timeoutMs: 1000 }),
  });
  await repo.conversations.setSchleuseMode(env.db, env.conversationId, "on");
  return env;
}

function schleuseConnection(apiKey = SCHLEUSE_KEY): SchleuseConnection {
  return { baseUrl: schleuse.baseUrl, apiKey };
}

/** Alles, was ein Lauf hinterlässt: Ereignisse, Belege, Nachrichten, Lauf. */
async function everything(env: RunSetup, runId: string) {
  return JSON.stringify([
    await env.events(),
    await env.receipts(),
    await repo.messages.listForConversation(env.db, env.conversationId),
    await repo.runs.get(env.db, runId as never),
  ]);
}

async function waitFor(check: () => boolean | Promise<boolean>, timeoutMs = 5000) {
  const until = Date.now() + timeoutMs;
  while (!(await check())) {
    if (Date.now() > until) throw new Error("Zeit abgelaufen");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("mit dem echten Motor", () => {
  it("Glücksfall: Antwort gestreamt und gespeichert, Anfrage mit Anweisung und Verlauf, kein Inhalt in Belegen", async () => {
    const env = await setup();
    const { runId } = await env.queueMessage(QUESTION);
    const outcome = await executeRun(runId, env.deps, never());
    expect(outcome.status).toBe("succeeded");
    const message = await repo.messages.get(env.db, outcome.messageId as never);
    expect(message).toMatchObject({ status: "complete", content: REPLY, route: "direct" });
    expect(message?.tokensIn).toBeGreaterThan(0);
    expect(message?.tokensOut).toBeGreaterThan(0);

    const [request] = chatRequests(provider);
    expect(request?.headers.authorization).toBe(`Bearer ${PROVIDER_KEY}`);
    const body = request?.body as { messages: { role: string; content: unknown }[]; model: string };
    expect(body.model).toBe("fake/test-modell");
    expect(body.messages[0]?.role).toBe("system");
    expect(JSON.stringify(body.messages.at(-1))).toContain(MARKER);

    const result = (await env.receipts()).at(-1)?.body;
    expect(result).toMatchObject({
      type: "result",
      result: { status: "ok", tokens: { input: message?.tokensIn, output: message?.tokensOut } },
    });
    const receiptsJson = JSON.stringify(await env.receipts());
    expect(receiptsJson).not.toContain(MARKER);
    expect(receiptsJson).not.toContain(PROVIDER_KEY);
    expect((await env.verify()).ok).toBe(true);
  });

  it("Datenschleuse an und bereit: Anfrage geht an die Datenschleuse, Anbieter-Schlüssel nur im Körper an sie", async () => {
    const env = await setupSchleuse();
    const { runId } = await env.queueMessage(QUESTION);
    const outcome = await executeRun(runId, env.deps, never());
    expect(outcome.status).toBe("succeeded");
    // Prüfung in zwei Stufen: Lebenszeichen ohne Schlüssel, Modell-Liste mit ihrem Schlüssel.
    const [live, models] = schleuse.requests;
    expect(live?.url).toBe("/health/liveliness");
    expect(live?.headers.authorization).toBeUndefined();
    expect(models?.url).toBe("/v1/models");
    expect(models?.headers.authorization).toBe(`Bearer ${SCHLEUSE_KEY}`);

    expect(provider.requests).toHaveLength(0);
    const [request] = schleuseChats();
    expect(schleuseChats()).toHaveLength(1);
    expect(request?.headers.authorization).toBe(`Bearer ${SCHLEUSE_KEY}`);
    expect(request?.headers[SCHLEUSE_SESSION_HEADER]).toBe(env.conversationId);
    const body = schleuse.chatBodies()[0];
    expect(body?.model).toBe("eigener/fake/test-modell");
    expect(body?.api_key).toBe(PROVIDER_KEY);
    expect(JSON.stringify(body?.messages)).toContain(MARKER);
    // Der Anbieter hinter der Datenschleuse bekommt den Schlüssel von ihr, nicht von PaiBot.
    const [forwarded] = chatRequests(behind);
    expect(forwarded?.headers.authorization).toBe(`Bearer ${PROVIDER_KEY}`);
    expect(forwarded?.body).not.toHaveProperty("api_key");

    expect(await repo.messages.get(env.db, outcome.messageId as never)).toMatchObject({
      route: "schleuse",
      content: "Antwort über die Schleuse.",
    });
    const decision = (await env.receipts()).at(-2)?.body;
    expect(decision?.type === "decision" && decision.facts).toMatchObject({
      route: "schleuse",
      requestedMode: "on",
      schleuseReachable: true,
      targetOrigin: new URL(schleuse.baseUrl).origin,
    });
    expect(await everything(env, runId)).not.toContain(PROVIDER_KEY);
  });

  it("Datenschleuse blockiert: schleuse_blockiert, kein zweiter Versuch, kein direkter Abruf, ihre Meldung nirgends", async () => {
    schleuse.setMode("blockieren");
    const env = await setupSchleuse();
    const { runId } = await env.queueMessage(QUESTION);
    const outcome = await executeRun(runId, env.deps, never());
    expect(outcome).toMatchObject({ status: "failed", code: "schleuse_blockiert" });
    expect(schleuseChats()).toHaveLength(1);
    expect(provider.requests).toHaveLength(0);
    expect(behind.requests).toHaveLength(0);
    const types = (await env.events()).map((e) => e.type);
    expect(types).toContain("schleuse.blockiert");
    expect(types.at(-1)).toBe("run.failed");
    expect((await env.receipts()).at(-1)?.body).toMatchObject({
      result: { status: "error", code: "schleuse_blockiert" },
    });
    const all = await everything(env, runId);
    expect(all).not.toContain(BLOCK_WORD);
    expect(all).not.toMatch(/fail-closed|Exception occured/);
    expect(all).not.toContain(PROVIDER_KEY);
  });

  it("Schlüssel der Datenschleuse falsch: schluessel_ungueltig, kein Abruf, weder bei ihr noch direkt", async () => {
    const env = await setupSchleuse(schleuseConnection(`sk-falsch-${"f".repeat(20)}`));
    const { runId } = await env.queueMessage(QUESTION);
    const outcome = await executeRun(runId, env.deps, never());
    expect(outcome).toMatchObject({ status: "denied", code: "schluessel_ungueltig" });
    expect(schleuseChats()).toHaveLength(0);
    expect(provider.requests).toHaveLength(0);
    const events = await env.events();
    expect(events.find((e) => e.type === "run.denied")?.data).toMatchObject({
      code: "schluessel_ungueltig",
    });
    expect(events.some((e) => e.type === "schleuse.blockiert")).toBe(true);
    const decision = (await env.receipts()).at(-2)?.body;
    expect(decision?.type === "decision" && decision.facts).toMatchObject({
      schleuseReachable: false,
    });
  });

  it("Schlüssel der Datenschleuse beim Abruf abgelehnt: schluessel_ungueltig, kein direkter Abruf", async () => {
    const connection = schleuseConnection(`sk-falsch-${"g".repeat(20)}`);
    const env = await setup({
      schleuse: connection,
      schleuseStatus: async () => ({ installed: true, reachable: true }),
    });
    await repo.conversations.setSchleuseMode(env.db, env.conversationId, "on");
    const { runId } = await env.queueMessage(QUESTION);
    const outcome = await executeRun(runId, env.deps, never());
    expect(outcome).toMatchObject({ status: "failed", code: "schluessel_ungueltig" });
    expect(schleuseChats()).toHaveLength(1);
    expect(provider.requests).toHaveLength(0);
    expect(behind.requests).toHaveLength(0);
  });

  it.each([
    ["läuft nicht", () => ({ baseUrl: "http://127.0.0.1:9/v1", apiKey: SCHLEUSE_KEY })],
    [
      "meldet kein Lebenszeichen",
      () => {
        schleuse.setMode("krank");
        return schleuseConnection();
      },
    ],
  ])("Datenschleuse %s: abgelehnt, kein Abruf auf dem direkten Weg", async (_name, make) => {
    const env = await setupSchleuse(make());
    const { runId } = await env.queueMessage(QUESTION);
    const outcome = await executeRun(runId, env.deps, never());
    expect(outcome).toMatchObject({ status: "denied", code: "abgelehnt" });
    expect(provider.requests).toHaveLength(0);
    expect(schleuseChats()).toHaveLength(0);
    expect((await env.events()).some((e) => e.type === "schleuse.blockiert")).toBe(true);
  });

  it("Datenschleuse beim Abruf nicht erreichbar: fehlgeschlagen, kein Abruf auf dem direkten Weg", async () => {
    const connection: SchleuseConnection = {
      baseUrl: "http://127.0.0.1:9/v1",
      apiKey: SCHLEUSE_KEY,
    };
    const env = await setup({
      schleuse: connection,
      schleuseStatus: async () => ({ installed: true, reachable: true }),
    });
    await repo.conversations.setSchleuseMode(env.db, env.conversationId, "on");
    const { runId } = await env.queueMessage(QUESTION);
    const outcome = await executeRun(runId, env.deps, never());
    expect(outcome).toMatchObject({ status: "failed", code: "anbieter_nicht_erreichbar" });
    expect(provider.requests).toHaveLength(0);
  });

  it("Adresse des Anbieters nach dem Einreihen umgebogen: kein Zugang, nichts beim fremden Server", async () => {
    const env = await setup();
    const { runId } = await env.queueMessage(QUESTION);
    await repo.providers.update(env.db, env.providerId, { baseUrl: attackerUrl });
    const outcome = await executeRun(runId, env.deps, never());
    expect(outcome.status).toBe("failed");
    expect(outcome.code).toBe("schluessel_ungueltig");
    expect(attackerSeen).toEqual([]);
    expect(provider.requests).toHaveLength(0);
  });

  it("Abbruch per Signal mitten im Strom: der Anbieter sieht die Verbindung schließen", async () => {
    const env = await setup({ tuning: { deltaFlushChars: 4 } });
    provider.configure({ reply: "x".repeat(400), chunkChars: 4, chunkDelayMs: 20 });
    const { runId } = await env.queueMessage(QUESTION);
    const controller = new AbortController();
    const running = executeRun(runId, env.deps, controller.signal);
    await waitFor(async () => (await env.events()).some((e) => e.type === "text.delta"));
    controller.abort();
    const outcome = await running;
    expect(outcome.status).toBe("cancelled");
    await waitFor(() => chatRequests(provider)[0]?.closedByClient === true);
    const message = await repo.messages.get(env.db, outcome.messageId as never);
    expect(message?.status).toBe("cancelled");
    expect(message?.content.length).toBeLessThan(400);
  });

  it("Abbruch per Wunsch in der Datenbank mitten im Strom", async () => {
    const env = await setup({ tuning: { deltaFlushChars: 4, cancelPollMs: 20 } });
    provider.configure({ reply: "y".repeat(400), chunkChars: 4, chunkDelayMs: 20 });
    const { runId } = await env.queueMessage(QUESTION);
    const running = executeRun(runId, env.deps, never());
    await waitFor(async () => (await env.events()).some((e) => e.type === "text.delta"));
    await repo.runs.requestCancel(env.db, runId);
    expect((await running).status).toBe("cancelled");
    await waitFor(() => chatRequests(provider)[0]?.closedByClient === true);
  });

  it.each([
    [{ kind: "status", status: 401 } as const, "schluessel_ungueltig"],
    [{ kind: "status", status: 429 } as const, "limit_erreicht"],
    [{ kind: "status", status: 500 } as const, "anbieter_nicht_erreichbar"],
    [{ kind: "abbruch", afterChunks: 1 } as const, "anbieter_nicht_erreichbar"],
  ])("Anbieter-Fehler %o → %s, kein zweiter Versuch", async (failure, code) => {
    const env = await setup();
    provider.configure({ reply: "z".repeat(80), chunkChars: 4 });
    provider.failNext(failure, 5);
    const { runId } = await env.queueMessage(QUESTION);
    const outcome = await executeRun(runId, env.deps, never());
    expect(outcome).toMatchObject({ status: "failed", code });
    expect(chatRequests(provider)).toHaveLength(1);
    expect((await env.receipts()).at(-1)?.body).toMatchObject({
      result: { status: "error", code },
    });
  });

  it.each([
    ["bombe-200", "limit_erreicht"],
    ["zeile", "limit_erreicht"],
    ["bombe-400", "intern"],
    ["bombe-500", "anbieter_nicht_erreichbar"],
  ])(
    "bösartiger Anbieter (%s): Lauf endet sauber als fehlgeschlagen (%s), Speicher wächst kaum, Verbindung zu",
    async (mode, code) => {
      hostileMode = mode;
      const env = await setup({ providerBaseUrl: hostileUrl });
      const { runId } = await env.queueMessage(QUESTION);
      const before = process.memoryUsage().rss;
      let peak = before;
      const sampler = setInterval(() => {
        peak = Math.max(peak, process.memoryUsage().rss);
      }, 5);
      let outcome: Awaited<ReturnType<typeof executeRun>>;
      try {
        outcome = await executeRun(runId, env.deps, never());
      } finally {
        clearInterval(sampler);
      }
      // Ohne Grenze wächst der Speicher hier um über 1 GiB.
      expect(Math.max(peak, process.memoryUsage().rss) - before).toBeLessThan(128 * 1024 * 1024);
      expect(outcome).toMatchObject({ status: "failed", code });
      expect((await env.receipts()).at(-1)?.body).toMatchObject({
        result: { status: "error", code },
      });
      await waitFor(() => hostileClosed.includes(mode));
    },
    60_000,
  );

  it("Anbieter antwortet nicht: Leerlauf-Grenze → anbieter_nicht_erreichbar, Verbindung geschlossen", async () => {
    const env = await setup({ tuning: { idleTimeoutMs: 300 } });
    provider.failNext({ kind: "haengen" });
    const { runId } = await env.queueMessage(QUESTION);
    const outcome = await executeRun(runId, env.deps, never());
    expect(outcome).toMatchObject({ status: "failed", code: "anbieter_nicht_erreichbar" });
    expect(chatRequests(provider)).toHaveLength(1);
    await waitFor(() => chatRequests(provider)[0]?.closedByClient === true);
  });

  it("ein Fehlertext des Anbieters mit Schlüssel-Muster taucht nirgends auf", async () => {
    const leaked = "sk-live-AbCdEf0123456789XyZ";
    const logs = [
      vi.spyOn(console, "log"),
      vi.spyOn(console, "error"),
      vi.spyOn(console, "warn"),
      vi.spyOn(console, "info"),
    ];
    const env = await setup();
    provider.failNext({
      kind: "status",
      status: 500,
      body: { error: { message: `Ungültig: ${leaked} für ${PROVIDER_KEY}`, type: "x" } },
    });
    const { runId } = await env.queueMessage(QUESTION);
    await executeRun(runId, env.deps, never());
    const everything = JSON.stringify([
      await env.events(),
      await env.receipts(),
      await repo.messages.listForConversation(env.db, env.conversationId),
      await repo.runs.get(env.db, runId),
      logs.map((spy) => spy.mock.calls),
    ]);
    expect(everything).not.toContain(leaked);
    expect(everything).not.toContain(PROVIDER_KEY);
  });

  it("Werkzeug-Wunsch des Modells ohne Werkzeuge: abgelehnt, nichts ausgeführt, keine zweite Anfrage", async () => {
    const env = await setup();
    provider.configure({ reply: "", toolCall: { name: "rechner", arguments: { a: 1 } } });
    const { runId } = await env.queueMessage(QUESTION);
    const outcome = await executeRun(runId, env.deps, never());
    expect(outcome).toMatchObject({ status: "failed", code: "abgelehnt" });
    expect(chatRequests(provider)).toHaveLength(1);
    expect(
      (chatRequests(provider)[0]?.body as { tools?: unknown } | undefined)?.tools,
    ).toBeUndefined();
  });
});
