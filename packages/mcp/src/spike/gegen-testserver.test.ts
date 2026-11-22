/**
 * PaiBot – Echter Client-Test: Die MCP-Bibliothek spricht mit dem Test-MCP-Server und liest seine
 * Antworten richtig (Entdeckung bzw. `initialize`, Werkzeug-Liste, Aufruf, `isError`, Seiten).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import { createTestMcpServer, type TestMcpServer } from "@paibot/test-mcp-server";
import { afterEach, describe, expect, it } from "vitest";

const geoeffnet: { server: TestMcpServer; client?: MCPClient }[] = [];

afterEach(async () => {
  for (const eintrag of geoeffnet.splice(0)) {
    await eintrag.client?.close().catch(() => undefined);
    await eintrag.server.stop();
  }
});

/** Startet einen Test-Server und verbindet die Bibliothek mit ihm. */
async function verbinde(
  protocol: "modern" | "legacy" | "both",
  verhalten: Parameters<typeof createTestMcpServer>[0] = {},
) {
  const server = createTestMcpServer({ protocol, ...verhalten });
  const eintrag: { server: TestMcpServer; client?: MCPClient } = { server };
  geoeffnet.push(eintrag);
  const { url } = await server.start({ port: 0 });
  const client = await createMCPClient({ transport: { type: "http", url } });
  eintrag.client = client;
  return { server, client };
}

describe.each(["modern", "legacy", "both"] as const)(
  "Bibliothek gegen den Test-Server (%s)",
  (protocol) => {
    const neu = protocol !== "legacy";

    it("verbindet, kennt Namen und Fassung des Servers und die Fähigkeit „tools“", async () => {
      const { server, client } = await verbinde(protocol);
      expect(client.serverInfo).toEqual({ name: "paibot-test-mcp", version: "0.0.0" });
      expect(client.initializeResult.protocolVersion).toBe(neu ? "2026-07-28" : "2025-11-25");
      expect(client.initializeResult.capabilities.tools).toBeDefined();
      const ablauf = server.requests.map((r) => r.rpcMethod).filter(Boolean);
      expect(ablauf[0]).toBe("server/discover");
      if (neu) expect(ablauf).not.toContain("initialize");
      else
        expect(ablauf.slice(0, 3)).toEqual([
          "server/discover",
          "initialize",
          "notifications/initialized",
        ]);
    });

    it("listet die Werkzeuge mit Schema und Hinweisen", async () => {
      const { client } = await verbinde(protocol);
      const liste = await client.listTools();
      expect(liste.tools.map((t) => t.name)).toEqual(["echo", "notiz_anlegen"]);
      const echo = liste.tools[0];
      expect(echo?.description).toBe("Gibt den übergebenen Text zurück.");
      expect(echo?.inputSchema).toMatchObject({
        type: "object",
        properties: { text: { type: "string" } },
      });
      expect(echo?.annotations).toEqual({ readOnlyHint: true });
      expect(liste.tools[1]?.annotations).toBeUndefined();
      expect(liste.nextCursor).toBeUndefined();
    });

    it("ruft ein Werkzeug auf und bekommt den Text zurück", async () => {
      const { server, client } = await verbinde(protocol);
      const ergebnis = await client.callTool({ name: "echo", arguments: { text: "Hallo" } });
      expect(ergebnis.content).toEqual([{ type: "text", text: "Hallo" }]);
      expect(ergebnis.isError).toBeFalsy();
      expect(server.callsOf("echo")).toBe(1);
    });

    it("meldet ein Werkzeug-Fehlerergebnis als normales Ergebnis mit isError", async () => {
      const { client } = await verbinde(protocol, {
        tools: [{ name: "kaputt", answer: { kind: "text", text: "ging schief", isError: true } }],
      });
      const ergebnis = await client.callTool({ name: "kaputt" });
      expect(ergebnis.isError).toBe(true);
      expect(ergebnis.content).toEqual([{ type: "text", text: "ging schief" }]);
    });

    it("liest ein Ergebnis aus dem Ereignis-Strom mit Fortschrittsmeldungen", async () => {
      const { client } = await verbinde(protocol, {
        tools: [{ name: "strom", answer: { kind: "sse", notifications: 2 } }],
      });
      const ergebnis = await client.callTool({ name: "strom" });
      expect(ergebnis.isError).toBeFalsy();
      expect((ergebnis.content as unknown[]).length).toBeGreaterThan(0);
    });

    it("liest Ergebnisse mit Bild, Ton, Verweis und eingebetteter Ressource", async () => {
      const { client } = await verbinde(protocol, {
        tools: [{ name: "medien", answer: { kind: "media" } }],
      });
      const ergebnis = await client.callTool({ name: "medien" });
      expect((ergebnis.content as { type: string }[]).map((c) => c.type)).toEqual([
        "text",
        "image",
        "audio",
        "resource_link",
        "resource",
      ]);
    });

    it("holt die Liste seitenweise über den Cursor", async () => {
      const { server, client } = await verbinde(protocol, {
        tools: [],
        fillerTools: 5,
        pageSize: 2,
      });
      const namen: string[] = [];
      let cursor: string | undefined;
      let seiten = 0;
      do {
        const seite = await client.listTools(cursor ? { params: { cursor } } : undefined);
        namen.push(...seite.tools.map((t) => t.name));
        cursor = seite.nextCursor;
        seiten += 1;
      } while (cursor && seiten < 10);
      expect(namen).toEqual([
        "werkzeug_001",
        "werkzeug_002",
        "werkzeug_003",
        "werkzeug_004",
        "werkzeug_005",
      ]);
      expect(seiten).toBe(3);
      expect(server.count("tools/list")).toBe(3);
    });

    it("meldet eine Rückfrage des Servers ohne Handler als Fehler statt zu hängen", async () => {
      const { client } = await verbinde(protocol, {
        tools: [{ name: "frage", answer: { kind: "inputRequired" } }],
      });
      await expect(client.callTool({ name: "frage", options: { timeout: 8000 } })).rejects.toThrow(
        /input/i,
      );
    }, 15_000);
  },
);

describe("Bibliothek gegen einen Server nur einer Fassung", () => {
  it("fällt bei einem Server nur für die alte Fassung auf initialize zurück", async () => {
    const { server } = await verbinde("legacy");
    expect(server.count("initialize")).toBe(1);
  });

  it("nimmt bei einem Server nur für die neue Fassung keinen initialize-Weg", async () => {
    const { server } = await verbinde("modern");
    expect(server.count("initialize")).toBe(0);
    expect(server.count("server/discover")).toBe(1);
  });
});
