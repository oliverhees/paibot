/**
 * PaiBot – Test-MCP-Server (Streamable HTTP) für Tests: Liste und Aufruf von Werkzeugen, beide
 * Protokoll-Fassungen, steuerbares Verhalten (auch absichtlich schädliches) und ein Protokoll
 * jeder eingegangenen Anfrage.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { Socket } from "node:net";

/** Pfad des MCP-Endpunkts. */
export const TEST_MCP_ENDPOINT = "/mcp";

/** Steuerung über HTTP (für den Betrieb als eigener Prozess in Tests). */
export const TEST_MCP_CONTROL_PATHS = {
  /** `GET`: alle protokollierten Anfragen als JSON. */
  anfragen: "/_steuerung/anfragen",
  /** `POST` mit einem Teil von `McpBehaviour` als JSON: Verhalten ändern. */
  verhalten: "/_steuerung/verhalten",
  /** `POST`: Protokoll leeren, Verhalten auf den Start-Stand, offene Verbindungen schließen. */
  zuruecksetzen: "/_steuerung/zuruecksetzen",
} as const;

/** Kopfzeile mit dem Steuer-Schlüssel für die Pfade unter `/_steuerung/`. */
export const TEST_MCP_CONTROL_KEY_HEADER = "x-steuerung-schluessel";

/** Name der Umgebungsvariable für den Port beim Start als eigener Prozess. */
export const TEST_MCP_PORT_ENV = "TEST_MCP_PORT";

/** Neueste und ältere Protokoll-Fassung, die der Server spricht. */
export const MCP_VERSION_MODERN = "2026-07-28";
export const MCP_VERSION_LEGACY = "2025-11-25";

/** Schutz der Steuerung. */
export interface McpControlOptions {
  /**
   * Ist er gesetzt, verlangt jeder Steuer-Pfad die Kopfzeile `x-steuerung-schluessel` mit diesem
   * Wert (sonst 401). Ohne Schlüssel nimmt die Steuerung nur Anfragen von Loopback an (sonst 403).
   */
  key?: string;
}

/**
 * Wie eine Anfrage beantwortet wird. Gilt für `tools/list` (`listAnswer`), `server/discover`
 * (`discoverAnswer`) und `tools/call` (`answer` am Werkzeug).
 */
export type McpAnswer =
  /** Normale Antwort (Liste bzw. Text des Werkzeugs). */
  | { kind: "normal" }
  /** Textergebnis; mit `isError` als Werkzeug-Fehler. */
  | { kind: "text"; text: string; isError?: boolean }
  /** Ergebnis als SSE-Strom mit `notifications` Fortschrittsmeldungen davor. */
  | { kind: "sse"; notifications?: number }
  /** Übergroße Antwort: so viele Bytes Text (Liste: eine Beschreibung dieser Länge). */
  | { kind: "huge"; bytes: number }
  /** Endloser SSE-Strom: Fortschrittsmeldungen ohne Ende, nie ein Ergebnis. */
  | { kind: "endless"; intervalMs?: number }
  /** Tröpfelnd: alle `intervalMs` ein winziges Stück, nach `chunks` Stücken das Ergebnis. */
  | { kind: "drip"; intervalMs: number; chunks?: number }
  /** Langsam: erst nach `delayMs` die normale Antwort. */
  | { kind: "slow"; delayMs: number }
  /** Antwortet nie (Verbindung bleibt offen). */
  | { kind: "hang" }
  /** Trennt die Verbindung hart, ohne Antwort. */
  | { kind: "abort" }
  /** Weiterleitung (Standard 302) auf `location`, z. B. eine private Adresse. */
  | { kind: "redirect"; location: string; status?: 301 | 302 | 303 | 307 | 308 }
  /** Status 200, aber kaputtes JSON im Körper. */
  | { kind: "brokenJson"; body?: string }
  /** Nur Statuscode mit festem Text-Körper. */
  | { kind: "status"; status: number; body?: string }
  /** Ergebnis mit Bild, Ton, Ressourcen-Verweis und eingebetteter Ressource. */
  | { kind: "media" }
  /** Antwort „Eingabe nötig“ (Rückfrage des Servers an den Client). */
  | { kind: "inputRequired" };

/** Ein Werkzeug, wie der Server es in der Liste meldet. */
export interface McpToolSpec {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  /** Hinweise des Servers, unverändert in die Liste übernommen (z. B. `readOnlyHint`). */
  annotations?: Record<string, unknown>;
  /** Antwort auf den Aufruf; Standard: Text `ok`. */
  answer?: McpAnswer;
  /** Das Werkzeug verändert etwas (nur Merker für Tests, steht nicht in der Liste). */
  writes?: boolean;
}

