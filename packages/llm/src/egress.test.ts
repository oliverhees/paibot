/**
 * PaiBot – Tests für Basis-URL-Prüfung und Ausgangs-Liste.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { classifyIpAddress } from "./address";
import {
  type BaseUrlProblem,
  checkProviderBaseUrl,
  createEgressFetch,
  EgressBlockedError,
  egressTargetOf,
} from "./egress";
import { json, startTestServer, type TestServer } from "./test-server";

type Row = [url: string, region: "eu" | "non_eu" | "local", problem: BaseUrlProblem | "ok"];

const TABLE: Row[] = [
  // erlaubt
  ["https://api.eurouter.ai/v1", "eu", "ok"],
  ["https://models.example.org:8443/v1", "non_eu", "ok"],
  ["https://93.184.216.34/v1", "eu", "ok"],
  ["https://[2606:4700:4700::1111]/v1", "eu", "ok"],
  // Protokoll und Form
  ["http://api.eurouter.ai/v1", "eu", "protokoll"],
  ["ftp://api.example.org/v1", "eu", "protokoll"],
  ["file:///etc/passwd", "local", "protokoll"],
  ["javascript:alert(1)", "eu", "protokoll"],
  ["api.example.org/v1", "eu", "keine_url"],
  ["", "eu", "keine_url"],
  ["https://user:pass@api.example.org/v1", "eu", "zugangsdaten_in_url"],
  ["https://token@api.example.org/v1", "local", "zugangsdaten_in_url"],
  // interne Dienste
  ["https://postgres/v1", "eu", "interner_dienst"],
  ["http://datenschleuse:4000/v1", "local", "interner_dienst"],
  ["https://WEB/v1", "eu", "interner_dienst"],
  ["https://worker./v1", "eu", "interner_dienst"],
  // Link-Local und Metadaten, auch bei Region local
  ["https://169.254.169.254/latest/meta-data", "eu", "link_local"],
  ["http://169.254.169.254/", "local", "link_local"],
  ["http://169.254.1.1/", "local", "link_local"],
  ["https://[fe80::1]/v1", "eu", "link_local"],
  ["http://[fe80::1]/v1", "local", "link_local"],
  ["http://[fd00:ec2::254]/", "local", "link_local"],
  ["http://metadata.google.internal/", "local", "link_local"],
  ["http://100.100.100.200/", "local", "link_local"],
  ["http://168.63.129.16/", "local", "link_local"],
  // Schreibweisen: dezimal, hexadezimal, oktal, gekürzt
  ["http://2852039166/", "local", "link_local"],
  ["http://0xA9FEA9FE/", "local", "link_local"],
  ["http://0251.0376.0251.0376/", "local", "link_local"],
  ["http://169.254.43518/", "local", "link_local"],
  ["https://2130706433/v1", "eu", "private_adresse"],
  ["https://0x7f000001/v1", "eu", "private_adresse"],
  ["https://0x7f.0.0.1/v1", "eu", "private_adresse"],
  ["https://017700000001/v1", "eu", "private_adresse"],
  ["https://127.1/v1", "eu", "private_adresse"],
  ["https://0/v1", "eu", "private_adresse"],
  // Loopback und private Netze
  ["https://127.0.0.1/v1", "eu", "private_adresse"],
  ["https://127.255.255.254/v1", "non_eu", "private_adresse"],
  ["https://localhost/v1", "eu", "private_adresse"],
  ["https://LOCALHOST./v1", "eu", "private_adresse"],
  ["https://api.localhost/v1", "eu", "private_adresse"],
  ["https://10.0.0.5/v1", "eu", "private_adresse"],
  ["https://172.16.0.1/v1", "eu", "private_adresse"],
  ["https://172.31.255.255/v1", "eu", "private_adresse"],
  ["https://192.168.1.10/v1", "eu", "private_adresse"],
  ["https://100.64.0.1/v1", "eu", "private_adresse"],
  ["https://0.0.0.0/v1", "eu", "private_adresse"],
  ["https://224.0.0.1/v1", "eu", "private_adresse"],
  ["https://nas.local/v1", "eu", "private_adresse"],
  ["https://ollama/v1", "eu", "private_adresse"],
  ["https://db.internal/v1", "eu", "private_adresse"],
  // IPv6-Formen
  ["https://[::1]/v1", "eu", "private_adresse"],
  ["https://[::]/v1", "eu", "private_adresse"],
  ["https://[0:0:0:0:0:0:0:1]/v1", "eu", "private_adresse"],
  ["https://[fc00::1]/v1", "eu", "private_adresse"],
  ["https://[fd12:3456::1]/v1", "eu", "private_adresse"],
  ["https://[::ffff:127.0.0.1]/v1", "eu", "private_adresse"],
  ["https://[::ffff:7f00:1]/v1", "eu", "private_adresse"],
  ["https://[::ffff:10.1.2.3]/v1", "eu", "private_adresse"],
  ["https://[::ffff:a9fe:a9fe]/v1", "eu", "link_local"],
  ["https://[::ffff:169.254.169.254]/v1", "eu", "link_local"],
  ["https://[::127.0.0.1]/v1", "eu", "private_adresse"],
  ["https://[64:ff9b::7f00:1]/v1", "eu", "private_adresse"],
  ["https://[64:ff9b::a9fe:a9fe]/v1", "eu", "link_local"],
  ["https://[2002:7f00:1::1]/v1", "eu", "private_adresse"],
  ["https://[ff02::1]/v1", "eu", "private_adresse"],
  // Region local: privat und http erlaubt
  ["http://localhost:11434/v1", "local", "ok"],
  ["http://127.0.0.1:11434/v1", "local", "ok"],
  ["http://[::1]:11434/v1", "local", "ok"],
  ["http://192.168.1.10:8080/v1", "local", "ok"],
  ["http://2130706433:8080/v1", "local", "ok"],
  ["http://ollama:11434/v1", "local", "ok"],
  ["https://nas.local/v1", "local", "ok"],
];

describe("checkProviderBaseUrl", () => {
  for (const [url, region, expected] of TABLE) {
    it(`${region} ${url} → ${expected}`, () => {
      const result = checkProviderBaseUrl(url, region);
      if (expected === "ok") expect(result.ok).toBe(true);
      else expect(result).toEqual({ ok: false, problem: expected });
    });
  }

  it("lehnt Text ohne Zeichenkette und überlange URLs ab", () => {
    expect(checkProviderBaseUrl(undefined as unknown as string, "eu").ok).toBe(false);
    expect(checkProviderBaseUrl(`https://a.example.org/${"x".repeat(3000)}`, "eu").ok).toBe(false);
  });
});

describe("classifyIpAddress", () => {
  it("ordnet Adressen ein", () => {
    expect(classifyIpAddress("8.8.8.8")).toBe("oeffentlich");
    expect(classifyIpAddress("2606:4700::1111")).toBe("oeffentlich");
    expect(classifyIpAddress("::ffff:8.8.8.8")).toBe("oeffentlich");
    expect(classifyIpAddress("fe80::1%eth0")).toBe("link_local");
    expect(classifyIpAddress("10.1.1.1")).toBe("privat");
    expect(classifyIpAddress("kein-ip")).toBe("privat");
  });
});

describe("egressTargetOf", () => {
  it("normalisiert Host und Port", () => {
    expect(egressTargetOf("https://API.Example.org./v1")).toEqual({
      protocol: "https:",
      host: "api.example.org",
    });
    expect(egressTargetOf("http://127.0.0.1:4000/v1")).toEqual({
      protocol: "http:",
      host: "127.0.0.1",
      port: 4000,
    });
    expect(() => egressTargetOf("kaputt")).toThrow(TypeError);
    expect(() => egressTargetOf("ftp://x.example.org")).toThrow(TypeError);
  });
});

describe("createEgressFetch", () => {
  let server: TestServer;
  let other: TestServer;
  beforeAll(async () => {
    server = await startTestServer((_req, res) => json(res, 200, { ok: true }));
    other = await startTestServer((_req, res) => json(res, 200, { other: true }));
  });
  afterAll(async () => {
    await server.close();
    await other.close();
  });

  const allow = () => [{ ...egressTargetOf(server.origin), allowPrivate: true }];

  it("lässt das erlaubte Ziel durch", async () => {
    const response = await createEgressFetch(allow())(`${server.origin}/v1/models`);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("blockiert fremde Hosts und Ports, bevor etwas gesendet wird, und meldet sie", async () => {
    const blocked: string[] = [];
    const guarded = createEgressFetch(allow(), undefined, {
      onBlocked: (target) => blocked.push(target),
    });
    server.requests.length = 0;
    other.requests.length = 0;
    const attempts = [
      `${other.origin}/v1/models`, // anderer Port
      "https://example.org/x?key=geheim",
      "http://169.254.169.254/latest/meta-data",
      "https://user:pw@127.0.0.1/",
    ];
    for (const url of attempts) {
      await expect(guarded(url)).rejects.toBeInstanceOf(EgressBlockedError);
    }
    expect(other.requests).toHaveLength(0);
    expect(blocked).toHaveLength(attempts.length);
    // Ziel ohne Pfad und Abfrage
    expect(blocked[1]).toBe("https://example.org:443");
    expect(blocked.join(" ")).not.toContain("geheim");
    expect(blocked.join(" ")).not.toContain("pw");
  });

  it("blockiert auch ein Request-Objekt an ein fremdes Ziel", async () => {
    const guarded = createEgressFetch(allow());
    await expect(
      guarded(new Request("https://example.org/", { method: "POST", body: "x" })),
    ).rejects.toBeInstanceOf(EgressBlockedError);
  });

  it("Protokoll muss passen", async () => {
    const guarded = createEgressFetch([
      { protocol: "https:", host: "127.0.0.1", port: server.port, allowPrivate: true },
    ]);
    await expect(guarded(`${server.origin}/`)).rejects.toBeInstanceOf(EgressBlockedError);
  });

  it("Weiterleitung auf eine interne Adresse wird blockiert", async () => {
    const guarded = createEgressFetch(allow());
    for (const location of [
      "http://169.254.169.254/latest/meta-data",
      "http://127.0.0.1:1/",
      "http://[::1]/",
      `${other.origin}/v1/models`,
    ]) {
      server.setHandler((_req, res) => res.writeHead(302, { location }).end());
      server.requests.length = 0;
      other.requests.length = 0;
      const error = await guarded(`${server.origin}/v1/models`).catch((e: unknown) => e);
      expect(error).toBeInstanceOf(EgressBlockedError);
      expect((error as EgressBlockedError).reason).toBe("weiterleitung");
      expect(other.requests).toHaveLength(0);
    }
    server.setHandler((_req, res) => json(res, 200, { ok: true }));
  });

  it("folgt einer Weiterleitung innerhalb des erlaubten Ziels, höchstens fünfmal", async () => {
    const guarded = createEgressFetch(allow());
    server.setHandler((req, res) => {
      if (req.url === "/ziel") return json(res, 200, { ziel: true });
      res.writeHead(307, { location: "/ziel" }).end();
    });
    const ok = await guarded(`${server.origin}/start`, { method: "POST", body: "{}" });
    expect(await ok.json()).toEqual({ ziel: true });

    server.setHandler((_req, res) => res.writeHead(302, { location: "/schleife" }).end());
    await expect(guarded(`${server.origin}/schleife`)).rejects.toThrow();
    server.setHandler((_req, res) => json(res, 200, { ok: true }));
  });

  it("entfernt Authorization bei Wechsel des Ziels", async () => {
    const both = [
      { ...egressTargetOf(server.origin), allowPrivate: true },
      { ...egressTargetOf(other.origin), allowPrivate: true },
    ];
    server.setHandler((_req, res) => res.writeHead(302, { location: `${other.origin}/x` }).end());
    other.requests.length = 0;
    await createEgressFetch(both)(`${server.origin}/`, {
      headers: { authorization: "Bearer abc" },
    });
    expect(other.requests[0]?.headers.authorization).toBeUndefined();
    server.setHandler((_req, res) => json(res, 200, { ok: true }));
  });

  it("prüft Namen nach der Auflösung", async () => {
    const calls: string[] = [];
    const fake = (async () => new Response("{}")) as unknown as typeof fetch;
    const lookupTo = (addresses: string[]) => async (host: string) => {
      calls.push(host);
      return addresses;
    };
    const target = [{ protocol: "https:", host: "api.example.org" }] as const;

    for (const addresses of [
      ["127.0.0.1"],
      ["10.0.0.7"],
      ["169.254.169.254"],
      ["::1"],
      ["::ffff:192.168.0.1"],
      ["93.184.216.34", "10.0.0.7"], // eine schlechte Adresse genügt
      [],
    ]) {
      const guarded = createEgressFetch(target, fake, { lookup: lookupTo(addresses) });
      await expect(guarded("https://api.example.org/v1/models")).rejects.toBeInstanceOf(
        EgressBlockedError,
      );
    }
    const good = createEgressFetch(target, fake, { lookup: lookupTo(["93.184.216.34"]) });
    expect((await good("https://api.example.org/v1/models")).ok).toBe(true);
    expect(calls.every((host) => host === "api.example.org")).toBe(true);
  });

  it("allowPrivate erlaubt private, aber nie Link-Local-Adressen", async () => {
    const fake = (async () => new Response("{}")) as unknown as typeof fetch;
    const target = [{ protocol: "http:", host: "nas.lan", allowPrivate: true }] as const;
    const privat = createEgressFetch(target, fake, { lookup: async () => ["192.168.1.5"] });
    expect((await privat("http://nas.lan/v1/models")).ok).toBe(true);
    const meta = createEgressFetch(target, fake, { lookup: async () => ["169.254.169.254"] });
    await expect(meta("http://nas.lan/v1/models")).rejects.toBeInstanceOf(EgressBlockedError);
  });

  it("nicht auflösbarer Name wirkt wie ein Netzfehler", async () => {
    const guarded = createEgressFetch(
      [{ protocol: "https:", host: "gibt-es-nicht.example.org" }],
      undefined,
      {
        lookup: async () => {
          throw new Error("ENOTFOUND");
        },
      },
    );
    await expect(guarded("https://gibt-es-nicht.example.org/")).rejects.toThrow("fetch failed");
  });
});
