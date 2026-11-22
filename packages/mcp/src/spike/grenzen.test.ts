/**
 * PaiBot – Prüfung der MCP-Bibliothek hinter der Ausgangs-Hülle: Abbruch, Zeit, Größe, Weiterleitung,
 * geänderte Werkzeug-Liste, Rückfragen des Servers.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Die Hülle liegt in `@paibot/llm`; das Paket darf sie laut Regel nicht importieren. Diese Prüfung
// nimmt sie ausnahmsweise über den Dateipfad, um die Bibliothek wirklich dahinter zu betreiben.
import { createEgressFetch, egressTargetOf } from "../../../llm/src/egress";
import type { ResponseLimits } from "../../../llm/src/pinned-fetch";
import {
  countingFetch,
  type Protocol,
  startTestServer,
  type TestServer,
  textTool,
} from "./testing";

const echtesFetch = globalThis.fetch;
let wachterAufrufe: string[];
let servers: TestServer[];
let clients: MCPClient[];

beforeEach(() => {
  wachterAufrufe = [];
  servers = [];
  clients = [];
  vi.stubGlobal("fetch", (input: unknown) => {
    wachterAufrufe.push(String(input));
    return Promise.reject(new TypeError("globales fetch gesperrt"));
  });
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(clients.map((c) => c.close().catch(() => undefined)));
  await Promise.all(servers.map((s) => s.close()));
});

async function neuerServer(protocol: Protocol): Promise<TestServer> {
  const server = await startTestServer(protocol);
  servers.push(server);
  return server;
}

/** Hülle, die genau die Adresse dieses Servers erlaubt (Loopback nur für die Prüfung). */
function huelle(server: TestServer, limits?: ResponseLimits, idleTimeoutMs?: number) {
  return createEgressFetch([{ ...egressTargetOf(server.origin), allowPrivate: true }], undefined, {
    ...(limits === undefined ? {} : { limits }),
    ...(idleTimeoutMs === undefined ? {} : { idleTimeoutMs }),
  });
}

async function verbinde(
  server: TestServer,
  fetchFn: typeof fetch,
  extra: { redirect?: "follow" | "error" } = {},
) {
  const gezaehlt = countingFetch(fetchFn);
  const client = await createMCPClient({
    transport: { type: "http", url: server.url, fetch: gezaehlt.fetch, ...extra },
  });
  clients.push(client);
  return { client, calls: gezaehlt.calls };
}

async function dauer<T>(f: () => Promise<T>): Promise<{ ms: number; fehler?: Error; wert?: T }> {
  const start = Date.now();
  try {
    const wert = await f();
    return { ms: Date.now() - start, wert };
  } catch (e) {
    return { ms: Date.now() - start, fehler: e as Error };
  }
}

const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Spielraum für Obergrenzen der Dauer. Die Tests prüfen, dass ein Aufruf an der eigenen Grenze endet
 * und nicht hängt; ein hängender Aufruf liefe bis zur Testgrenze (30 s). Eine enge Schranke in
 * Millisekunden würde auf einer ausgelasteten Maschine zufällig rot.
 */
const SPIELRAUM_MS = 15_000;

