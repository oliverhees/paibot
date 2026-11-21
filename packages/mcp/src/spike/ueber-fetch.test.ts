/**
 * PaiBot – Prüfung: Die MCP-Bibliothek schickt jede Anfrage über das hineingereichte `fetch`.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

// biome-ignore lint/style/noRestrictedImports: Prüfung der Bibliothek; nur in dieser Test-Datei
import { auth, createMCPClient, type OAuthClientProvider } from "@ai-sdk/mcp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type CountedCall,
  countingFetch,
  keyOfCall,
  keyOfLog,
  type Protocol,
  startTestServer,
  type TestServer,
} from "./testing";

// Das echte `fetch`, bevor die Prüfung `globalThis.fetch` durch einen Wächter ersetzt.
const echtesFetch = globalThis.fetch;

let wachterAufrufe: string[];
let servers: TestServer[];

beforeEach(() => {
  wachterAufrufe = [];
  servers = [];
  // Wächter: Jeder Aufruf am globalen `fetch` wird gezählt (und abgelehnt).
  vi.stubGlobal("fetch", (input: unknown) => {
    wachterAufrufe.push(String(input));
    return Promise.reject(new TypeError("globales fetch gesperrt"));
  });
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(servers.map((s) => s.close()));
});

async function neuerServer(protocol: Protocol): Promise<TestServer> {
  const server = await startTestServer(protocol);
  servers.push(server);
  return server;
}

const sortiert = (liste: string[]) => [...liste].sort();

function gleich(calls: CountedCall[], server: TestServer) {
  expect(sortiert(calls.map(keyOfCall))).toEqual(sortiert(server.log.map(keyOfLog)));
}

describe.each(["modern", "legacy"] as const)("Anfragen im Ablauf %s", (protocol) => {
  it("jede Anfrage geht über das hineingereichte fetch; das globale wird nie berührt", async () => {
    const server = await neuerServer(protocol);
    const { fetch: gezaehlt, calls } = countingFetch(echtesFetch);
    const client = await createMCPClient({
      transport: { type: "http", url: server.url, fetch: gezaehlt },
    });

    const liste = await client.listTools();
    expect(liste.tools.map((t) => t.name)).toEqual(["suche"]);
    server.behavior.callMode = "json";
    await client.callTool({ name: "suche", arguments: { q: "a" } });
    server.behavior.callMode = "sse";
    await client.callTool({ name: "suche", arguments: { q: "b" } });
    await client.close();

    // Zähler am hineingereichten fetch = Anfragen, die der Server gesehen hat.
    gleich(calls, server);
    expect(wachterAufrufe).toEqual([]);
    const arten = new Set(calls.map(keyOfCall));
    expect(arten.has("POST server/discover")).toBe(true);
    expect(arten.has("POST tools/list")).toBe(true);
    expect(arten.has("POST tools/call")).toBe(true);
    if (protocol === "legacy") {
      // Rückfall auf `initialize`, Meldung „fertig“, Strom vom Server, Sitzungs-Ende.
      expect(arten.has("POST initialize")).toBe(true);
      expect(arten.has("POST notifications/initialized")).toBe(true);
      expect(arten.has("GET /mcp")).toBe(true);
      expect(arten.has("DELETE /mcp")).toBe(true);
    } else {
      expect(arten.has("POST initialize")).toBe(false);
      expect(arten.has("DELETE /mcp")).toBe(false);
    }
  });

  it("Gegenprobe: ohne hineingereichtes fetch geht es am globalen fetch vorbei und wird bemerkt", async () => {
    const server = await neuerServer(protocol);
    const { fetch: gezaehlt, calls } = countingFetch(echtesFetch);
    void gezaehlt;
    // Absichtlich ohne `fetch`: Die Bibliothek greift zum globalen (hier dem Wächter).
    await createMCPClient({ transport: { type: "http", url: server.url } }).catch(() => undefined);
    expect(calls.length).toBe(0);
    expect(wachterAufrufe.length).toBeGreaterThan(0);
    expect(server.log.length).toBe(0);
  });
});

describe("Ereignis-Strom vom Server (Ablauf mit initialize)", () => {
  async function laufe(getMode: "sse-once" | "sse-break", warteMs: number) {
    const server = await neuerServer("legacy");
    server.behavior.getMode = getMode;
    const { fetch: gezaehlt, calls } = countingFetch(echtesFetch);
    const client = await createMCPClient({
      transport: { type: "http", url: server.url, fetch: gezaehlt },
    });
    const start = Date.now();
    while (calls.filter((c) => c.method === "GET").length < 2 && Date.now() - start < warteMs) {
      await new Promise((r) => setTimeout(r, 100));
    }
    await client.close();
    return { server, calls };
  }

  it("Wiederverbinden nach abgebrochenem Strom läuft über das hineingereichte fetch", async () => {
    const { server, calls } = await laufe("sse-break", 6000);
    expect(calls.filter((c) => c.method === "GET").length).toBeGreaterThanOrEqual(2);
    gleich(calls, server);
    expect(wachterAufrufe).toEqual([]);
  }, 15_000);

  it("Beobachtung: nach sauberem Ende des Stroms verbindet die Bibliothek nicht neu", async () => {
    const { server, calls } = await laufe("sse-once", 2500);
    expect(calls.filter((c) => c.method === "GET").length).toBe(1);
    gleich(calls, server);
    expect(wachterAufrufe).toEqual([]);
  }, 15_000);
});

function anmeldung(): OAuthClientProvider & { gespeichert: { tokens?: unknown } } {
  const zustand: {
    tokens?: { access_token: string; token_type: string; refresh_token?: string };
    client?: { client_id: string };
    verifier?: string;
    gespeichert: { tokens?: unknown };
  } = {
    gespeichert: {},
  };
  return {
    gespeichert: zustand.gespeichert,
    get redirectUrl() {
      return "http://localhost/callback";
    },
    get clientMetadata() {
      return {
        client_name: "Test",
        redirect_uris: ["http://localhost/callback"],
        token_endpoint_auth_method: "none",
      };
    },
    clientInformation: () => zustand.client,
    saveClientInformation: (info) => {
      zustand.client = info as { client_id: string };
    },
    tokens: () => zustand.tokens,
    saveTokens: (tokens) => {
      zustand.tokens = tokens as typeof zustand.tokens;
      zustand.gespeichert.tokens = tokens;
    },
    redirectToAuthorization: () => undefined,
    saveCodeVerifier: (v) => {
      zustand.verifier = v;
    },
    codeVerifier: () => zustand.verifier ?? "",
  };
}

describe("Anmeldung (OAuth)", () => {
  it("Erkennung, Registrierung, Code-Tausch und Erneuern gehen über das hineingereichte fetch", async () => {
    const server = await neuerServer("modern");
    server.behavior.oauth = true;
    const { fetch: gezaehlt, calls } = countingFetch(echtesFetch);
    const provider = anmeldung();

    // 1) Der Server verlangt Anmeldung (401): Erkennung der Metadaten und Registrierung.
    await expect(
      createMCPClient({
        transport: { type: "http", url: server.url, fetch: gezaehlt, authProvider: provider },
      }),
    ).rejects.toBeDefined();
    const pfade1 = calls.map((c) => new URL(c.url).pathname);
    expect(pfade1.some((p) => p.startsWith("/.well-known/oauth-protected-resource"))).toBe(true);
    expect(pfade1.some((p) => p.startsWith("/.well-known/oauth-authorization-server"))).toBe(true);
    expect(pfade1).toContain("/register");

    // 2) Code-Tausch (`/token`).
    const ergebnis = await auth(provider, {
      serverUrl: server.url,
      authorizationCode: "code",
      fetchFn: gezaehlt,
    });
    expect(ergebnis).toBe("AUTHORIZED");
    // 3) Erneuern mit gespeichertem Erneuerungs-Zeichen.
    await provider.saveTokens({ access_token: "alt", token_type: "Bearer", refresh_token: "r" });
    await auth(provider, { serverUrl: server.url, fetchFn: gezaehlt });

    expect(calls.filter((c) => new URL(c.url).pathname === "/token").length).toBe(2);
    gleich(calls, server);
    expect(wachterAufrufe).toEqual([]);
  });
});