/** Das gesamte steuerbare Verhalten des Servers. */
export interface McpBehaviour {
  /** Name in `serverInfo`. */
  serverName: string;
  /**
   * `modern` (Fassung 2026-07-28, ohne `initialize`), `legacy` (Fassung 2025-11-25 mit
   * `initialize` und Sitzung) oder `both`. Ein Server nur für die eine Fassung lehnt die andere
   * ab (`legacy`: 400 ohne Körper; `modern`: 400 mit Fehler, der die Fassungen nennt).
   */
  protocol: "modern" | "legacy" | "both";
  tools: McpToolSpec[];
  /** Zusätzlich so viele erzeugte Werkzeuge `werkzeug_001` … (z. B. 500). */
  fillerTools?: number;
  /** Seitengröße der Liste; 0 oder fehlend = alles auf einer Seite. */
  pageSize?: number;
  /** Nach so vielen ersten Listen-Abrufen (ohne Cursor) liefert der Server `laterTools`. */
  switchAfterLists?: number;
  laterTools?: McpToolSpec[];
  /** Meldet `listChanged` und sendet beim Wechsel eine Benachrichtigung an offene Listen-Ströme. */
  listChanged?: boolean;
  /** Antwort auf `tools/list`. */
  listAnswer?: McpAnswer;
  /** Antwort auf `server/discover`. */
  discoverAnswer?: McpAnswer;
  /** Ist er gesetzt, muss jede Anfrage `Authorization: Bearer <token>` senden, sonst 401. */
  token?: string;
  /** Ist er gesetzt, muss die Adresse `?token=<queryToken>` tragen, sonst 401. */
  queryToken?: string;
  /**
   * Spiegelt die angefragte Adresse (mit Abfrage-Teil) in Fehlertexten und im Standard-Ergebnis
   * eines Aufrufs, damit ein Test sieht, ob ein Token an fremde Stellen gelangt.
   */
  mirrorUrl?: boolean;
  /** Jede Seite der Liste nennt einen weiteren Cursor (eine Seite mit einem Werkzeug), ohne Ende. */
  endlessCursor?: boolean;
}

/** Protokoll einer eingegangenen Anfrage, vollständig mit Kopfzeilen und Körper. */
export interface RecordedMcpRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body: unknown;
  receivedAt: string;
  /** JSON-RPC-Methode, wenn der Körper eine war (z. B. `tools/call`). */
  rpcMethod?: string;
  /** Abfrage-Teil der Adresse (z. B. `?token=…`); in der Steuer-Ausgabe unkenntlich gemacht. */
  query: string;
  /** Name des Werkzeugs bei `tools/call`. */
  toolName?: string;
  /** HTTP-Status der Antwort (0 = keine Antwort gesendet). */
  status: number;
  /** `true`, wenn der Aufrufer die Verbindung vor dem Ende der Antwort geschlossen hat. */
  closedByClient: boolean;
}

export interface TestMcpServer {
  /** Startet den Server auf Loopback; Port 0 wählt einen freien Port. */
  start(options?: { host?: string; port?: number }): Promise<{ url: string; port: number }>;
  stop(): Promise<void>;
  /** Alle Anfragen seit Start bzw. dem letzten `reset`, in Eingangsreihenfolge. */
  readonly requests: readonly RecordedMcpRequest[];
  /** Zahl der Anfragen mit dieser JSON-RPC-Methode (z. B. `tools/call`). */
  count(rpcMethod: string): number;
  /** Zahl der Aufrufe eines Werkzeugs (`tools/call` mit diesem Namen). */
  callsOf(toolName: string): number;
  configure(change: Partial<McpBehaviour>): void;
  reset(): void;
}

const DEFAULT_BEHAVIOUR: McpBehaviour = {
  serverName: "paibot-test-mcp",
  protocol: "both",
  tools: [
    {
      name: "echo",
      description: "Gibt den übergebenen Text zurück.",
      inputSchema: {
        type: "object",
        properties: { text: { type: "string" } },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
    },
    {
      name: "notiz_anlegen",
      description: "Legt eine Notiz an.",
      inputSchema: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
      },
      writes: true,
    },
  ],
};

const MAX_BODY_BYTES = 1024 * 1024;
const HEALTH_PATH = "/health";