describe("Abbruch und Zeit", () => {
  it("ein Signal beendet callTool sofort, die Verbindung zum Server wird geschlossen", async () => {
    const server = await neuerServer("modern");
    const { client } = await verbinde(server, huelle(server));
    server.behavior.callMode = "hang";
    const abbruch = new AbortController();
    setTimeout(() => abbruch.abort(), 100);
    const r = await dauer(() =>
      client.callTool({ name: "suche", options: { signal: abbruch.signal } }),
    );
    expect(r.fehler?.message).toMatch(/aborted/i);
    expect(r.ms).toBeLessThan(100 + SPIELRAUM_MS);
    await warte(200);
    expect(server.abortedResponses()).toBeGreaterThanOrEqual(1);
    expect(wachterAufrufe).toEqual([]);
  });

  it("ohne Zeitgrenze und ohne Signal endet ein hängender Aufruf nie (Beobachtung)", async () => {
    const server = await neuerServer("modern");
    const { client } = await verbinde(server, huelle(server));
    server.behavior.callMode = "hang";
    let fertig = false;
    void client
      .callTool({ name: "suche" })
      .catch(() => undefined)
      .then(() => {
        fertig = true;
      });
    await warte(1500);
    expect(fertig).toBe(false);
  });

  it("timeout beendet einen hängenden Aufruf an der Grenze", async () => {
    const server = await neuerServer("modern");
    const { client } = await verbinde(server, huelle(server));
    server.behavior.callMode = "hang";
    const r = await dauer(() => client.callTool({ name: "suche", options: { timeout: 300 } }));
    expect(r.fehler?.message).toMatch(/timed out/i);
    expect(r.ms).toBeGreaterThanOrEqual(250);
    expect(r.ms).toBeLessThan(300 + SPIELRAUM_MS);
  });

  it("ein tröpfelnder Strom, der nie ein Ergebnis schickt, endet an der Grenze (maxTotalTimeout)", async () => {
    const server = await neuerServer("modern");
    const { client } = await verbinde(server, huelle(server));
    server.behavior.callMode = "drip";
    const r = await dauer(() =>
      client.callTool({ name: "suche", options: { maxTotalTimeout: 400 } }),
    );
    expect(r.fehler?.message).toMatch(/timed out/i);
    expect(r.ms).toBeLessThan(400 + SPIELRAUM_MS);
  });
});

describe("Größe", () => {
  it("Die Bibliothek selbst hat keine Größengrenze: 5 MB Antwort werden ohne Hülle angenommen", async () => {
    const server = await neuerServer("modern");
    server.behavior.bigBytes = 5 * 1024 * 1024;
    const { client } = await verbinde(server, echtesFetch);
    server.behavior.callMode = "big";
    const r = await client.callTool({ name: "suche" });
    const text = (r as { content: Array<{ text: string }> }).content[0]?.text ?? "";
    expect(text.length).toBe(5 * 1024 * 1024);
  });

  it("zu große Antwort bricht über die Hülle ab (Grenze 1 MB)", async () => {
    const server = await neuerServer("modern");
    server.behavior.bigBytes = 5 * 1024 * 1024;
    const { client } = await verbinde(server, huelle(server, { maxBodyBytes: 1024 * 1024 }));
    server.behavior.callMode = "big";
    const r = await dauer(() => client.callTool({ name: "suche" }));
    expect(r.fehler).toBeDefined();
    expect(r.wert).toBeUndefined();
    expect(wachterAufrufe).toEqual([]);
  });

  it("eine nie endende JSON-Antwort endet an der Grenze der Hülle, nicht erst an der Zeit", async () => {
    const server = await neuerServer("modern");
    const { client } = await verbinde(server, huelle(server, { maxBodyBytes: 256 * 1024 }));
    server.behavior.callMode = "endless-json";
    const r = await dauer(() => client.callTool({ name: "suche", options: { timeout: 10_000 } }));
    expect(r.fehler).toBeDefined();
    expect(r.fehler?.message).not.toMatch(/timed out/i);
    expect(r.ms).toBeLessThan(SPIELRAUM_MS);
    await warte(200);
    expect(server.abortedResponses()).toBeGreaterThanOrEqual(1);
  });

  it("ohne Hülle und ohne Zeitgrenze endet eine nie endende Antwort nicht (Beobachtung); mit timeout schon", async () => {
    const server = await neuerServer("modern");
    const { client } = await verbinde(server, echtesFetch);
    server.behavior.callMode = "endless-json";
    const r = await dauer(() => client.callTool({ name: "suche", options: { timeout: 600 } }));
    expect(r.fehler?.message).toMatch(/timed out/i);
    expect(r.ms).toBeLessThan(600 + SPIELRAUM_MS);
  });
});

