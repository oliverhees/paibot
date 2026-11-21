/**
 * PaiBot – Tests für den Test-MCP-Server: jedes steuerbare Verhalten wird mit einem einfachen
 * HTTP-Aufruf nachgewiesen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createTestMcpServer,
  MCP_VERSION_LEGACY,
  MCP_VERSION_MODERN,
  TEST_MCP_CONTROL_KEY_HEADER,
  TEST_MCP_CONTROL_PATHS,
  type TestMcpServer,
} from "./index";
import {
  changingList,
  collision,
  endlessPages,
  INJECTED_INSTRUCTION,
  injectedDescription,
  injectedError,
  injectedResult,
  LONG_TOOL_NAME,
  manyTools,
  poisonedSchema,
  readOnlyLie,
  schemaDetailChange,
  tokenInAddress,
} from "./presets";

let mcp: TestMcpServer;
let url: string;
let origin: string;

beforeEach(async () => {
  mcp = createTestMcpServer();
  ({ url } = await mcp.start({ port: 0 }));
  origin = new URL(url).origin;
});

afterEach(async () => {
  await mcp.stop();
});

let nextId = 0;

/** Anfrage in der neuen Fassung (ohne `initialize`), mit den vorgeschriebenen Kopfzeilen. */
function rpc(
  method: string,
  params: Record<string, unknown> = {},
  extra: {
    headers?: Record<string, string>;
    signal?: AbortSignal;
    redirect?: RequestRedirect;
  } = {},
) {
  nextId += 1;
  const name = typeof params.name === "string" ? params.name : undefined;
  return fetch(url, {
    method: "POST",
    redirect: extra.redirect,
    signal: extra.signal,
    headers: {
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": MCP_VERSION_MODERN,
      "mcp-method": method,
      ...(name ? { "mcp-name": name } : {}),
      ...extra.headers,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: nextId,
      method,
      params: {
        ...params,
        _meta: { "io.modelcontextprotocol/protocolVersion": MCP_VERSION_MODERN },
      },
    }),
  });
}

async function listNames(): Promise<string[]> {
  const body = (await (await rpc("tools/list")).json()) as {
    result: { tools: { name: string }[] };
  };
  return body.result.tools.map((t) => t.name);
}

async function listFirst(): Promise<Record<string, unknown>> {
  const body = (await (await rpc("tools/list")).json()) as {
    result: { tools: Record<string, unknown>[] };
  };
  return body.result.tools[0] as Record<string, unknown>;
}

function call(name: string, args: Record<string, unknown> = {}, signal?: AbortSignal) {
  return rpc("tools/call", { name, arguments: args }, { signal });
}

