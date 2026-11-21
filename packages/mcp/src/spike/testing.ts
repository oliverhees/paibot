/**
 * PaiBot – Test-Hilfen für die Prüfung der MCP-Bibliothek: kleiner lokaler MCP-Server und ein
 * zählendes `fetch`.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/** `modern`: zustandslos ohne Anmeldung (Fassung 2026-07-28); `legacy`: mit `initialize` und Sitzung. */
export type Protocol = "modern" | "legacy";

export interface ToolDef {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
}

/** Wie der Server auf `tools/call` antwortet. */
export type CallMode =
  /** JSON-Antwort mit einem Text. */
  | "json"
  /** Ereignis-Strom: erst eine Meldung zum Fortschritt, dann das Ergebnis. */
  | "sse"
  /** Antwortet nie, hält die Verbindung offen. */
  | "hang"
  /** Antwortet mit JSON, hört aber nie auf zu senden. */
  | "endless-json"
  /** Ereignis-Strom, der nur Kommentar-Zeilen tröpfelt und nie ein Ergebnis schickt. */
  | "drip"
  /** JSON-Antwort mit `bigBytes` Zeichen Text. */
  | "big"
  /** Modern: Rückfrage mit `inputRequests`. */
  | "input-required"
  /** Modern: Rückfrage nur mit `requestState`, immer wieder. */
  | "input-required-state"
  /** Antwortet mit einer Weiterleitung auf `redirectTo`. */
  | "redirect"
  /** JSON-Antwort mit `isError: true`. */
  | "is-error";

/** Wie der Server auf `GET` (Ereignis-Strom vom Server, nur Fassung mit `initialize`) antwortet. */
export type GetMode = "405" | "sse-once" | "sse-hold" | "sse-break";

export interface Behavior {
  tools: ToolDef[];
  callMode: CallMode;
  getMode: GetMode;
  bigBytes: number;
  redirectTo: string;
  /** Der Server verlangt eine Anmeldung (`401` mit Hinweis auf die Metadaten) und stellt sie bereit. */
  oauth: boolean;
  /** `tools/list` liefert immer eine weitere Seite (`nextCursor`). */
  endlessPages: boolean;
  /** Jede Anfrage an `/mcp` (jede Methode) wird mit 307 auf `redirectTo` umgeleitet. */
  redirectAll: boolean;
  /** Die Adressen der Anmelde-Metadaten werden mit 307 auf `redirectTo` umgeleitet. */
  redirectWellKnown: boolean;
  /** Adresse des Anmelde-Servers in den Metadaten (Standard: dieser Server). */
  authServer?: string;
}

export interface LogEntry {
  http: string;
  path: string;
  /** JSON-RPC-Methode, falls die Anfrage eine hatte. */
  rpc?: string;
  /** Der Körper der Anfrage (nur kurz, für Prüfungen von Argumenten). */
  body?: string;
  /** Ausgewählte Kopfzeilen der Anfrage. */
  headers?: Record<string, string>;
}

export interface TestServer {
  origin: string;
  url: string;
  log: LogEntry[];
  behavior: Behavior;
  /** Zahl der Verbindungen, die der Server als beendet gesehen hat, bevor er fertig war. */
  abortedResponses: () => number;
  close: () => Promise<void>;
}

export function textTool(name: string, description = `Werkzeug ${name}`): ToolDef {
  return {
    name,
    description,
    inputSchema: { type: "object", properties: { q: { type: "string" } } },
  };
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
  });
}

const JSON_HEADERS = { "content-type": "application/json" };

function rpcResult(id: unknown, result: Record<string, unknown>, protocol: Protocol): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    id,
    result: protocol === "modern" ? { resultType: "complete", ...result } : result,
  });
}

/**
 * Startet einen kleinen MCP-Server auf `127.0.0.1` (Streamable HTTP). Jede eingehende Anfrage steht
 * in `log`, damit sich zählen lässt, was wirklich ankam.
 */