/** Zeichen im Kopf einer Fehlermeldung (`-32020` HeaderMismatch u. a., siehe Spezifikation). */
const ERR_HEADER_MISMATCH = -32020;
const ERR_UNSUPPORTED_VERSION = -32022;
const ERR_METHOD_NOT_FOUND = -32601;
const ERR_INVALID_PARAMS = -32602;
const ERR_PARSE = -32700;

const ANSWER_KINDS = new Set([
  "normal",
  "text",
  "sse",
  "huge",
  "endless",
  "drip",
  "slow",
  "hang",
  "abort",
  "redirect",
  "brokenJson",
  "status",
  "media",
  "inputRequired",
]);

interface Exchange {
  res: ServerResponse;
  record: RecordedMcpRequest;
  closed: boolean;
  serverEnded: boolean;
}

type Json = Record<string, unknown>;

function isObject(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sleep(ms: number, exchange: Exchange): Promise<void> {
  if (ms <= 0 || exchange.closed) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      exchange.res.off("close", done);
      resolve();
    }
    exchange.res.once("close", done);
  });
}

function readBody(req: IncomingMessage): Promise<string | undefined> {
  return new Promise((resolve) => {
    const parts: Buffer[] = [];
    let size = 0;
    req.on("data", (part: Buffer) => {
      size += part.length;
      if (size > MAX_BODY_BYTES) {
        resolve(undefined);
        req.destroy();
        return;
      }
      parts.push(part);
    });
    req.on("end", () => resolve(Buffer.concat(parts).toString("utf8")));
    req.on("error", () => resolve(undefined));
  });
}

function flattenHeaders(req: IncomingMessage): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (value !== undefined) headers[name] = Array.isArray(value) ? value.join(", ") : value;
  }
  return headers;
}

function sendRaw(ex: Exchange, status: number, contentType: string, text: string): void {
  ex.record.status = status;
  ex.res.writeHead(status, {
    "content-type": contentType,
    "content-length": Buffer.byteLength(text),
  });
  ex.res.end(text);
}

function sendJson(ex: Exchange, status: number, body: unknown): void {
  sendRaw(ex, status, "application/json; charset=utf-8", JSON.stringify(body));
}

function rpcError(id: unknown, code: number, message: string, data?: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data ? { data } : {}) } };
}

/** `Mcp-Name`/`Mcp-Param-*` dürfen als `=?base64?…?=` kommen (siehe Spezifikation). */
function decodeHeaderValue(value: string): string {
  const match = /^=\?base64\?(.*)\?=$/.exec(value);
  return match?.[1] === undefined ? value : Buffer.from(match[1], "base64").toString("utf8");
}

function startSse(ex: Exchange): void {
  ex.record.status = 200;
  ex.res.writeHead(200, {
    "content-type": "text/event-stream",
    "cache-control": "no-cache",
    "x-accel-buffering": "no",
  });
}

function sseEvent(ex: Exchange, message: unknown): void {
  if (!ex.closed) ex.res.write(`event: message\ndata: ${JSON.stringify(message)}\n\n`);
}

function progress(token: number | string, step: number): Json {
  return {
    jsonrpc: "2.0",
    method: "notifications/progress",
    params: { progressToken: token, progress: step },
  };
}

function toolEntry(tool: McpToolSpec): Json {
  const entry: Json = {
    name: tool.name,
    inputSchema: tool.inputSchema ?? { type: "object", additionalProperties: false },
  };
  if (tool.title !== undefined) entry.title = tool.title;
  if (tool.description !== undefined) entry.description = tool.description;
  if (tool.outputSchema !== undefined) entry.outputSchema = tool.outputSchema;
  if (tool.annotations !== undefined) entry.annotations = tool.annotations;
  return entry;
}

const PNG_1X1 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