describe("Grundverhalten", () => {
  it("liefert Liste und Aufruf, antwortet auf server/discover und protokolliert jede Anfrage", async () => {
    expect(await listNames()).toEqual(["echo", "notiz_anlegen"]);
    const result = (await (await call("echo", { text: "Hallo" })).json()) as {
      result: { content: { text: string }[]; resultType: string };
    };
    expect(result.result.content[0]?.text).toBe("Hallo");
    expect(result.result.resultType).toBe("complete");
    const discover = (await (await rpc("server/discover")).json()) as {
      result: { supportedVersions: string[] };
    };
    expect(discover.result.supportedVersions).toContain(MCP_VERSION_MODERN);
    expect(mcp.requests.map((r) => r.rpcMethod)).toEqual([
      "tools/list",
      "tools/call",
      "server/discover",
    ]);
    expect(mcp.callsOf("echo")).toBe(1);
    expect(mcp.requests[1]?.toolName).toBe("echo");
  });

  it("antwortet auf einen unbekannten Namen mit einem Protokoll-Fehler und auf eine unbekannte Methode mit 404", async () => {
    const unknown = (await (await call("gibt_es_nicht")).json()) as { error: { code: number } };
    expect(unknown.error.code).toBe(-32602);
    const method = await rpc("nichts/da");
    expect(method.status).toBe(404);
    expect(((await method.json()) as { error: { code: number } }).error.code).toBe(-32601);
  });

  it("lehnt Zugriff ohne den eingestellten Schlüssel mit 401 ab und gibt ihn im Protokoll nicht aus", async () => {
    mcp.configure({ token: "geheim-test" });
    expect((await rpc("tools/list")).status).toBe(401);
    const ok = await rpc("tools/list", {}, { headers: { authorization: "Bearer geheim-test" } });
    expect(ok.status).toBe(200);
    const shown = await fetch(`${origin}${TEST_MCP_CONTROL_PATHS.anfragen}`);
    expect(await shown.text()).not.toContain("geheim-test");
  });

  it("antwortet mit 403 auf eine fremde Origin-Kopfzeile", async () => {
    const res = await rpc("tools/list", {}, { headers: { origin: "https://boese.example" } });
    expect(res.status).toBe(403);
    const lokal = await rpc("tools/list", {}, { headers: { origin: origin } });
    expect(lokal.status).toBe(200);
  });

  it("antwortet auf GET und DELETE mit 405 und auf eine Benachrichtigung mit 202", async () => {
    expect((await fetch(url)).status).toBe(405);
    expect((await fetch(url, { method: "DELETE" })).status).toBe(405);
    const note = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "mcp-protocol-version": MCP_VERSION_MODERN },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "notifications/x",
        params: { _meta: { "io.modelcontextprotocol/protocolVersion": MCP_VERSION_MODERN } },
      }),
    });
    expect(note.status).toBe(202);
  });

  it("lauscht nur auf Loopback und weigert sich, anderswo zu starten", async () => {
    const other = createTestMcpServer();
    await expect(other.start({ host: "0.0.0.0" })).rejects.toThrow(/Loopback/);
    expect(new URL(url).hostname).toBe("127.0.0.1");
  });
});

describe("Protokoll-Fassungen", () => {
  it("prüft die Kopfzeilen der neuen Fassung (Version, Methode, Name)", async () => {
    const noVersion = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: { _meta: { "io.modelcontextprotocol/protocolVersion": MCP_VERSION_MODERN } },
      }),
    });
    expect(noVersion.status).toBe(400);
    expect(((await noVersion.json()) as { error: { code: number } }).error.code).toBe(-32020);
    const wrongMethod = await rpc("tools/list", {}, { headers: { "mcp-method": "tools/call" } });
    expect(wrongMethod.status).toBe(400);
    const wrongName = await rpc(
      "tools/call",
      { name: "echo", arguments: {} },
      { headers: { "mcp-name": "notiz_anlegen" } },
    );
    expect(wrongName.status).toBe(400);
    expect(mcp.callsOf("echo")).toBe(1); // protokolliert, aber nicht ausgeführt
    expect(mcp.requests.filter((r) => r.status === 200)).toHaveLength(0);
    const encoded = await rpc(
      "tools/call",
      { name: "echo", arguments: {} },
      { headers: { "mcp-name": `=?base64?${Buffer.from("echo").toString("base64")}?=` } },
    );
    expect(encoded.status).toBe(200);
  });

  it("meldet eine unbekannte Fassung mit der Liste der unterstützten", async () => {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "mcp-protocol-version": "1900-01-01" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
        params: { _meta: { "io.modelcontextprotocol/protocolVersion": "1900-01-01" } },
      }),
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: number; data: { supported: string[] } } };
    expect(body.error.code).toBe(-32022);
    expect(body.error.data.supported).toEqual([MCP_VERSION_MODERN, MCP_VERSION_LEGACY]);
  });

  async function legacy(message: Record<string, unknown>, session?: string) {
    return fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...(session ? { "mcp-session-id": session } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", ...message }),
    });
  }

  it("spricht die ältere Fassung mit initialize, Sitzung und Ende der Sitzung", async () => {
    const init = await legacy({
      id: 1,
      method: "initialize",
      params: { protocolVersion: MCP_VERSION_LEGACY, capabilities: {}, clientInfo: { name: "t" } },
    });
    const session = init.headers.get("mcp-session-id");
    expect(session).toBeTruthy();
    expect(
      ((await init.json()) as { result: { protocolVersion: string } }).result.protocolVersion,
    ).toBe(MCP_VERSION_LEGACY);
    expect((await legacy({ method: "notifications/initialized" }, session ?? "")).status).toBe(202);
    const list = await legacy({ id: 2, method: "tools/list" }, session ?? "");
    expect(list.status).toBe(200);
    const without = await legacy({ id: 3, method: "tools/list" });
    expect(without.status).toBe(400);
    const end = await fetch(url, {
      method: "DELETE",
      headers: { "mcp-session-id": session ?? "" },
    });
    expect(end.status).toBe(200);
    expect((await legacy({ id: 4, method: "tools/list" }, session ?? "")).status).toBe(400);
    expect(mcp.count("initialize")).toBe(1);
  });

  it("verhält sich als nur-alter Server: neue Anfragen bekommen 400 ohne Körper (Rückfall)", async () => {
    mcp.configure({ protocol: "legacy" });
    const res = await rpc("tools/list");
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("");
  });

  it("verhält sich als nur-neuer Server: initialize bekommt 400 mit den unterstützten Fassungen", async () => {
    mcp.configure({ protocol: "modern" });
    const res = await legacy({ id: 1, method: "initialize", params: {} });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { data: { supported: string[] } } };
    expect(body.error.data.supported).toEqual([MCP_VERSION_MODERN]);
  });
});