export async function startTestServer(protocol: Protocol): Promise<TestServer> {
  const log: LogEntry[] = [];
  const behavior: Behavior = {
    tools: [textTool("suche")],
    callMode: "json",
    getMode: "405",
    bigBytes: 0,
    redirectTo: "",
    oauth: false,
    endlessPages: false,
    redirectAll: false,
    redirectWellKnown: false,
  };
  let aborted = 0;
  let origin = "";
  const open = new Set<ServerResponse>();

  const server: Server = createServer((req, res) => {
    open.add(res);
    res.on("close", () => {
      open.delete(res);
      if (!res.writableFinished) aborted += 1;
    });
    void handle(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500).end();
    });
  });
  server.keepAliveTimeout = 0;

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = new URL(req.url ?? "/", "http://x").pathname;
    const http = req.method ?? "GET";
    const raw = http === "POST" ? await readBody(req) : "";
    const entry: LogEntry = { http, path };
    const kopf: Record<string, string> = {};
    for (const name of ["authorization", "x-token"]) {
      const wert = req.headers[name];
      if (typeof wert === "string") kopf[name] = wert;
    }
    if (Object.keys(kopf).length > 0) entry.headers = kopf;
    if (raw !== "") {
      entry.body = raw.slice(0, 2000);
      try {
        const message = JSON.parse(raw) as { method?: string };
        if (message.method !== undefined) entry.rpc = message.method;
      } catch {
        // kein JSON
      }
    }
    log.push(entry);

    if (behavior.redirectWellKnown && path.startsWith("/.well-known/")) {
      res.writeHead(307, { location: behavior.redirectTo }).end();
      return;
    }
    if (path.startsWith("/.well-known/oauth-protected-resource")) {
      res.writeHead(200, JSON_HEADERS).end(
        JSON.stringify({
          resource: `${origin}/mcp`,
          authorization_servers: [behavior.authServer ?? origin],
        }),
      );
      return;
    }
    if (path.startsWith("/.well-known/oauth-authorization-server")) {
      const base = behavior.authServer ?? origin;
      res.writeHead(200, JSON_HEADERS).end(
        JSON.stringify({
          issuer: base,
          authorization_endpoint: `${base}/authorize`,
          token_endpoint: `${base}/token`,
          registration_endpoint: `${base}/register`,
          response_types_supported: ["code"],
          grant_types_supported: ["authorization_code", "refresh_token"],
          code_challenge_methods_supported: ["S256"],
          token_endpoint_auth_methods_supported: ["none"],
        }),
      );
      return;
    }
    if (path === "/register") {
      res.writeHead(201, JSON_HEADERS).end(
        JSON.stringify({
          client_id: "beispiel-client",
          redirect_uris: ["http://localhost/callback"],
        }),
      );
      return;
    }
    if (path === "/token") {
      res
        .writeHead(200, JSON_HEADERS)
        .end(JSON.stringify({ access_token: "neues-zugangszeichen", token_type: "Bearer" }));
      return;
    }
    if (path !== "/mcp") {
      res.writeHead(404).end();
      return;
    }
    if (behavior.redirectAll) {
      res.writeHead(307, { location: behavior.redirectTo }).end();
      return;
    }
    if (behavior.oauth && !(req.headers.authorization ?? "").startsWith("Bearer ")) {
      res
        .writeHead(401, {
          "www-authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`,
        })
        .end();
      return;
    }

    if (http === "DELETE") {
      res.writeHead(204).end();
      return;
    }
    if (http === "GET") {
      if (behavior.getMode === "405") {
        res.writeHead(405).end();
        return;
      }
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(
        `id: e1\nevent: message\ndata: ${JSON.stringify({
          jsonrpc: "2.0",
          method: "notifications/tools/list_changed",
        })}\n\n`,
      );
      if (behavior.getMode === "sse-once") res.end();
      // Verbindung bricht mitten im Strom ab (kein sauberes Ende).
      if (behavior.getMode === "sse-break") setTimeout(() => res.destroy(), 50);
      return;
    }

    const message = JSON.parse(raw) as {
      id?: number;
      method: string;
      params?: { name?: string };
    };
    if (message.id === undefined) {
      res.writeHead(202).end();
      return;
    }
    const id = message.id;
    switch (message.method) {
      case "server/discover": {
        if (protocol === "legacy") {
          res.writeHead(200, JSON_HEADERS).end(
            JSON.stringify({
              jsonrpc: "2.0",
              id,
              error: { code: -32601, message: "Method not found" },
            }),
          );
          return;
        }
        res
          .writeHead(200, JSON_HEADERS)
          .end(
            rpcResult(
              id,
              { supportedVersions: ["2026-07-28"], capabilities: { tools: {} } },
              protocol,
            ),
          );
        return;
      }
      case "initialize": {
        res.writeHead(200, { ...JSON_HEADERS, "mcp-session-id": "sitzung-1" }).end(
          rpcResult(
            id,
            {
              protocolVersion: "2025-11-25",
              capabilities: { tools: {} },
              serverInfo: { name: "test", version: "1" },
            },
            protocol,
          ),
        );
        return;
      }
      case "tools/list": {
        res
          .writeHead(200, JSON_HEADERS)
          .end(
            rpcResult(
              id,
              behavior.endlessPages
                ? { tools: behavior.tools, nextCursor: "weiter" }
                : { tools: behavior.tools },
              protocol,
            ),
          );
        return;
      }
      case "tools/call": {
        await call(res, id, message.params?.name ?? "");
        return;
      }
      default:
        res
          .writeHead(200, JSON_HEADERS)
          .end(
            JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32601, message: "unbekannt" } }),
          );
    }
  }

  async function call(res: ServerResponse, id: number, name: string): Promise<void> {
    const text = (value: string) => ({ content: [{ type: "text", text: value }] });
    switch (behavior.callMode) {
      case "json":
        res.writeHead(200, JSON_HEADERS).end(rpcResult(id, text(`Ergebnis von ${name}`), protocol));
        return;
      case "sse":
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.write(
          `event: message\ndata: ${JSON.stringify({
            jsonrpc: "2.0",
            method: "notifications/progress",
            params: { progressToken: "p", progress: 1 },
          })}\n\n`,
        );
        res.write(
          `event: message\ndata: ${rpcResult(id, text(`Strom von ${name}`), protocol)}\n\n`,
        );
        res.end();
        return;
      case "hang":
        res.writeHead(200, { "content-type": "text/event-stream" });
        res.write(": offen\n\n");
        return;
      case "endless-json": {
        res.writeHead(200, JSON_HEADERS);
        res.write(`{"jsonrpc":"2.0","id":${id},"result":{"content":[{"type":"text","text":"`);
        const chunk = "A".repeat(16 * 1024);
        const timer = setInterval(() => {
          if (res.destroyed) {
            clearInterval(timer);
            return;
          }
          res.write(chunk);
        }, 2);
        res.on("close", () => clearInterval(timer));
        return;
      }
      case "drip": {
        res.writeHead(200, { "content-type": "text/event-stream" });
        const timer = setInterval(() => {
          if (res.destroyed) {
            clearInterval(timer);
            return;
          }
          res.write(": tropfen\n\n");
        }, 20);
        res.on("close", () => clearInterval(timer));
        return;
      }
      case "big":
        res
          .writeHead(200, JSON_HEADERS)
          .end(rpcResult(id, text("B".repeat(behavior.bigBytes)), protocol));
        return;
      case "input-required":
        res.writeHead(200, JSON_HEADERS).end(
          JSON.stringify({
            jsonrpc: "2.0",
            id,
            result: {
              resultType: "input_required",
              inputRequests: {
                frage: {
                  method: "elicitation/create",
                  params: {
                    message: "Welche Zahl?",
                    requestedSchema: { type: "object", properties: { n: { type: "number" } } },
                  },
                },
              },
            },
          }),
        );
        return;
      case "input-required-state":
        res.writeHead(200, JSON_HEADERS).end(
          JSON.stringify({
            jsonrpc: "2.0",
            id,
            result: { resultType: "input_required", requestState: "weiter" },
          }),
        );
        return;
      case "is-error":
        res
          .writeHead(200, JSON_HEADERS)
          .end(
            rpcResult(
              id,
              { content: [{ type: "text", text: "Fehler im Werkzeug" }], isError: true },
              protocol,
            ),
          );
        return;
      case "redirect":
        res.writeHead(307, { location: behavior.redirectTo }).end();
        return;
    }
  }

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    origin,
    url: `${origin}/mcp`,
    log,
    behavior,
    abortedResponses: () => aborted,
    close: () =>
      new Promise<void>((resolve) => {
        for (const res of open) res.destroy();
        server.close(() => resolve());
      }),
  };
}