/** Prüft ein vom Steuer-Aufruf geschicktes Verhalten; liefert den Fehlertext oder das Ergebnis. */
export function checkBehaviour(value: unknown): Partial<McpBehaviour> | string {
  if (!isObject(value)) return "Erwartet ein JSON-Objekt.";
  const known = new Set([
    "serverName",
    "protocol",
    "tools",
    "fillerTools",
    "pageSize",
    "switchAfterLists",
    "laterTools",
    "listChanged",
    "listAnswer",
    "discoverAnswer",
    "token",
    "queryToken",
    "mirrorUrl",
    "endlessCursor",
  ]);
  for (const key of Object.keys(value)) if (!known.has(key)) return `Unbekanntes Feld „${key}“.`;
  if (
    value.protocol !== undefined &&
    !["modern", "legacy", "both"].includes(String(value.protocol))
  )
    return "`protocol` muss modern, legacy oder both sein.";
  for (const field of ["tools", "laterTools"] as const) {
    const list = value[field];
    if (list === undefined) continue;
    if (!Array.isArray(list)) return `\`${field}\` muss eine Liste sein.`;
    for (const tool of list) {
      if (!isObject(tool) || typeof tool.name !== "string" || tool.name === "")
        return `Jedes Werkzeug in \`${field}\` braucht einen \`name\`.`;
      const bad = checkAnswer(tool.answer);
      if (bad) return bad;
    }
  }
  for (const field of ["listAnswer", "discoverAnswer"] as const) {
    const bad = checkAnswer(value[field]);
    if (bad) return bad;
  }
  for (const field of ["fillerTools", "pageSize", "switchAfterLists"] as const) {
    const n = value[field];
    if (n !== undefined && (typeof n !== "number" || !Number.isInteger(n) || n < 0))
      return `\`${field}\` muss eine ganze Zahl ab 0 sein.`;
  }
  return value as Partial<McpBehaviour>;
}

function checkAnswer(answer: unknown): string | undefined {
  if (answer === undefined) return undefined;
  if (!isObject(answer) || typeof answer.kind !== "string" || !ANSWER_KINDS.has(answer.kind))
    return "Eine Antwort braucht ein bekanntes `kind`.";
  return undefined;
}

/**
 * Baut den Test-MCP-Server. Er lauscht nur auf Loopback, baut nie eine Verbindung nach außen auf
 * und ist nur für Tests gedacht.
 */