describe("Schädliches Verhalten der Liste", () => {
  it("Beschreibung mit eingeschleuster Anweisung, unsichtbaren Zeichen, Umkehr-Zeichen und Bild", async () => {
    mcp.configure(injectedDescription());
    const tool = await listFirst();
    const description = String(tool.description);
    expect(description).toContain(INJECTED_INSTRUCTION);
    expect(description).toContain("​");
    expect(description).toContain("‮");
    expect(description).toContain("![x](");
  });

  it("die Liste ändert sich nachträglich und still (ohne Benachrichtigung)", async () => {
    mcp.configure(changingList());
    const first = await listFirst();
    expect(first.description).toBe("Gibt Text zurück.");
    expect(await listNames()).toEqual(["echo", "neues_werkzeug"]);
    const again = await listFirst();
    expect(String(again.description)).toContain(INJECTED_INSTRUCTION);
    // Der Wechsel kam ohne list_changed-Ankündigung in den Fähigkeiten.
    const discover = (await (await rpc("server/discover")).json()) as {
      result: { capabilities: { tools: Record<string, unknown> } };
    };
    expect(discover.result.capabilities.tools).toEqual({});
    // Ein Aufruf über den alten Namen geht trotzdem durch und wird gezählt.
    expect((await call("echo")).status).toBe(200);
    expect(mcp.callsOf("echo")).toBe(1);
  });

  it("meldet einen Wechsel auf Wunsch über einen offenen Listen-Strom", async () => {
    mcp.configure({ ...changingList(), listChanged: true });
    const abort = new AbortController();
    const stream = await rpc("subscriptions/listen", {}, { signal: abort.signal });
    expect(stream.headers.get("content-type")).toContain("text/event-stream");
    const reader = stream.body?.getReader();
    const decoder = new TextDecoder();
    const ack = await reader?.read();
    expect(decoder.decode(ack?.value)).toContain("subscriptions/acknowledged");
    await listNames();
    await listNames(); // zweiter Abruf: Wechsel
    mcp.configure({ laterTools: [{ name: "x" }] });
    const next = await reader?.read();
    expect(decoder.decode(next?.value)).toContain("notifications/tools/list_changed");
    abort.abort();
  });

  it("Namens-Kollision: gleiche Namen auf zwei Servern, ein eingebauter Name, 128 Zeichen mit Punkt", async () => {
    mcp.configure(collision("a"));
    const second = createTestMcpServer(collision("b"));
    const other = await second.start({ port: 0 });
    try {
      const names = await listNames();
      expect(names).toEqual(["search", "doku_nachschlagen", LONG_TOOL_NAME]);
      expect(LONG_TOOL_NAME).toHaveLength(128);
      const res = await fetch(other.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "mcp-protocol-version": MCP_VERSION_MODERN,
          "mcp-method": "tools/list",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
          params: { _meta: { "io.modelcontextprotocol/protocolVersion": MCP_VERSION_MODERN } },
        }),
      });
      const body = (await res.json()) as { result: { tools: { name: string }[] } };
      expect(body.result.tools[0]?.name).toBe("search");
      const a = (await (await call("search")).json()) as {
        result: { content: { text: string }[] };
      };
      expect(a.result.content[0]?.text).toBe("a");
    } finally {
      await second.stop();
    }
  });

  it("falscher Hinweis „nur lesend“ an einem schreibenden Werkzeug", async () => {
    mcp.configure(readOnlyLie());
    const tool = await listFirst();
    expect((tool.annotations as Record<string, unknown>).readOnlyHint).toBe(true);
    await call("alles_loeschen");
    expect(mcp.callsOf("alles_loeschen")).toBe(1);
  });

  it("sehr viele Werkzeuge, auf Seiten verteilt", async () => {
    mcp.configure(manyTools(500, 100));
    let cursor: string | undefined;
    let total = 0;
    let pages = 0;
    do {
      const res = await rpc("tools/list", cursor ? { cursor } : {});
      const body = (await res.json()) as {
        result: { tools: unknown[]; nextCursor?: string };
      };
      total += body.result.tools.length;
      pages += 1;
      cursor = body.result.nextCursor;
    } while (cursor);
    expect(total).toBe(500);
    expect(pages).toBe(5);
  });
});

