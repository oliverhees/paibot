/**
 * PaiBot – Prüfung der MCP-Bibliothek: Wiederverbinden, Ende nach close(), Seiten, Fehler-Ergebnis,
 * Weiterleitungen (Kopfzeilen und Körper).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

// biome-ignore lint/style/noRestrictedImports: Prüfung der Bibliothek; nur in dieser Test-Datei
import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
// Ausnahme nur für diese Prüfung, siehe `grenzen.test.ts`.
import { createEgressFetch, egressTargetOf } from "../../../llm/src/egress";
import { countingFetch, type Protocol, startTestServer, type TestServer } from "./testing";

const echtesFetch = globalThis.fetch;
let servers: TestServer[];
let clients: MCPClient[];
let wachter: string[];

beforeEach(() => {
  servers = [];
  clients = [];
  wachter = [];
  vi.stubGlobal("fetch", (input: unknown) => {
    wachter.push(String(input));
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

async function verbinde(
  server: TestServer,
  fetchFn: typeof fetch,
  extra: { redirect?: "follow" | "error"; headers?: Record<string, string> } = {},
) {
  const gezaehlt = countingFetch(fetchFn);
  const client = await createMCPClient({
    transport: { type: "http", url: server.url, fetch: gezaehlt.fetch, ...extra },
  });
  clients.push(client);
  return { client, calls: gezaehlt.calls };
}

const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("Ereignis-Strom und close()", () => {
  it("ein abgebrochener Strom wird immer wieder neu aufgebaut (etwa im Sekundentakt), solange der Client offen ist", async () => {
    const server = await neuerServer("legacy");
    server.behavior.getMode = "sse-break";
    const { client, calls } = await verbinde(server, echtesFetch);
    await warte(5000);
    const nach5 = calls.filter((c) => c.method === "GET").length;
    expect(nach5).toBeGreaterThanOrEqual(4);
    await warte(2500);
    expect(calls.filter((c) => c.method === "GET").length).toBeGreaterThan(nach5);
    await client.close();
  }, 20_000);

  it("nach close() geht keine Anfrage mehr hinaus, auch nicht aus einer schon geplanten Wiederverbindung", async () => {
    const server = await neuerServer("legacy");
    server.behavior.getMode = "sse-break";
    const { client, calls } = await verbinde(server, echtesFetch);
    // Warten, bis der erste Strom abgebrochen ist; die Wiederverbindung ist dann geplant (1 s).
    while (calls.filter((c) => c.method === "GET").length < 1) await warte(10);
    await warte(150);
    await client.close();
    const nachClose = calls.length;
    const serverNachClose = server.log.length;
    await warte(3500);
    expect(calls.length).toBe(nachClose);
    expect(server.log.length).toBe(serverNachClose);
    // Ein weiterer Aufruf am geschlossenen Client scheitert, ohne dass etwas hinausgeht.
    await expect(client.listTools()).rejects.toThrow(/closed/i);
    expect(calls.length).toBe(nachClose);
    expect(wachter).toEqual([]);
  }, 20_000);
});

describe("Seiten beim Auflisten", () => {
  it("listTools ruft genau eine Seite ab und gibt nextCursor zurück; der Aufrufer begrenzt", async () => {
    const server = await neuerServer("modern");
    server.behavior.endlessPages = true;
    const { client } = await verbinde(server, echtesFetch);
    const seite = await client.listTools();
    expect(seite.nextCursor).toBe("weiter");
    expect(server.log.filter((l) => l.rpc === "tools/list").length).toBe(1);
  });

  it("tools() folgt jedem nextCursor ohne Grenze: bei endlosen Seiten läuft es, bis man schließt", async () => {
    const server = await neuerServer("modern");
    server.behavior.endlessPages = true;
    const { client } = await verbinde(server, echtesFetch);
    void client.tools().catch(() => undefined);
    await warte(1000);
    const seiten = server.log.filter((l) => l.rpc === "tools/list").length;
    expect(seiten).toBeGreaterThan(20);
    await client.close();
    await warte(300);
    const nachClose = server.log.length;
    await warte(500);
    expect(server.log.length).toBe(nachClose);
  });
});

describe("Ergebnis mit isError", () => {
  it("kommt als normales Ergebnis mit isError true an, nicht als Ausnahme", async () => {
    const server = await neuerServer("modern");
    const { client } = await verbinde(server, echtesFetch);
    server.behavior.callMode = "is-error";
    const r = (await client.callTool({ name: "suche" })) as {
      isError?: boolean;
      content: Array<{ text: string }>;
    };
    expect(r.isError).toBe(true);
    expect(r.content[0]?.text).toBe("Fehler im Werkzeug");
  });
});

describe("Weiterleitungen", () => {
  it("jede Anfrage trägt redirect error: Liste, Aufruf, Strom, Sitzungs-Ende (beide Abläufe)", async () => {
    for (const protocol of ["modern", "legacy"] as const) {
      const server = await neuerServer(protocol);
      const { client, calls } = await verbinde(server, echtesFetch);
      await client.listTools();
      await client.callTool({ name: "suche" });
      await client.close();
      expect(calls.length).toBeGreaterThanOrEqual(3);
      expect(new Set(calls.map((c) => c.redirect))).toEqual(new Set(["error"]));
    }
  });

  it("redirect error gilt auch für GET und DELETE nach dem Verbinden: kein Byte am fremden Ziel", async () => {
    const a = await neuerServer("legacy");
    const b = await neuerServer("legacy");
    a.behavior.getMode = "sse-break";
    const { client, calls } = await verbinde(a, echtesFetch);
    a.behavior.redirectTo = `${b.origin}/mcp`;
    a.behavior.redirectAll = true;
    await warte(1500);
    await client.close();
    // Wiederverbindung (GET) und Sitzungs-Ende (DELETE) wurden angefragt und umgeleitet.
    expect(calls.filter((c) => c.method === "GET").length).toBeGreaterThanOrEqual(2);
    expect(calls.some((c) => c.method === "DELETE")).toBe(true);
    expect(b.log).toEqual([]);
  });

  it("Anmeldung: jede Anfrage trägt redirect error (Beobachtung)", async () => {
    const a = await neuerServer("modern");
    a.behavior.oauth = true;
    const gezaehlt = countingFetch(echtesFetch);
    await createMCPClient({
      transport: {
        type: "http",
        url: a.url,
        fetch: gezaehlt.fetch,
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
    }).catch(() => undefined);
    expect(gezaehlt.calls.length).toBeGreaterThan(3);
    process.stderr.write(
      `ANMELDUNG redirect-Werte: ${JSON.stringify(gezaehlt.calls.map((c) => `${c.method} ${new URL(c.url).pathname} ${c.redirect}`))}\n`,
    );
  });

  it("mit redirect follow (ohne Hülle) gehen POST-Körper und eigene Kopfzeilen an das fremde Ziel", async () => {
    const a = await neuerServer("modern");
    const b = await neuerServer("modern");
    const { client } = await verbinde(a, echtesFetch, {
      redirect: "follow",
      headers: { authorization: "Bearer geheim", "x-token": "geheim" },
    });
    a.behavior.redirectTo = `${b.origin}/mcp`;
    a.behavior.callMode = "redirect";
    await client.callTool({ name: "suche", arguments: { privat: "x" } }).catch(() => undefined);
    const eintrag = b.log.find((l) => l.rpc === "tools/call");
    expect(eintrag?.body).toContain("privat");
    expect(eintrag?.headers?.["x-token"]).toBe("geheim");
    process.stderr.write(
      `FOLGEN ohne Hülle, authorization am Ziel: ${eintrag?.headers?.authorization}\n`,
    );
  });

  it("mit redirect follow und einer Hülle, die beide Ziele erlaubt: authorization fällt weg, x-token und Körper gehen mit", async () => {
    const a = await neuerServer("modern");
    const b = await neuerServer("modern");
    const huelle = createEgressFetch(
      [a, b].map((s) => ({ ...egressTargetOf(s.origin), allowPrivate: true })),
    );
    const { client } = await verbinde(a, huelle, {
      redirect: "follow",
      headers: { authorization: "Bearer geheim", "x-token": "geheim" },
    });
    a.behavior.redirectTo = `${b.origin}/mcp`;
    a.behavior.callMode = "redirect";
    await client.callTool({ name: "suche", arguments: { privat: "x" } }).catch(() => undefined);
    const eintrag = b.log.find((l) => l.rpc === "tools/call");
    expect(eintrag?.body).toContain("privat");
    expect(eintrag?.headers?.authorization).toBeUndefined();
    expect(eintrag?.headers?.["x-token"]).toBe("geheim");
  });

  it("Anmelde-Metadaten mit Weiterleitung: die Bibliothek folgt selbst, jeder Schritt geht über das fetch; die Hülle sperrt das fremde Ziel", async () => {
    const a = await neuerServer("modern");
    const b = await neuerServer("modern");
    a.behavior.oauth = true;
    a.behavior.redirectWellKnown = true;
    a.behavior.redirectTo = `${b.origin}/.well-known/oauth-protected-resource`;
    const huelle = createEgressFetch([{ ...egressTargetOf(a.origin), allowPrivate: true }]);
    const mitHuelle = countingFetch(huelle);
    await createMCPClient({
      transport: {
        type: "http",
        url: a.url,
        fetch: mitHuelle.fetch,
        authProvider: leereAnmeldung(),
      },
    }).catch(() => undefined);
    expect(b.log).toEqual([]);
    const ohne = countingFetch(echtesFetch);
    await createMCPClient({
      transport: { type: "http", url: a.url, fetch: ohne.fetch, authProvider: leereAnmeldung() },
    }).catch(() => undefined);
    process.stderr.write(
      `WELLKNOWN ohne Hülle: Ziel B sah ${b.log.length} Anfragen; Aufrufe am fetch: ${JSON.stringify(ohne.calls.map((c) => `${new URL(c.url).port === new URL(b.origin).port ? "B" : "A"}${new URL(c.url).pathname} ${c.redirect}`))}\n`,
    );
  });
});

function leereAnmeldung() {
  return {
    redirectUrl: "http://localhost/callback",
    clientMetadata: { client_name: "t", redirect_uris: ["http://localhost/callback"] },
    clientInformation: () => undefined,
    saveClientInformation: () => undefined,
    tokens: () => undefined,
    saveTokens: () => undefined,
    redirectToAuthorization: () => undefined,
    saveCodeVerifier: () => undefined,
    codeVerifier: () => "v",
  };
}