describe("geänderte Werkzeug-Liste", () => {
  it("jedes listTools fragt neu; eine geänderte Beschreibung kommt beim zweiten Abruf an", async () => {
    const server = await neuerServer("modern");
    const { client, calls } = await verbinde(server, huelle(server));
    server.behavior.tools = [textTool("suche", "alt"), textTool("lesen")];
    const erste = await client.listTools();
    server.behavior.tools = [textTool("suche", "neu"), textTool("loeschen")];
    const zweite = await client.listTools();
    expect(erste.tools.map((t) => t.description)).toEqual(["alt", "Werkzeug lesen"]);
    expect(zweite.tools.map((t) => `${t.name}:${t.description}`)).toEqual([
      "suche:neu",
      "loeschen:Werkzeug loeschen",
    ]);
    expect(calls.filter((c) => c.body?.includes("tools/list")).length).toBe(2);
  });

  it("die Bibliothek prüft nicht, ob ein Werkzeug noch in der Liste steht: der Aufruf geht hinaus", async () => {
    const server = await neuerServer("modern");
    const { client } = await verbinde(server, huelle(server));
    server.behavior.tools = [textTool("suche")];
    await client.listTools();
    server.behavior.tools = [];
    await client.callTool({ name: "suche", arguments: { q: "x" } });
    expect(server.log.filter((l) => l.rpc === "tools/call").length).toBe(1);
  });

  it("Seiten: nextCursor wird nur weitergegeben, nicht von selbst abgerufen", async () => {
    const server = await neuerServer("modern");
    const { client } = await verbinde(server, huelle(server));
    server.behavior.tools = [textTool("a")];
    const r = await client.listTools();
    expect(r.nextCursor).toBeUndefined();
    expect(r.tools.length).toBe(1);
  });
});

describe("Weiterleitung und Auflösung", () => {
  async function weitergeleitet(mitHuelle: boolean) {
    const a = await neuerServer("modern");
    const b = await neuerServer("modern");
    a.behavior.redirectTo = `${b.origin}/mcp`;
    const verbindung = await verbinde(a, mitHuelle ? huelle(a) : echtesFetch);
    a.behavior.callMode = "redirect";
    const r = await dauer(() =>
      verbindung.client.callTool({ name: "suche", arguments: { geheim: "x" } }),
    );
    return { a, b, r };
  }

  it("Standard (redirect error) mit Hülle: scheitert, am fremden Ziel kommt kein Byte an", async () => {
    // Der Client wird ohne `redirect` angelegt; die Bibliothek setzt selbst „error“.
    const { b, r } = await weitergeleitet(true);
    expect(r.fehler).toBeDefined();
    expect(b.log).toEqual([]);
  });

  it("Standard (redirect error) ohne Hülle: scheitert ebenfalls, kein Byte am fremden Ziel", async () => {
    const { b, r } = await weitergeleitet(false);
    expect(r.fehler).toBeDefined();
    expect(b.log).toEqual([]);
  });

  it("redirect follow mit Hülle: Ziel nicht in der Ausgangs-Liste, kein Byte am fremden Ziel", async () => {
    const a = await neuerServer("modern");
    const b = await neuerServer("modern");
    a.behavior.redirectTo = `${b.origin}/mcp`;
    const { client } = await verbinde(a, huelle(a), { redirect: "follow" });
    a.behavior.callMode = "redirect";
    const r = await dauer(() => client.callTool({ name: "suche", arguments: { geheim: "x" } }));
    expect(r.fehler).toBeDefined();
    expect(b.log).toEqual([]);
  });

  it("Gegenprobe: redirect follow ohne Hülle erreicht das fremde Ziel mit den Argumenten", async () => {
    const a = await neuerServer("modern");
    const b = await neuerServer("modern");
    a.behavior.redirectTo = `${b.origin}/mcp`;
    const { client } = await verbinde(a, echtesFetch, { redirect: "follow" });
    a.behavior.callMode = "redirect";
    await dauer(() => client.callTool({ name: "suche", arguments: { geheim: "x" } }));
    expect(b.log.some((l) => l.body?.includes("geheim"))).toBe(true);
  });

  it("Auflösung wird nach der Prüfung nicht erneut gefragt: zweite Antwort „privat“ erreicht den Server nicht", async () => {
    const server = await neuerServer("modern");
    const port = server.origin.split(":").pop();
    let aufrufe = 0;
    const fetchFn = createEgressFetch(
      [{ protocol: "http:", host: "mcp.beispiel.test", port: Number(port) }],
      undefined,
      {
        idleTimeoutMs: 1000,
        // Erste Antwort öffentlich, jede weitere Loopback (der echte Server).
        lookup: async () => {
          aufrufe += 1;
          return aufrufe === 1 ? ["93.184.216.34"] : ["127.0.0.1"];
        },
      },
    );
    const r = await dauer(() =>
      createMCPClient({
        transport: { type: "http", url: `http://mcp.beispiel.test:${port}/mcp`, fetch: fetchFn },
        initializationOptions: { timeout: 3000 },
      }),
    );
    // Die Verbindung geht an die erste (geprüfte) Adresse und scheitert dort; nicht an der Hülle.
    expect(r.fehler).toBeDefined();
    expect(r.fehler?.name).not.toBe("EgressBlockedError");
    expect(aufrufe).toBeGreaterThanOrEqual(1);
    expect(server.log).toEqual([]);
  }, 15_000);

  it("Name, der auf eine private Adresse zeigt, wird abgelehnt, kein Byte am Server", async () => {
    const server = await neuerServer("modern");
    const port = server.origin.split(":").pop();
    const fetchFn = createEgressFetch(
      [{ protocol: "http:", host: "mcp.beispiel.test", port: Number(port) }],
      undefined,
      { lookup: async () => ["127.0.0.1"] },
    );
    const r = await dauer(() =>
      createMCPClient({
        transport: { type: "http", url: `http://mcp.beispiel.test:${port}/mcp`, fetch: fetchFn },
      }),
    );
    expect(r.fehler).toBeDefined();
    expect(server.log).toEqual([]);
  });

  it("Anmelde-Metadaten, die auf einen fremden Server zeigen, werden von der Hülle abgefangen", async () => {
    const a = await neuerServer("modern");
    const b = await neuerServer("modern");
    a.behavior.oauth = true;
    a.behavior.authServer = b.origin;
    const fetchFn = huelle(a);
    const r = await dauer(() =>
      createMCPClient({
        transport: {
          type: "http",
          url: a.url,
          fetch: fetchFn,
          authProvider: {
            redirectUrl: "http://localhost/callback",
            clientMetadata: { client_name: "t", redirect_uris: ["http://localhost/callback"] },
            clientInformation: () => undefined,
            saveClientInformation: () => undefined,
            tokens: () => undefined,
            saveTokens: () => undefined,
            redirectToAuthorization: () => undefined,
            saveCodeVerifier: () => undefined,
            codeVerifier: () => "v",
          },
        },
      }),
    );
    expect(r.fehler).toBeDefined();
    expect(b.log).toEqual([]);
  });
});