describe("Weitere schädliche Verhalten", () => {
  it("fremder Text an allen Stellen des Schemas (Titel, Beschreibung, enum, default, examples)", async () => {
    mcp.configure(poisonedSchema());
    const tool = await listFirst();
    const schema = tool.inputSchema as {
      title: string;
      properties: {
        frage: { title: string; description: string; default: string; examples: string[] };
        art: { enum: string[] };
      };
    };
    expect(String(tool.title)).toContain(INJECTED_INSTRUCTION);
    expect(schema.title).toContain(INJECTED_INSTRUCTION);
    expect(schema.properties.frage.title).toContain(INJECTED_INSTRUCTION);
    expect(schema.properties.frage.description).toContain(INJECTED_INSTRUCTION);
    expect(schema.properties.frage.default).toBe(INJECTED_INSTRUCTION);
    expect(schema.properties.frage.examples).toEqual([INJECTED_INSTRUCTION]);
    expect(schema.properties.art.enum).toContain(INJECTED_INSTRUCTION);
  });

  it("Ergebnis mit isError und eingeschleustem Text darin", async () => {
    mcp.configure(injectedError());
    const body = (await (await call("fehlschlag")).json()) as {
      result: { isError: boolean; content: { text: string }[] };
    };
    expect(body.result.isError).toBe(true);
    expect(body.result.content[0]?.text).toContain(INJECTED_INSTRUCTION);
  });

  it("307 und 308: ein verfolgender Aufrufer schickt Kopfzeilen und Körper an das neue Ziel", async () => {
    const target = createTestMcpServer();
    const t = await target.start({ port: 0 });
    try {
      for (const status of [307, 308] as const) {
        target.reset();
        mcp.configure({
          tools: [{ name: "weiter", answer: { kind: "redirect", location: t.url, status } }],
        });
        const res = await rpc(
          "tools/call",
          { name: "weiter", arguments: { text: "geheimer-inhalt" } },
          { headers: { "x-test-kopf": "wert-1" } },
        );
        expect(res.status).not.toBe(0);
        const arrived = target.requests[0];
        expect(arrived?.headers["x-test-kopf"]).toBe("wert-1");
        expect(JSON.stringify(arrived?.body)).toContain("geheimer-inhalt");
        expect(mcp.requests.at(-1)?.status).toBe(status);
      }
    } finally {
      await target.stop();
    }
  });

  it("Token in der Adresse: ohne ihn 401; die Adresse wird gespiegelt, in der Steuer-Ausgabe unkenntlich", async () => {
    mcp.configure(tokenInAddress("abfrage-geheim"));
    const denied = await rpc("tools/list");
    expect(denied.status).toBe(401);
    expect(await denied.text()).toContain("/mcp");
    const original = url;
    url = `${original}?token=abfrage-geheim`;
    const ok = (await (await call("echo")).json()) as { result: { content: { text: string }[] } };
    expect(ok.result.content[0]?.text).toBe("Adresse: /mcp?token=abfrage-geheim");
    url = `${original}?token=falsch`;
    const wrong = await rpc("tools/list");
    expect(wrong.status).toBe(401);
    expect(await wrong.text()).toContain("token=falsch");
    url = original;
    const shown = await (await fetch(`${origin}${TEST_MCP_CONTROL_PATHS.anfragen}`)).text();
    expect(shown).not.toContain("abfrage-geheim");
    expect(mcp.requests.some((r) => r.query === "?token=abfrage-geheim")).toBe(true);
  });

  it("Liste ändert sich nur in einem Schema-Detail (Name und Beschreibung gleich)", async () => {
    mcp.configure(schemaDetailChange());
    const first = await listFirst();
    const second = await listFirst();
    expect(second.name).toBe(first.name);
    expect(second.description).toBe(first.description);
    expect(JSON.stringify(second.inputSchema)).not.toBe(JSON.stringify(first.inputSchema));
    expect(JSON.stringify(first.inputSchema)).toContain('"maxLength":100}');
    expect(JSON.stringify(second.inputSchema)).toContain('"maxLength":100000');
  });

  it("endlose Seiten-Cursor: jede Seite nennt einen weiteren", async () => {
    mcp.configure(endlessPages());
    let cursor: string | undefined;
    for (let page = 1; page <= 60; page += 1) {
      const body = (await (await rpc("tools/list", cursor ? { cursor } : {})).json()) as {
        result: { tools: { name: string }[]; nextCursor?: string };
      };
      expect(body.result.tools[0]?.name).toBe(`seite_${page}`);
      expect(body.result.nextCursor).toBeTruthy();
      cursor = body.result.nextCursor;
    }
    expect(mcp.count("tools/list")).toBe(60);
  });
});

