/**
 * PaiBot – Werkzeug-Aufrufe durch das Tor mit dem AI-SDK-Motor: ablehnen, auf Freigabe warten und
 * in einem frischen Motor fortsetzen, Werkzeug über HTTP. Die Schleife über die Schritte steht hier
 * nur als kleine Test-Steuerung; die echte Lauf-Steuerung ist `executeRun`.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { randomBytes } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { contextDigest, deriveKey, loadMasterSecret } from "@paibot/crypto";
import { createTestDb, type TestDb } from "@paibot/db/testing";
import { createFakeProvider, type FakeProvider } from "@paibot/fake-provider";
import { ACTIVE_STANDARD_RULES, isGateDenied, type RuleDefinition } from "@paibot/gate";
import { createEgressFetch, egressTargetOf } from "@paibot/llm";
import { type ActionRequest, botActor, type Facts } from "@paibot/shared/aktionen";
import { TOOL_ARGS_DIGEST_PREFIX } from "@paibot/shared/bindung";
import { newId } from "@paibot/shared/ids";
import type {
  JsonValue,
  Motor,
  MotorEvent,
  ToolCall,
  ToolResult,
  ToolSpec,
  TurnMessage,
} from "@paibot/shared/motor";
import { t } from "@paibot/shared/texte";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createAiSdkMotor } from "./motor-aisdk";
import {
  gateWith,
  type MemoryReceipts,
  type ModelAccess,
  memoryReceipts,
  modelAccess,
} from "./testing/test-umgebung";

const API_KEY = `sk-test-${"s".repeat(24)}`;

// Jede Prüfung legt eine Datenbank mit allen Migrationen an; unter Last braucht das Zeit.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

type Db = TestDb["client"];

// --- Anfang Test-Steuerung -------------------------------------------------------------------
// Minimal: ein Werkzeug-Aufruf nach dem anderen, Zustand nur in der Datenbank, jeder Aufruf als
// Aktion `werkzeug.aufrufen` durch das Tor. Die Argumente gehen nur als Abdruck in die Fakten.

interface Werkzeug {
  spec: ToolSpec;
  ausfuehren(input: JsonValue): Promise<JsonValue>;
  /** Quelle des Werkzeugs; bei `mcp` mit dem Namen des Servers. */
  quelle?: { source: "eingebaut" } | { source: "mcp"; server: string };
  art?: "lesen" | "schreiben";
}

interface Steuerung {
  db: Db;
  motor: Motor;
  zugang: ModelAccess;
  werkzeuge: Map<string, Werkzeug>;
  regelnFuer(call: ToolCall): Promise<readonly RuleDefinition[]>;
  werkzeugAktionen: string[];
}

const MAX_SCHRITTE = 4;

async function steuere(laufId: string, s: Steuerung): Promise<"fertig" | "wartet"> {
  const verlauf = await ladeVerlauf(s.db, laufId);
  for (let schritt = 0; schritt < MAX_SCHRITTE; schritt++) {
    const offen = offeneAufrufe(verlauf);
    if (offen.length > 0) {
      const results: ToolResult[] = [];
      for (const call of offen) {
        const result = await werkzeugDurchsTor(call, s);
        if (result === "wartet") return speichere(s.db, laufId, "wartet", verlauf);
        results.push(result);
      }
      verlauf.push({ role: "tool", results });
    }
    const letzter = schritt === MAX_SCHRITTE - 1;
    const tools = letzter ? undefined : [...s.werkzeuge.values()].map((w) => w.spec);
    const { text, calls } = await s.zugang.request((model) =>
      modellSchritt(s.motor, verlauf, model, tools),
    );
    verlauf.push({ role: "assistant", text, ...(calls.length > 0 ? { toolCalls: calls } : {}) });
    if (calls.length === 0) return speichere(s.db, laufId, "fertig", verlauf);
    await speichere(s.db, laufId, "laeuft", verlauf);
  }
  throw new Error("Schritt-Budget erschöpft");
}

