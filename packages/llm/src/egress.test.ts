/**
 * PaiBot – Tests für Basis-URL-Prüfung und Ausgangs-Liste.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { createServer } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { classifyIpAddress } from "./address";
import {
  type BaseUrlProblem,
  checkProviderBaseUrl,
  createEgressFetch,
  EgressBlockedError,
  egressTargetOf,
  INTERNAL_SERVICE_HOSTS,
  providerEgressTarget,
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
  // Abfrage und Anker gehören nicht zur Basis-URL, auch leer nicht
  ["https://api.example.org/v1?mandant=x", "eu", "keine_url"],
  ["https://api.example.org/v1?", "eu", "keine_url"],
  ["https://api.example.org/v1#x", "eu", "keine_url"],
  ["http://127.0.0.1:8080/v1#", "local", "keine_url"],
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
  ["https://192.88.99.1/v1", "eu", "private_adresse"],
  ["https://[2001:10::1]/v1", "eu", "private_adresse"],
  ["https://[2001:20::1]/v1", "eu", "private_adresse"],
  ["https://[2001:2::1]/v1", "eu", "private_adresse"],
  ["https://[3fff::1]/v1", "eu", "private_adresse"],
  ["https://[5f00::1]/v1", "eu", "private_adresse"],
  ["https://[4000::1]/v1", "eu", "private_adresse"],
  // Ports außerhalb von local: nur 443 und 8443
  ["https://api.eurouter.ai:22/v1", "eu", "port"],
  ["https://api.eurouter.ai:5432/v1", "non_eu", "port"],
  ["https://api.eurouter.ai:443/v1", "eu", "ok"],
  ["http://192.168.1.10:5432/v1", "local", "ok"],
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

describe("Adressklassen am Rand", () => {
  it("öffentliche Adressen nahe den gesperrten Bereichen bleiben öffentlich", () => {
    for (const address of [
      "192.88.98.1",
      "192.88.100.1",
      "2001:200::1",
      "2001:4860:4860::8888",
      "3ffe::1",
      "2a00:1450::1",
    ]) {
      expect(classifyIpAddress(address)).toBe("oeffentlich");
    }
    for (const address of ["192.88.99.255", "2001:1ff::1", "2001:db8::1", "3fff:fff::1", "::2"]) {
      expect(classifyIpAddress(address)).toBe("privat");
    }
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

  it("entfernt Authorization bei einer Weiterleitung aus dem Pfad der Basis-URL, auch auf demselben Host", async () => {
    const ziel = [{ ...providerEgressTarget(`${server.origin}/mandant-a/v1`, "local") }];
    expect(ziel[0]?.basePath).toBe("/mandant-a/v1");
    const gesehen: (string | undefined)[] = [];
    server.setHandler((req, res) => {
      if (req.url === "/mandant-a/v1/start")
        return res.writeHead(302, { location: "/mandant-b/v1/x" }).end();
      if (req.url === "/mandant-a/v1/innen")
        return res.writeHead(302, { location: "/mandant-a/v1/y" }).end();
      gesehen.push(req.headers.authorization);
      return json(res, 200, { ok: true });
    });
    const guarded = createEgressFetch(ziel);
    await guarded(`${server.origin}/mandant-a/v1/start`, {
      headers: { authorization: "Bearer abc" },
    });
    await guarded(`${server.origin}/mandant-a/v1/innen`, {
      headers: { authorization: "Bearer abc" },
    });
    expect(gesehen).toEqual([undefined, "Bearer abc"]);
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

  it("verbindet genau mit der geprüften Adresse, auch wenn der Name danach anders auflöst", async () => {
    // Zwei Dienste auf demselben Port, einer davon steht für die Datenbank im eigenen Netz.
    const good = await startTestServer((_req, res) => json(res, 200, { gut: true }));
    const internal = createServer((_req, res) => res.end("intern"));
    let internalHits = 0;
    internal.on("request", () => {
      internalHits++;
    });
    const listened = await new Promise<boolean>((resolve) => {
      internal.once("error", () => resolve(false));
      internal.listen(good.port, "127.0.0.2", () => resolve(true));
    });
    try {
      if (!listened) return; // 127.0.0.2 nicht verfügbar: Test entfällt auf diesem Rechner.
      const calls: string[] = [];
      // Erste Antwort: die geprüfte Adresse; jede weitere: die interne.
      const lookup = async (host: string) => {
        calls.push(host);
        if (host === "postgres") return ["127.0.0.2"];
        return calls.filter((h) => h === host).length === 1 ? ["127.0.0.1"] : ["127.0.0.2"];
      };
      const target = {
        protocol: "http:" as const,
        host: "anbieter.test",
        port: good.port,
        allowPrivate: true,
        denyAddressesOf: ["postgres"],
      };
      const guarded = createEgressFetch([target], undefined, { lookup });
      const response = await guarded(`http://anbieter.test:${good.port}/v1/models`);
      expect(await response.json()).toEqual({ gut: true });
      expect(internalHits).toBe(0);
      expect(calls.filter((h) => h === "anbieter.test")).toHaveLength(1);

      // Der nächste Aufruf löst neu auf, bekommt die interne Adresse und wird gesperrt.
      await expect(guarded(`http://anbieter.test:${good.port}/v1/models`)).rejects.toMatchObject({
        reason: "adresse_nicht_erlaubt",
      });
      expect(internalHits).toBe(0);
    } finally {
      await good.close();
      await new Promise((resolve) => internal.close(resolve));
    }
  });

  it("Adressen der eigenen Dienste sind als Ziel gesperrt, unbekannte Namen sperren nichts", async () => {
    const fake = (async () => new Response("{}")) as unknown as typeof fetch;
    const lookup = async (host: string) => {
      if (host === "postgres") return ["172.18.0.2"];
      if (host === "web") throw new Error("ENOTFOUND");
      if (host === "nas.lan") return ["172.18.0.2"];
      if (host === "ollama.lan") return ["172.18.0.9"];
      return ["192.168.1.5"];
    };
    const target = (host: string) => [
      {
        protocol: "http:" as const,
        host,
        allowPrivate: true,
        denyAddressesOf: ["postgres", "web"],
      },
    ];
    await expect(
      createEgressFetch(target("nas.lan"), fake, { lookup })("http://nas.lan/v1/models"),
    ).rejects.toMatchObject({ reason: "adresse_nicht_erlaubt" });
    await expect(
      createEgressFetch(target("172.18.0.2"), fake, { lookup })("http://172.18.0.2/v1/models"),
    ).rejects.toMatchObject({ reason: "adresse_nicht_erlaubt" });
    const ok = await createEgressFetch(target("ollama.lan"), fake, { lookup })(
      "http://ollama.lan/v1/models",
    );
    expect(ok.ok).toBe(true);
  });

  it("providerEgressTarget sperrt bei local die eigenen Dienste, sonst private Adressen ganz", () => {
    expect(providerEgressTarget("http://192.168.1.5:11434/v1", "local")).toEqual({
      protocol: "http:",
      host: "192.168.1.5",
      port: 11434,
      basePath: "/v1",
      allowPrivate: true,
      denyAddressesOf: INTERNAL_SERVICE_HOSTS,
    });
    expect(providerEgressTarget("https://api.eurouter.ai/v1", "eu")).toEqual({
      protocol: "https:",
      host: "api.eurouter.ai",
      basePath: "/v1",
    });
  });
});