export interface CountedCall {
  method: string;
  url: string;
  body?: string;
  redirect?: string;
}

/** Ein `fetch`, das jeden Aufruf mitzählt und an `inner` weiterreicht. */
export function countingFetch(inner: typeof fetch): { fetch: typeof fetch; calls: CountedCall[] } {
  const calls: CountedCall[] = [];
  const wrapped = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");
    calls.push({
      method,
      url,
      ...(typeof init?.body === "string" ? { body: init.body } : {}),
      ...(init?.redirect === undefined ? {} : { redirect: init.redirect }),
    });
    return inner(input, init);
  }) as typeof fetch;
  return { fetch: wrapped, calls };
}

/** Schlüssel „HTTP-Methode + JSON-RPC-Methode“ für den Vergleich von Zähler und Server-Protokoll. */
export function keyOfLog(entry: LogEntry): string {
  return `${entry.http} ${entry.rpc ?? entry.path}`;
}

/** Wie `keyOfLog`, für das, was am hineingereichten `fetch` mitgezählt wurde. */
export function keyOfCall(call: CountedCall): string {
  const path = new URL(call.url).pathname;
  if (call.method === "POST" && call.body !== undefined) {
    try {
      const message = JSON.parse(call.body) as { method?: string };
      if (message.method !== undefined) return `POST ${message.method}`;
    } catch {
      // kein JSON
    }
  }
  return `${call.method} ${path}`;
}