function offeneAufrufe(verlauf: TurnMessage[]): ToolCall[] {
  const last = verlauf.at(-1);
  return last?.role === "assistant" ? (last.toolCalls ?? []) : [];
}

async function modellSchritt(
  motor: Motor,
  history: TurnMessage[],
  model: Parameters<Motor["runTurn"]>[0]["model"],
  tools: ToolSpec[] | undefined,
): Promise<{ text: string; calls: ToolCall[] }> {
  let text = "";
  const calls: ToolCall[] = [];
  const input = { system: "Test", history: [...history], model, limits: LIMITS };
  for await (const e of motor.runTurn({ ...input, ...(tools ? { tools } : {}) }, NIE)) {
    if (e.type === "text-delta") text += e.text;
    if (e.type === "tool-call") calls.push({ callId: e.callId, name: e.name, input: e.input });
    if (e.type === "error") throw new Error(`Motor-Fehler ${e.code}`);
  }
  return { text, calls };
}

async function werkzeugDurchsTor(call: ToolCall, s: Steuerung): Promise<ToolResult | "wartet"> {
  const werkzeug = s.werkzeuge.get(call.name);
  const base = { callId: call.callId, name: call.name };
  if (!werkzeug) return { ...base, status: "denied", output: "Unbekanntes Werkzeug." };
  const action = werkzeugAktion();
  s.werkzeugAktionen.push(action.actionId);
  const gate = gateWith(await s.regelnFuer(call), s.zugang.receipts);
  try {
    const { value } = await gate.run(action, werkzeugFakten(call, werkzeug), async () => ({
      value: await werkzeug.ausfuehren(call.input),
      result: { status: "ok" },
    }));
    return { ...base, status: "ok", output: value };
  } catch (error) {
    // In dieser Fassung wartet nichts: auch „fragen“ ist abgelehnt (`toolCallDecision`).
    if (isGateDenied(error)) {
      return { ...base, status: "denied", output: error.toolCallDecision().output };
    }
    return { ...base, status: "error", output: "Das Werkzeug ist fehlgeschlagen." };
  }
}

async function ladeVerlauf(db: Db, laufId: string): Promise<TurnMessage[]> {
  const { rows } = await db.query<{ verlauf: TurnMessage[] }>(
    "select verlauf from test_laeufe where id = $1",
    [laufId],
  );
  return rows[0]?.verlauf ?? [];
}

async function speichere<S extends string>(db: Db, id: string, status: S, v: TurnMessage[]) {
  await db.query(
    `insert into test_laeufe (id, status, verlauf) values ($1, $2, $3)
     on conflict (id) do update set status = excluded.status, verlauf = excluded.verlauf`,
    [id, status, JSON.stringify(v)],
  );
  return status;
}
// --- Ende Test-Steuerung ---------------------------------------------------------------------

const LIMITS = { maxOutputTokens: 256, timeoutMs: 10_000 };
const NIE = new AbortController().signal;

const KONTEXT = deriveKey(
  loadMasterSecret({ PAIBOT_SECRET: randomBytes(32).toString("base64") }),
  "context-v1",
);
const BOT = newId("bot");
const UNTERHALTUNG = newId("conversation");
const LAUF = newId("run");