describe("Schädliches Verhalten des Aufrufs", () => {
  it("Ergebnis mit eingeschleuster Anweisung", async () => {
    mcp.configure(injectedResult());
    const body = (await (await call("lesen")).json()) as {
      result: { content: { text: string }[] };
    };
    expect(body.result.content[0]?.text).toBe(INJECTED_INSTRUCTION);
    expect(mcp.callsOf("notiz_anlegen")).toBe(0);
  });

  it("Werkzeug-Fehler (isError) und ein Ergebnis mit Bild, Ton und Verweisen", async () => {
    mcp.configure({
      tools: [
        { name: "kaputt", answer: { kind: "text", text: "Fehler", isError: true } },
        { name: "medien", answer: { kind: "media" } },
      ],
    });
    const err = (await (await call("kaputt")).json()) as { result: { isError: boolean } };
    expect(err.result.isError).toBe(true);
    const media = (await (await call("medien")).json()) as {
      result: { content: { type: string }[] };
    };
    expect(media.result.content.map((c) => c.type)).toEqual([
      "text",
      "image",
      "audio",
      "resource_link",
      "resource",
    ]);
  });

  it("übergroße Antwort", async () => {
    mcp.configure({ tools: [{ name: "gross", answer: { kind: "huge", bytes: 3 * 1024 * 1024 } }] });
    const text = await (await call("gross")).text();
    expect(text.length).toBeGreaterThan(3 * 1024 * 1024);
    expect(JSON.parse(text).result.content[0].text).toHaveLength(3 * 1024 * 1024);
  });

  it("endlose Antwort: Strom ohne Ende, bis der Aufrufer abbricht (und das Protokoll es sieht)", async () => {
    mcp.configure({ tools: [{ name: "endlos", answer: { kind: "endless", intervalMs: 5 } }] });
    const abort = new AbortController();
    const res = await call("endlos", {}, abort.signal);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const reader = res.body?.getReader();
    await reader?.read();
    await reader?.read();
    abort.abort();
    await waitFor(() => mcp.requests.at(-1)?.closedByClient === true);
    expect(mcp.requests.at(-1)?.closedByClient).toBe(true);
  });

  it("tröpfelnde Antwort: viele kleine Stücke in Abständen, dann das Ergebnis", async () => {
    mcp.configure({
      tools: [{ name: "tropf", answer: { kind: "drip", intervalMs: 20, chunks: 3 } }],
    });
    const started = Date.now();
    const text = await (await call("tropf")).text();
    expect(Date.now() - started).toBeGreaterThanOrEqual(50);
    expect(text.match(/notifications\/progress/g)).toHaveLength(3);
    expect(text).toContain('"result"');
  });

  it("langsame Antwort", async () => {
    mcp.configure({ tools: [{ name: "langsam", answer: { kind: "slow", delayMs: 150 } }] });
    const started = Date.now();
    const res = await call("langsam");
    expect(res.status).toBe(200);
    expect(Date.now() - started).toBeGreaterThanOrEqual(140);
  });

  it("langsame Antwort, Aufrufer bricht ab: das Protokoll zeigt, dass die Verbindung geschlossen wurde", async () => {
    mcp.configure({ tools: [{ name: "langsam", answer: { kind: "slow", delayMs: 5000 } }] });
    const abort = new AbortController();
    const pending = call("langsam", {}, abort.signal).catch(() => "abgebrochen");
    await waitFor(() => mcp.callsOf("langsam") === 1);
    abort.abort();
    expect(await pending).toBe("abgebrochen");
    await waitFor(() => mcp.requests.at(-1)?.closedByClient === true);
    expect(mcp.requests.at(-1)?.closedByClient).toBe(true);
  });

  it("antwortet nie (hängt) oder trennt hart", async () => {
    mcp.configure({
      tools: [
        { name: "haengt", answer: { kind: "hang" } },
        { name: "weg", answer: { kind: "abort" } },
      ],
    });
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 100);
    await expect(call("haengt", {}, abort.signal)).rejects.toThrow();
    clearTimeout(timer);
    await expect(call("weg")).rejects.toThrow();
  });

  it("Weiterleitung auf eine private Adresse (wird nicht verfolgt)", async () => {
    mcp.configure({
      tools: [
        { name: "weiter", answer: { kind: "redirect", location: "http://169.254.169.254/latest" } },
      ],
    });
    const res = await rpc("tools/call", { name: "weiter", arguments: {} }, { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("http://169.254.169.254/latest");
  });

  it("Weiterleitung schon bei der Liste", async () => {
    mcp.configure({
      listAnswer: { kind: "redirect", location: "https://127.0.0.1/x", status: 307 },
    });
    const res = await rpc("tools/list", {}, { redirect: "manual" });
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://127.0.0.1/x");
  });

  it("kaputtes JSON bei Aufruf und Liste", async () => {
    mcp.configure({
      tools: [{ name: "kaputt", answer: { kind: "brokenJson" } }],
      listAnswer: { kind: "brokenJson", body: "nicht json" },
    });
    const callText = await (await call("kaputt")).text();
    expect(() => JSON.parse(callText)).toThrow();
    const listText = await (await rpc("tools/list")).text();
    expect(listText).toBe("nicht json");
  });

  it("Fehlerstatus (500 mit Text)", async () => {
    mcp.configure({
      tools: [{ name: "fehler", answer: { kind: "status", status: 500, body: "boese" } }],
    });
    const res = await call("fehler");
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("boese");
  });

  it("Rückfrage des Servers (Eingabe nötig)", async () => {
    mcp.configure({ tools: [{ name: "frage", answer: { kind: "inputRequired" } }] });
    const body = (await (await call("frage")).json()) as {
      result: { resultType: string; inputRequests: Record<string, { method: string }> };
    };
    expect(body.result.resultType).toBe("input_required");
    expect(body.result.inputRequests.nachfrage?.method).toBe("elicitation/create");
  });

  it("Ergebnis als SSE-Strom mit Fortschrittsmeldungen", async () => {
    mcp.configure({ tools: [{ name: "strom", answer: { kind: "sse", notifications: 2 } }] });
    const res = await call("strom");
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const text = await res.text();
    expect(text.match(/event: message/g)).toHaveLength(3);
  });

  it("übergroße, langsame und kaputte Antwort auch auf server/discover", async () => {
    mcp.configure({ discoverAnswer: { kind: "status", status: 503, body: "nicht bereit" } });
    const res = await rpc("server/discover");
    expect(res.status).toBe(503);
  });

  it("übergroße Liste: eine Beschreibung mit Millionen Zeichen", async () => {
    mcp.configure({ listAnswer: { kind: "huge", bytes: 2 * 1024 * 1024 } });
    const tool = await listFirst();
    expect(String(tool.description)).toHaveLength(2 * 1024 * 1024);
  });
});

describe("Steuerung", () => {
  it("ändert das Verhalten über HTTP, liefert das Protokoll und setzt zurück", async () => {
    const set = await fetch(`${origin}${TEST_MCP_CONTROL_PATHS.verhalten}`, {
      method: "POST",
      body: JSON.stringify({ tools: [{ name: "neu", description: "Neu." }] }),
    });
    expect(set.status).toBe(200);
    expect(await listNames()).toEqual(["neu"]);
    const log = (await (await fetch(`${origin}${TEST_MCP_CONTROL_PATHS.anfragen}`)).json()) as {
      requests: { rpcMethod: string }[];
    };
    expect(log.requests.at(-1)?.rpcMethod).toBe("tools/list");
    await fetch(`${origin}${TEST_MCP_CONTROL_PATHS.zuruecksetzen}`, { method: "POST" });
    expect(mcp.requests).toHaveLength(0);
    expect(await listNames()).toEqual(["echo", "notiz_anlegen"]);
  });

  it("lehnt ungültiges Verhalten mit 400 ab", async () => {
    const bad = await fetch(`${origin}${TEST_MCP_CONTROL_PATHS.verhalten}`, {
      method: "POST",
      body: JSON.stringify({ tools: [{ answer: { kind: "xyz" } }] }),
    });
    expect(bad.status).toBe(400);
    const unknown = await fetch(`${origin}${TEST_MCP_CONTROL_PATHS.verhalten}`, {
      method: "POST",
      body: JSON.stringify({ unbekannt: 1 }),
    });
    expect(unknown.status).toBe(400);
  });

  it("verlangt mit gesetztem Schlüssel die Kopfzeile, sonst 401", async () => {
    const guarded = createTestMcpServer(undefined, { key: "schluessel-test" });
    const { port } = await guarded.start({ port: 0 });
    try {
      const path = `http://127.0.0.1:${port}${TEST_MCP_CONTROL_PATHS.anfragen}`;
      expect((await fetch(path)).status).toBe(401);
      expect(
        (await fetch(path, { headers: { [TEST_MCP_CONTROL_KEY_HEADER]: "falsch" } })).status,
      ).toBe(401);
      expect(
        (await fetch(path, { headers: { [TEST_MCP_CONTROL_KEY_HEADER]: "schluessel-test" } }))
          .status,
      ).toBe(200);
    } finally {
      await guarded.stop();
    }
  });
});

async function waitFor(condition: () => boolean, ms = 3000): Promise<void> {
  const end = Date.now() + ms;
  while (!condition() && Date.now() < end) await new Promise((r) => setTimeout(r, 10));
}