export function createTestMcpServer(
  options?: Partial<McpBehaviour>,
  control: McpControlOptions = {},
): TestMcpServer {
  const startBehaviour: McpBehaviour = { ...DEFAULT_BEHAVIOUR, ...options };
  let current: McpBehaviour = { ...startBehaviour };
  let records: RecordedMcpRequest[] = [];
  let firstListCalls = 0;
  let sessionCounter = 0;
  let legacySessions = new Set<string>();
  const exchanges = new Set<Exchange>();
  const listeners = new Set<Exchange>();
  const sockets = new Set<Socket>();
  let server: Server | undefined;

  function configure(change: Partial<McpBehaviour>): void {
    const switchedBefore = tools() !== current.tools;
    current = { ...current, ...change };
    if (change.tools !== undefined || change.laterTools !== undefined) firstListCalls = 0;
    if (switchedBefore !== (tools() !== current.tools)) notifyListChanged();
  }

  function reset(): void {
    records = [];
    firstListCalls = 0;
    current = { ...startBehaviour };
    legacySessions = new Set();
    for (const exchange of exchanges) endHard(exchange);
  }

  function endHard(exchange: Exchange): void {
    exchange.serverEnded = true;
    exchange.res.destroy();
  }

  /** Die Werkzeuge, die der Server jetzt in der Liste meldet. */
  function tools(): McpToolSpec[] {
    const switched =
      current.switchAfterLists !== undefined &&
      current.laterTools !== undefined &&
      firstListCalls > current.switchAfterLists;
    return switched ? (current.laterTools ?? current.tools) : current.tools;
  }

  function allTools(): McpToolSpec[] {
    const filler: McpToolSpec[] = [];
    for (let i = 1; i <= (current.fillerTools ?? 0); i += 1) {
      filler.push({
        name: `werkzeug_${String(i).padStart(3, "0")}`,
        description: `Werkzeug ${i}.`,
      });
    }
    return [...tools(), ...filler];
  }

  function notifyListChanged(): void {
    if (!current.listChanged) return;
    for (const listener of listeners)
      sseEvent(listener, { jsonrpc: "2.0", method: "notifications/tools/list_changed" });
  }

  function controlRejection(req: IncomingMessage): 401 | 403 | undefined {
    if (control.key !== undefined && control.key !== "") {
      const sent = req.headers[TEST_MCP_CONTROL_KEY_HEADER];
      const given = Buffer.from(typeof sent === "string" ? sent : "");
      const expected = Buffer.from(control.key);
      return given.length === expected.length && timingSafeEqual(given, expected) ? undefined : 401;
    }
    return isLoopback(req.socket.remoteAddress) ? undefined : 403;
  }

  function resultFor(modern: boolean, body: Json): Json {
    return modern ? { resultType: "complete", ...body } : body;
  }

  /** Wendet eine `McpAnswer` an. `normal` ist die Antwort, die ohne Besonderheit käme. */
  async function answerWith(
    ex: Exchange,
    id: unknown,
    modern: boolean,
    answer: McpAnswer | undefined,
    normal: () => Json,
    kind: "list" | "call" | "discover",
    progressToken: number | string,
  ): Promise<void> {
    const a: McpAnswer = answer ?? { kind: "normal" };
    const reply = (result: Json) => ({ jsonrpc: "2.0", id, result: resultFor(modern, result) });
    switch (a.kind) {
      case "normal":
        return sendJson(ex, 200, reply(normal()));
      case "text":
        return sendJson(
          ex,
          200,
          reply({ content: [{ type: "text", text: a.text }], isError: a.isError === true }),
        );
      case "sse": {
        startSse(ex);
        for (let i = 1; i <= (a.notifications ?? 1); i += 1)
          sseEvent(ex, progress(progressToken, i));
        sseEvent(ex, reply(normal()));
        ex.res.end();
        return;
      }
      case "huge": {
        const filler = "a".repeat(Math.max(0, a.bytes));
        const body =
          kind === "list"
            ? reply({
                tools: [{ name: "gross", description: filler, inputSchema: { type: "object" } }],
              })
            : reply({ content: [{ type: "text", text: filler }], isError: false });
        return sendRaw(ex, 200, "application/json; charset=utf-8", JSON.stringify(body));
      }
      case "endless": {
        startSse(ex);
        for (let step = 1; !ex.closed; step += 1) {
          sseEvent(ex, progress(progressToken, step));
          await sleep(a.intervalMs ?? 10, ex);
        }
        return;
      }
      case "drip": {
        startSse(ex);
        for (let step = 1; step <= (a.chunks ?? 5) && !ex.closed; step += 1) {
          sseEvent(ex, progress(progressToken, step));
          await sleep(a.intervalMs, ex);
        }
        sseEvent(ex, reply(normal()));
        if (!ex.closed) ex.res.end();
        return;
      }
      case "slow":
        await sleep(a.delayMs, ex);
        if (!ex.closed) sendJson(ex, 200, reply(normal()));
        return;
      case "hang":
        return;
      case "abort":
        return endHard(ex);
      case "redirect":
        ex.record.status = a.status ?? 302;
        ex.res.writeHead(a.status ?? 302, { location: a.location, "content-length": 0 });
        ex.res.end();
        return;
      case "brokenJson":
        return sendRaw(ex, 200, "application/json", a.body ?? '{"jsonrpc":"2.0","id":1,"result":{');
      case "status":
        return sendRaw(ex, a.status, "text/plain; charset=utf-8", a.body ?? "Fehler");
      case "media":
        return sendJson(
          ex,
          200,
          reply({
            content: [
              { type: "text", text: "Ergebnis mit Medien." },
              { type: "image", data: PNG_1X1, mimeType: "image/png" },
              { type: "audio", data: "UklGRg==", mimeType: "audio/wav" },
              { type: "resource_link", uri: "file:///etc/hostname", name: "hostname" },
              {
                type: "resource",
                resource: { uri: "file:///etc/hosts", mimeType: "text/plain", text: "127.0.0.1" },
              },
            ],
            isError: false,
          }),
        );
      case "inputRequired":
        return sendJson(
          ex,
          200,
          reply({
            resultType: "input_required",
            inputRequests: {
              nachfrage: {
                method: "elicitation/create",
                params: {
                  mode: "form",
                  message: "Bitte einen Namen angeben.",
                  requestedSchema: {
                    type: "object",
                    properties: { name: { type: "string" } },
                    required: ["name"],
                  },
                },
              },
            },
            requestState: "zustand-1",
          }),
        );
    }
  }

  function listResult(cursor: unknown): Json {
    const all = allTools();
    const size = current.pageSize && current.pageSize > 0 ? current.pageSize : all.length;
    const start = typeof cursor === "string" && /^s\d+$/.test(cursor) ? Number(cursor.slice(1)) : 0;
    if (current.endlessCursor) {
      const n = start + 1;
      return { tools: [toolEntry({ name: `seite_${n}` })], nextCursor: `s${n}` };
    }
    const page = all.slice(start, start + size).map(toolEntry);
    const result: Json = { tools: page };
    if (start + size < all.length) result.nextCursor = `s${start + size}`;
    return result;
  }

  function capabilities(): Json {
    return { tools: current.listChanged ? { listChanged: true } : {} };
  }

  async function dispatch(
    ex: Exchange,
    message: Json,
    modern: boolean,
    sessionHeader: string | undefined,
  ): Promise<void> {
    const id = message.id;
    const method = message.method;
    const params = isObject(message.params) ? message.params : {};
    const token = (isObject(params._meta) ? params._meta.progressToken : undefined) ?? 1;
    const progressToken = typeof token === "string" || typeof token === "number" ? token : 1;

    if (method === "initialize") {
      sessionCounter += 1;
      const session = `sitzung-${sessionCounter}`;
      legacySessions.add(session);
      ex.record.status = 200;
      const text = JSON.stringify({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: MCP_VERSION_LEGACY,
          capabilities: capabilities(),
          serverInfo: { name: current.serverName, version: "0.0.0" },
        },
      });
      ex.res.writeHead(200, {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(text),
        "mcp-session-id": session,
      });
      ex.res.end(text);
      return;
    }
    if (method === "ping") return sendJson(ex, 200, { jsonrpc: "2.0", id, result: {} });
    if (method === "server/discover") {
      return answerWith(
        ex,
        id,
        modern,
        current.discoverAnswer,
        () => ({
          supportedVersions: [MCP_VERSION_MODERN, MCP_VERSION_LEGACY],
          capabilities: capabilities(),
          serverInfo: { name: current.serverName, version: "0.0.0" },
        }),
        "discover",
        progressToken,
      );
    }
    if (method === "tools/list") {
      if (params.cursor === undefined) firstListCalls += 1;
      return answerWith(
        ex,
        id,
        modern,
        current.listAnswer,
        () => listResult(params.cursor),
        "list",
        progressToken,
      );
    }
    if (method === "tools/call") {
      const name = typeof params.name === "string" ? params.name : "";
      ex.record.toolName = name;
      const tool =
        allTools().find((t) => t.name === name) ??
        [...current.tools, ...(current.laterTools ?? [])].find((t) => t.name === name);
      if (!tool)
        return sendJson(ex, 200, rpcError(id, ERR_INVALID_PARAMS, `Unknown tool: ${name}`));
      const args = isObject(params.arguments) ? params.arguments : {};
      return answerWith(
        ex,
        id,
        modern,
        tool.answer,
        () => ({
          content: [
            {
              type: "text",
              text:
                typeof args.text === "string"
                  ? args.text
                  : current.mirrorUrl
                    ? `Adresse: ${ex.record.path}${ex.record.query}`
                    : "ok",
            },
          ],
          isError: false,
        }),
        "call",
        progressToken,
      );
    }
    if (method === "subscriptions/listen") {
      startSse(ex);
      sseEvent(ex, { jsonrpc: "2.0", method: "notifications/subscriptions/acknowledged" });
      listeners.add(ex);
      ex.res.once("close", () => listeners.delete(ex));
      return;
    }
    void sessionHeader;
    return sendJson(ex, 404, rpcError(id, ERR_METHOD_NOT_FOUND, `Method not found: ${method}`));
  }

  async function handleMcp(
    req: IncomingMessage,
    res: ServerResponse,
    path: string,
    query: string,
  ): Promise<void> {
    const record: RecordedMcpRequest = {
      method: req.method ?? "GET",
      path,
      query,
      headers: flattenHeaders(req),
      body: undefined,
      receivedAt: new Date().toISOString(),
      status: 0,
      closedByClient: false,
    };
    const ex: Exchange = { res, record, closed: false, serverEnded: false };
    exchanges.add(ex);
    res.once("close", () => {
      ex.closed = true;
      exchanges.delete(ex);
      if (!res.writableFinished && !ex.serverEnded) record.closedByClient = true;
    });
    records.push(record);

    const raw = await readBody(req);
    if (raw === undefined) return sendJson(ex, 413, rpcError(null, ERR_PARSE, "Anfrage zu groß."));
    try {
      record.body = raw === "" ? undefined : JSON.parse(raw);
    } catch {
      record.body = raw;
    }
    if (isObject(record.body) && typeof record.body.method === "string") {
      record.rpcMethod = record.body.method;
      const p = record.body.params;
      if (record.body.method === "tools/call" && isObject(p) && typeof p.name === "string")
        record.toolName = p.name;
    }

    // Spezifikation: Ist `Origin` vorhanden und nicht lokal, antwortet der Server mit 403.
    const origin = req.headers.origin;
    if (
      typeof origin === "string" &&
      !/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(origin)
    )
      return sendJson(ex, 403, rpcError(null, -32600, "Origin nicht erlaubt."));

    if (
      current.queryToken !== undefined &&
      new URLSearchParams(query).get("token") !== current.queryToken
    ) {
      const text = current.mirrorUrl ? `Token fehlt oder falsch: ${path}${query}` : "";
      record.status = 401;
      res.writeHead(401, {
        "content-type": "text/plain",
        "content-length": Buffer.byteLength(text),
      });
      res.end(text);
      return;
    }
    if (current.token !== undefined && req.headers.authorization !== `Bearer ${current.token}`) {
      record.status = 401;
      res.writeHead(401, { "www-authenticate": "Bearer", "content-length": 0 });
      res.end();
      return;
    }

    const sessionHeader =
      typeof req.headers["mcp-session-id"] === "string" ? req.headers["mcp-session-id"] : undefined;
    if (req.method === "DELETE") {
      if (current.protocol !== "modern" && sessionHeader && legacySessions.delete(sessionHeader)) {
        record.status = 200;
        res.writeHead(200, { "content-length": 0 });
        res.end();
        return;
      }
      res.setHeader("allow", "POST");
      return sendRaw(ex, 405, "text/plain", "Methode nicht erlaubt.");
    }
    if (req.method !== "POST") {
      res.setHeader("allow", "POST");
      return sendRaw(ex, 405, "text/plain", "Methode nicht erlaubt.");
    }

    const body = record.body;
    if (raw !== "" && typeof body === "string")
      return sendJson(ex, 400, rpcError(null, ERR_PARSE, "Kein gültiges JSON."));
    if (!isObject(body) || typeof body.method !== "string")
      return sendJson(ex, 400, rpcError(null, -32600, "Keine gültige JSON-RPC-Nachricht."));

    const params = isObject(body.params) ? body.params : {};
    const meta = isObject(params._meta) ? params._meta : {};
    const metaVersion = meta["io.modelcontextprotocol/protocolVersion"];
    const isInitialize = body.method === "initialize";
    const isModern = metaVersion !== undefined;

    if (isInitialize) {
      if (current.protocol === "modern")
        return sendJson(
          ex,
          400,
          rpcError(body.id, ERR_UNSUPPORTED_VERSION, "initialize wird nicht unterstützt", {
            supported: [MCP_VERSION_MODERN],
          }),
        );
    } else if (isModern) {
      if (current.protocol === "legacy") return sendRaw(ex, 400, "text/plain", "");
      const header = req.headers["mcp-protocol-version"];
      if (typeof header !== "string" || header !== metaVersion)
        return sendJson(
          ex,
          400,
          rpcError(body.id, ERR_HEADER_MISMATCH, "Header mismatch: MCP-Protocol-Version"),
        );
      if (metaVersion !== MCP_VERSION_MODERN)
        return sendJson(
          ex,
          400,
          rpcError(body.id, ERR_UNSUPPORTED_VERSION, "Unsupported protocol version", {
            supported: [MCP_VERSION_MODERN, MCP_VERSION_LEGACY],
            requested: metaVersion,
          }),
        );
      const mcpMethod = req.headers["mcp-method"];
      // Für Benachrichtigungen (ohne `id`) legt die Spezifikation keine Kopfzeilen fest.
      if (body.id !== undefined && mcpMethod !== body.method)
        return sendJson(
          ex,
          400,
          rpcError(body.id, ERR_HEADER_MISMATCH, "Header mismatch: Mcp-Method"),
        );
      if (body.id !== undefined && body.method === "tools/call") {
        const nameHeader = req.headers["mcp-name"];
        if (
          typeof nameHeader !== "string" ||
          decodeHeaderValue(nameHeader) !== (typeof params.name === "string" ? params.name : "")
        )
          return sendJson(
            ex,
            400,
            rpcError(body.id, ERR_HEADER_MISMATCH, "Header mismatch: Mcp-Name"),
          );
      }
    } else if (body.method !== "notifications/initialized") {
      // Anfrage ohne Angaben der neuen Fassung: gilt nur nach `initialize` mit Sitzung.
      if (current.protocol === "modern" || !sessionHeader || !legacySessions.has(sessionHeader))
        return sendJson(ex, 400, rpcError(body.id, -32600, "Keine Sitzung (initialize fehlt)."));
    }

    if (body.id === undefined) {
      record.status = 202;
      res.writeHead(202, { "content-length": 0 });
      res.end();
      return;
    }
    return dispatch(ex, body, isModern, sessionHeader);
  }

  async function handleControl(req: IncomingMessage, res: ServerResponse, path: string) {
    const ex: Exchange = {
      res,
      record: {
        method: req.method ?? "GET",
        path,
        query: "",
        headers: {},
        body: undefined,
        receivedAt: "",
        status: 0,
        closedByClient: false,
      },
      closed: false,
      serverEnded: false,
    };
    const rejected = controlRejection(req);
    if (rejected !== undefined) {
      req.resume();
      return sendJson(ex, rejected, {
        error: rejected === 401 ? "Steuer-Schlüssel fehlt." : "Nur von Loopback erlaubt.",
      });
    }
    const raw = (await readBody(req)) ?? "";
    if (path === TEST_MCP_CONTROL_PATHS.anfragen) {
      if (req.method !== "GET") return sendJson(ex, 405, { error: "Methode nicht erlaubt." });
      // Zugangsdaten geben wir auch hier nicht wieder heraus.
      const shown = records.map((r) => ({
        ...r,
        query: r.query.replace(/=[^&]*/g, "=***"),
        headers: r.headers.authorization
          ? { ...r.headers, authorization: "Bearer ***" }
          : r.headers,
      }));
      return sendJson(ex, 200, { requests: shown });
    }
    if (req.method !== "POST") return sendJson(ex, 405, { error: "Methode nicht erlaubt." });
    if (path === TEST_MCP_CONTROL_PATHS.verhalten) {
      let parsed: unknown;
      try {
        parsed = raw.trim() === "" ? {} : JSON.parse(raw);
      } catch {
        return sendJson(ex, 400, { error: "Der Körper ist kein gültiges JSON." });
      }
      const change = checkBehaviour(parsed);
      if (typeof change === "string") return sendJson(ex, 400, { error: change });
      configure(change);
      return sendJson(ex, 200, { ok: true });
    }
    reset();
    return sendJson(ex, 200, { ok: true });
  }

  function handle(req: IncomingMessage, res: ServerResponse): void {
    const parsedUrl = new URL(req.url ?? "/", "http://localhost");
    const path = parsedUrl.pathname;
    const controlPaths: readonly string[] = Object.values(TEST_MCP_CONTROL_PATHS);
    const plain = (status: number, text: string) => {
      req.resume();
      res.writeHead(status, { "content-type": "text/plain", "content-length": text.length });
      res.end(text);
    };
    let task: Promise<unknown>;
    if (path === TEST_MCP_ENDPOINT) task = handleMcp(req, res, path, parsedUrl.search);
    else if (controlPaths.includes(path)) task = handleControl(req, res, path);
    else if (path === HEALTH_PATH) task = Promise.resolve(plain(200, "ok"));
    else task = Promise.resolve(plain(404, "Pfad nicht gefunden."));
    task.catch(() => {
      if (!res.headersSent) plain(500, "Interner Fehler.");
      else res.destroy();
    });
  }

  return {
    async start(startArgs) {
      if (server) throw new Error("Der Test-MCP-Server läuft schon.");
      const host = startArgs?.host ?? "127.0.0.1";
      if (!isLoopbackHost(host))
        throw new Error("Der Test-MCP-Server lauscht nur auf Loopback (127.0.0.1).");
      const created = createServer(handle);
      // Wie beim Test-Anbieter: ruhende Verbindungen bleiben offen, bis `stop` sie schließt.
      created.keepAliveTimeout = 0;
      created.on("connection", (socket) => {
        sockets.add(socket);
        socket.once("close", () => sockets.delete(socket));
      });
      await new Promise<void>((resolve, reject) => {
        created.once("error", reject);
        created.listen(startArgs?.port ?? 0, host, () => {
          created.off("error", reject);
          resolve();
        });
      });
      server = created;
      const address = created.address();
      const port = typeof address === "object" && address ? address.port : 0;
      const shownHost = host.includes(":") ? `[${host}]` : host;
      return { url: `http://${shownHost}:${port}${TEST_MCP_ENDPOINT}`, port };
    },
    async stop() {
      const running = server;
      if (!running) return;
      server = undefined;
      for (const exchange of exchanges) endHard(exchange);
      const closing = new Promise<void>((resolve) => running.close(() => resolve()));
      for (const socket of sockets) socket.destroy();
      await closing;
    },
    get requests() {
      return [...records];
    },
    count: (rpcMethod) => records.filter((r) => r.rpcMethod === rpcMethod).length,
    callsOf: (toolName) =>
      records.filter((r) => r.rpcMethod === "tools/call" && r.toolName === toolName).length,
    configure,
    reset,
  };
}

function isLoopbackHost(host: string): boolean {
  return host === "127.0.0.1" || host === "::1" || host === "localhost";
}

/** Ist die Adresse eine Loopback-Adresse (IPv4, IPv6 oder IPv4 in IPv6)? */
export function isLoopback(address: string | undefined): boolean {
  if (address === undefined) return false;
  const plain = address.startsWith("::ffff:") ? address.slice(7) : address;
  return plain === "::1" || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(plain);
}