/** Kanonisches JSON (Schlüssel sortiert) für die Argumente in diesen Tests. */
function kanonisch(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(kanonisch).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${kanonisch(value[k] as JsonValue)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function werkzeugFakten(call: ToolCall, werkzeug: Werkzeug): Facts<"werkzeug.aufrufen"> {
  const quelle = werkzeug.quelle ?? { source: "eingebaut" };
  return {
    botOfConversation: true,
    runRunning: true,
    toolName: call.name,
    toolSource: quelle.source,
    ...(quelle.source === "mcp" ? { toolServer: quelle.server } : {}),
    toolKind: werkzeug.art ?? "schreiben",
    argsDigest: contextDigest(KONTEXT, `${TOOL_ARGS_DIGEST_PREFIX}${kanonisch(call.input)}`),
    killSwitch: false,
    toolKey:
      quelle.source === "mcp" ? `mcp/${quelle.server}/${call.name}` : `eingebaut/${call.name}`,
    toolDigest: `sha256:${"0".repeat(64)}`,
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
}

function werkzeugAktion(): ActionRequest<"werkzeug.aufrufen"> {
  return {
    actionId: newId("action"),
    type: "werkzeug.aufrufen",
    actor: botActor(BOT),
    target: { conversationId: UNTERHALTUNG, runId: LAUF, botId: BOT },
  };
}

function regel(id: string, effect: RuleDefinition["effect"], reason: string): RuleDefinition {
  return {
    id: id as RuleDefinition["id"],
    version: 1,
    action: "werkzeug.aufrufen",
    effect,
    stage: effect === "ask" ? "ask" : "execute",
    conditions: [],
    priority: 1,
    source: "owner",
    enabled: true,
    title: `Test-Regel ${effect}`,
    reason,
  };
}

const ABLEHNEN = regel("R-901", "deny", "Löschen von Notizen ist für den Bot gesperrt.");
const ERLAUBEN = regel("R-903", "allow", "Der Bot darf dieses Werkzeug benutzen.");

/** Motor-Hülle, die alle Ereignisse mitschreibt (nur zum Prüfen). */
function aufzeichnen(motor: Motor, log: MotorEvent[][]): Motor {
  return {
    id: motor.id,
    capabilities: () => motor.capabilities(),
    async *runTurn(input, signal) {
      const events: MotorEvent[] = [];
      log.push(events);
      for await (const event of motor.runTurn(input, signal)) {
        events.push(event);
        yield event;
      }
    },
  };
}

async function neueDb(): Promise<TestDb> {
  const testDb = await createTestDb();
  await testDb.client.exec(
    `create table test_laeufe (id text primary key, status text not null, verlauf jsonb not null);
     create table test_freigaben (call_id text primary key);`,
  );
  return testDb;
}

const notiz: ToolSpec = {
  name: "notiz_loeschen",
  description: "Löscht eine Notiz.",
  inputSchema: { type: "object", properties: { id: { type: "number" } }, required: ["id"] },
};

function decisions(receipts: MemoryReceipts, actionIds: string[]) {
  return receipts.entries.filter(
    (entry) => entry.kind === "decision" && actionIds.includes(entry.record.action.actionId),
  );
}

function results(receipts: MemoryReceipts, actionIds: string[]) {
  return receipts.entries.filter(
    (entry) => entry.kind === "result" && actionIds.includes(entry.record.action.actionId),
  );
}

let provider: FakeProvider;
let baseUrl: string;

beforeAll(async () => {
  provider = createFakeProvider({ apiKey: API_KEY });
  ({ baseUrl } = await provider.start({ port: 0 }));
});
afterAll(() => provider.stop());
afterEach(() => {
  provider.reset();
  provider.configure({ toolCall: undefined });
});

function antwortNachWerkzeug(prefix: string) {
  return (messages: ReadonlyArray<{ role: string; content: unknown }>) => {
    const last = messages.at(-1);
    return last?.role === "tool" ? `${prefix}${String(last.content)}` : "";
  };
}

function chatMessages(index: number): Array<Record<string, unknown>> {
  const body = provider.requests[index]?.body as
    | { messages: Array<Record<string, unknown>> }
    | undefined;
  return body?.messages ?? [];
}

describe("Werkzeug-Aufruf, am Tor abgelehnt", () => {
  it("Motor meldet den Aufruf, nichts wird ausgeführt, die Ablehnung geht in den zweiten Schritt", async () => {
    const { client } = await neueDb();
    provider.configure({
      reply: antwortNachWerkzeug("Verstanden: "),
      toolCall: { id: "call_a", name: "notiz_loeschen", arguments: { id: 7 } },
    });
    const ausfuehren = vi.fn(async () => "gelöscht");
    const log: MotorEvent[][] = [];
    const s: Steuerung = {
      db: client,
      motor: aufzeichnen(createAiSdkMotor(), log),
      zugang: modelAccess({ baseUrl, apiKey: API_KEY }),
      werkzeuge: new Map([["notiz_loeschen", { spec: notiz, ausfuehren }]]),
      regelnFuer: async () => [ABLEHNEN],
      werkzeugAktionen: [],
    };
    await speichere(client, "lauf_1", "wartend_in_schlange", [
      { role: "user", text: "Lösch Notiz 7." },
    ]);

    expect(await steuere("lauf_1", s)).toBe("fertig");

    // Schritt 1: nur der Wunsch, sauber beendet.
    expect(log[0]).toEqual([
      { type: "tool-call", callId: "call_a", name: "notiz_loeschen", input: { id: 7 } },
      { type: "finish", finishReason: "tool-calls", usage: expect.any(Object) },
    ]);
    expect(ausfuehren).not.toHaveBeenCalled();

    // Schritt 2 bekommt die Ablehnung im Verlauf.
    expect(provider.requests).toHaveLength(2);
    expect(chatMessages(1).at(-1)).toEqual({
      role: "tool",
      tool_call_id: "call_a",
      content: ABLEHNEN.reason,
    });
    expect(log[1]?.at(-1)).toMatchObject({ type: "finish", finishReason: "stop" });

    // Belege des Werkzeug-Aufrufs: Entscheidung deny, Ergebnis denied.
    const [decision] = decisions(s.zugang.receipts, s.werkzeugAktionen);
    expect(decision?.kind === "decision" && decision.record.decision).toMatchObject({
      outcome: "deny",
      matchedRules: [{ id: "R-901", version: 1 }],
    });
    expect(results(s.zugang.receipts, s.werkzeugAktionen)).toMatchObject([
      { kind: "result", record: { result: { status: "denied", code: "abgelehnt" } } },
    ]);

    // Zustand in der Datenbank.
    const { rows } = await client.query<{ status: string; verlauf: TurnMessage[] }>(
      "select status, verlauf from test_laeufe where id = 'lauf_1'",
    );
    expect(rows[0]?.status).toBe("fertig");
    expect(rows[0]?.verlauf.map((m) => m.role)).toEqual(["user", "assistant", "tool", "assistant"]);
    expect(rows[0]?.verlauf[2]).toEqual({
      role: "tool",
      results: [
        { callId: "call_a", name: "notiz_loeschen", status: "denied", output: ABLEHNEN.reason },
      ],
    });
    expect(rows[0]?.verlauf[3]).toEqual({
      role: "assistant",
      text: `Verstanden: ${ABLEHNEN.reason}`,
    });
    await client.close();
  });
});

describe("Werkzeug-Aufruf, bei dem das Tor fragt", () => {
  it("wird abgelehnt: nichts wartet, das Modell bekommt den festen Text, der Lauf endet", async () => {
    provider.configure({
      reply: antwortNachWerkzeug("Erledigt: "),
      toolCall: { id: "call_b", name: "notiz_loeschen", arguments: { id: 9 } },
    });
    // Nur die Standard-Regeln: R-005 fragt vor jedem Werkzeug. Eine Freigabe gibt es in dieser
    // Fassung nicht.
    const { client } = await neueDb();
    const ausfuehren = vi.fn(async () => "sollte nicht laufen");
    const log: MotorEvent[][] = [];
    const s: Steuerung = {
      db: client,
      motor: aufzeichnen(createAiSdkMotor(), log),
      zugang: modelAccess({ baseUrl, apiKey: API_KEY }),
      werkzeuge: new Map([["notiz_loeschen", { spec: notiz, ausfuehren }]]),
      regelnFuer: async () => ACTIVE_STANDARD_RULES,
      werkzeugAktionen: [],
    };
    await speichere(client, "lauf_2", "neu", [{ role: "user", text: "Lösch Notiz 9." }]);
    expect(await steuere("lauf_2", s)).toBe("fertig");

    expect(ausfuehren).not.toHaveBeenCalled();
    expect(decisions(s.zugang.receipts, s.werkzeugAktionen)).toMatchObject([
      {
        record: {
          action: { type: "werkzeug.aufrufen" },
          decision: { outcome: "ask", matchedRules: [{ id: "R-005", version: 1 }] },
        },
      },
    ]);
    expect(results(s.zugang.receipts, s.werkzeugAktionen)).toMatchObject([
      { record: { result: { status: "denied", code: "regel_fehlt" } } },
    ]);
    expect(provider.requests).toHaveLength(2);
    expect(chatMessages(1).at(-1)).toEqual({
      role: "tool",
      tool_call_id: "call_b",
      content: t("werkzeug.huelle.freigabe_noetig"),
    });
    const ende = await client.query<{ status: string }>(
      "select status from test_laeufe where id = 'lauf_2'",
    );
    expect(ende.rows[0]?.status).toBe("fertig");
    await client.close();
  });
});

describe("Werkzeug eines Test-Servers über HTTP, durch das Tor", () => {
  // Kleiner Server nach dem Muster von MCP: JSON-RPC über HTTP mit `tools/list` und `tools/call`.
  // Ein echter MCP-Client ist noch nicht eingebunden.
  let server: Server;
  let serverUrl: string;
  const eingang: Array<{ method: string; belegeVorher: number }> = [];
  let receiptsForServer: MemoryReceipts | undefined;

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        const request = JSON.parse(body) as { id: number; method: string; params?: unknown };
        eingang.push({
          method: request.method,
          belegeVorher: receiptsForServer?.entries.length ?? 0,
        });
        const result =
          request.method === "tools/list"
            ? {
                tools: [
                  {
                    name: "wetter",
                    description: "Wetter für einen Ort.",
                    inputSchema: {
                      type: "object",
                      properties: { ort: { type: "string" } },
                      required: ["ort"],
                    },
                  },
                ],
              }
            : { content: [{ type: "text", text: "Sonnig, 21 Grad" }] };
        res
          .writeHead(200, { "content-type": "application/json" })
          .end(JSON.stringify({ jsonrpc: "2.0", id: request.id, result }));
      });
    });
    // Wie beim Test-Anbieter: keine Zeitgrenze für ruhende Verbindungen, sonst kann eine Anfrage
    // nach einer langen Pause (belegte Ereignisschleife) auf einer schon geschlossenen landen.
    server.keepAliveTimeout = 0;
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    serverUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/mcp`;
  });
  afterAll(() => new Promise((resolve) => server.close(resolve)));
  afterEach(() => {
    eingang.length = 0;
  });

  /** Werkzeuge des Servers als Beschreibungen ohne Ausführung plus Ausführung über HTTP. */
  async function werkzeugeVomServer(): Promise<Map<string, Werkzeug>> {
    const http = createEgressFetch([{ ...egressTargetOf(serverUrl), allowPrivate: true }]);
    let nextId = 1;
    const rpc = async (method: string, params?: unknown) => {
      const response = await http(serverUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
      });
      return ((await response.json()) as { result: Record<string, unknown> }).result;
    };
    const { tools } = (await rpc("tools/list")) as { tools: ToolSpec[] };
    return new Map(
      tools.map((spec) => [
        spec.name,
        {
          spec: { name: spec.name, description: spec.description, inputSchema: spec.inputSchema },
          quelle: { source: "mcp" as const, server: "test-server" },
          art: "lesen" as const,
          ausfuehren: async (input: JsonValue) =>
            (await rpc("tools/call", { name: spec.name, arguments: input })) as JsonValue,
        },
      ]),
    );
  }

  async function lauf(regeln: readonly RuleDefinition[]) {
    const { client } = await neueDb();
    provider.configure({
      reply: antwortNachWerkzeug("Antwort mit "),
      toolCall: { id: "call_w", name: "wetter", arguments: { ort: "Berlin" } },
    });
    const zugang = modelAccess({ baseUrl, apiKey: API_KEY, receipts: memoryReceipts() });
    receiptsForServer = zugang.receipts;
    const s: Steuerung = {
      db: client,
      motor: createAiSdkMotor(),
      zugang,
      werkzeuge: await werkzeugeVomServer(),
      regelnFuer: async () => regeln,
      werkzeugAktionen: [],
    };
    await speichere(client, "lauf_3", "neu", [{ role: "user", text: "Wie ist das Wetter?" }]);
    const ende = await steuere("lauf_3", s);
    await client.close();
    return { ende, s };
  }

  it("erlaubt: Ausführung erst nach dem Beleg „Entscheidung“, Ergebnis im zweiten Schritt", async () => {
    const { ende, s } = await lauf([ERLAUBEN]);
    expect(ende).toBe("fertig");
    expect(eingang.map((e) => e.method)).toEqual(["tools/list", "tools/call"]);
    // Der Motor bekam nur die Beschreibung.
    expect((provider.requests[0]?.body as { tools?: unknown[] } | undefined)?.tools).toEqual([
      {
        type: "function",
        function: {
          name: "wetter",
          description: "Wetter für einen Ort.",
          parameters: {
            type: "object",
            properties: { ort: { type: "string" } },
            required: ["ort"],
          },
        },
      },
    ]);
    // Zum Zeitpunkt des Aufrufs stand die Entscheidung des Tors schon im Protokoll.
    const decisionIndex = s.zugang.receipts.entries.findIndex(
      (entry) =>
        entry.kind === "decision" && s.werkzeugAktionen.includes(entry.record.action.actionId),
    );
    expect(decisionIndex).toBeGreaterThanOrEqual(0);
    expect(eingang[1]?.belegeVorher).toBe(decisionIndex + 1);
    // Der Beleg nennt Werkzeug, Quelle und Art, die Argumente nur als Abdruck.
    const entscheidung = s.zugang.receipts.entries[decisionIndex];
    expect(entscheidung?.kind === "decision" && entscheidung.record.facts).toEqual({
      botOfConversation: true,
      runRunning: true,
      toolName: "wetter",
      toolSource: "mcp",
      toolServer: "test-server",
      toolKind: "lesen",
      argsDigest: contextDigest(KONTEXT, `${TOOL_ARGS_DIGEST_PREFIX}{"ort":"Berlin"}`),
      killSwitch: false,
      toolKey: "mcp/test-server/wetter",
      toolDigest: `sha256:${"0".repeat(64)}`,
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
    });
    const werkzeugBelege = s.zugang.receipts.entries.filter((entry) =>
      s.werkzeugAktionen.includes(entry.record.action.actionId),
    );
    expect(werkzeugBelege).toHaveLength(2);
    expect(JSON.stringify(werkzeugBelege)).not.toContain("Berlin");
    expect(chatMessages(1).at(-1)).toEqual({
      role: "tool",
      tool_call_id: "call_w",
      content: JSON.stringify({ content: [{ type: "text", text: "Sonnig, 21 Grad" }] }),
    });
  });

  it("abgelehnt: der Server bekommt keinen Aufruf", async () => {
    const { ende } = await lauf([ABLEHNEN]);
    expect(ende).toBe("fertig");
    expect(eingang.map((e) => e.method)).toEqual(["tools/list"]);
  });
});