describe("Rückfragen des Servers (input_required) ohne Handler", () => {
  it("Rückfrage mit Eingabe-Anforderung: Fehler, kein Hängen, genau ein Aufruf", async () => {
    const server = await neuerServer("modern");
    const { client } = await verbinde(server, huelle(server));
    server.behavior.callMode = "input-required";
    const r = await dauer(() => client.callTool({ name: "suche" }));
    expect(r.fehler?.message).toMatch(/no handler is registered/);
    expect(r.ms).toBeLessThan(SPIELRAUM_MS);
    expect(server.log.filter((l) => l.rpc === "tools/call").length).toBe(1);
  });

  it("Rückfrage nur mit Zustand: wiederholt höchstens zehn Runden, dann Fehler", async () => {
    const server = await neuerServer("modern");
    const { client } = await verbinde(server, huelle(server));
    server.behavior.callMode = "input-required-state";
    const r = await dauer(() => client.callTool({ name: "suche" }));
    expect(r.fehler?.message).toMatch(/still requires input after 10 rounds/);
    expect(server.log.filter((l) => l.rpc === "tools/call").length).toBe(11);
    expect(r.ms).toBeLessThan(SPIELRAUM_MS * 2);
  }, 20_000);

  it("Rückfrage nur mit Zustand: maxTotalTimeout beendet die Runden früher", async () => {
    const server = await neuerServer("modern");
    const { client } = await verbinde(server, huelle(server));
    server.behavior.callMode = "input-required-state";
    const r = await dauer(() =>
      client.callTool({ name: "suche", options: { maxTotalTimeout: 700 } }),
    );
    expect(r.fehler?.message).toMatch(/timed out/i);
    expect(r.ms).toBeLessThan(700 + SPIELRAUM_MS);
    expect(server.log.filter((l) => l.rpc === "tools/call").length).toBeLessThan(11);
  });
});
