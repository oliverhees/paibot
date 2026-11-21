/**
 * PaiBot – Tests für Anfragen an festgenagelte Adressen: Strom, Abbruch, Entpacken, TLS, Proxy.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer as createHttpServer, type Server } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mapProviderError } from "./errors";
import { pinnedFetch } from "./pinned-fetch";

function listen(server: Server, host = "127.0.0.1"): Promise<number> {
  return new Promise((resolve) =>
    server.listen(0, host, () => resolve((server.address() as AddressInfo).port)),
  );
}

function close(server: Server): Promise<void> {
  server.closeAllConnections();
  return new Promise((resolve) => server.close(() => resolve()));
}

const get = (url: string, init: Partial<Parameters<typeof pinnedFetch>[0]> = {}) => ({
  url: new URL(url),
  method: "GET",
  headers: new Headers(),
  ...init,
});

describe("pinnedFetch", () => {
  let server: Server;
  let port: number;
  const seen: Array<{ host?: string; method?: string; body: string; headers: object }> = [];

  beforeAll(async () => {
    server = createHttpServer((req, res) => {
      let body = "";
      req.on("data", (c) => {
        body += c;
      });
      req.on("end", () => {
        seen.push({ host: req.headers.host, method: req.method, body, headers: req.headers });
        const path = req.url ?? "/";
        if (path === "/strom") {
          res.writeHead(200, { "content-type": "text/event-stream" });
          res.write("data: eins\n\n");
          setTimeout(() => res.write("data: zwei\n\n"), 50);
          setTimeout(() => res.end("data: [DONE]\n\n"), 100);
          return;
        }
        if (path === "/haengt") {
          res.writeHead(200, { "content-type": "text/event-stream" });
          res.write("data: eins\n\n");
          return; // schreibt nie weiter
        }
        if (path === "/abbruch") {
          res.writeHead(200, { "content-type": "text/event-stream" });
          res.write("data: eins\n\n");
          setTimeout(() => res.socket?.destroy(), 30);
          return;
        }
        if (path === "/gzip") {
          res.writeHead(200, { "content-type": "application/json", "content-encoding": "gzip" });
          res.end(gzipSync(JSON.stringify({ gepackt: true })));
          return;
        }
        if (path === "/leer") {
          res.writeHead(204).end();
          return;
        }
        res.writeHead(201, { "content-type": "application/json", "x-test": "ja" });
        res.end(JSON.stringify({ path, method: req.method }));
      });
    });
    port = await listen(server);
  });
  afterAll(() => close(server));

  it("verbindet mit der geprüften Adresse, Host-Kopfzeile mit dem Namen", async () => {
    seen.length = 0;
    const response = await pinnedFetch(
      get(`http://anbieter.test:${port}/v1/chat/completions?x=1`, {
        method: "POST",
        headers: new Headers({ "content-type": "application/json" }),
        body: JSON.stringify({ hallo: "welt" }),
      }),
      ["127.0.0.1"],
    );
    expect(response.status).toBe(201);
    expect(response.headers.get("x-test")).toBe("ja");
    expect(await response.json()).toEqual({ path: "/v1/chat/completions?x=1", method: "POST" });
    expect(seen[0]?.host).toBe(`anbieter.test:${port}`);
    expect(seen[0]?.body).toBe('{"hallo":"welt"}');
  });

  it("liefert den Körper als Strom, Stück für Stück", async () => {
    const response = await pinnedFetch(get(`http://anbieter.test:${port}/strom`), ["127.0.0.1"]);
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    const first = await reader?.read();
    expect(decoder.decode(first?.value)).toBe("data: eins\n\n");
    let rest = "";
    for (;;) {
      const next = await reader?.read();
      if (!next || next.done) break;
      rest += decoder.decode(next.value);
    }
    expect(rest).toBe("data: zwei\n\ndata: [DONE]\n\n");
  });

  it("Abbruch über das Signal: vor und während des Körpers mit dem Grund des Signals", async () => {
    const early = new AbortController();
    early.abort(new DOMException("weg", "AbortError"));
    await expect(
      pinnedFetch(get(`http://anbieter.test:${port}/strom`, { signal: early.signal }), [
        "127.0.0.1",
      ]),
    ).rejects.toMatchObject({ name: "AbortError" });

    const late = new AbortController();
    const response = await pinnedFetch(
      get(`http://anbieter.test:${port}/haengt`, { signal: late.signal }),
      ["127.0.0.1"],
    );
    const reader = response.body?.getReader();
    await reader?.read();
    late.abort(new DOMException("Zeitgrenze erreicht", "TimeoutError"));
    const failure = await reader?.read().catch((e: unknown) => e);
    expect(failure).toMatchObject({ name: "TimeoutError" });
    expect(mapProviderError(failure)).toBe("anbieter_nicht_erreichbar");
  });

  it("Verbindung bricht mitten im Strom ab: TypeError terminated, abgebildet als nicht erreichbar", async () => {
    const response = await pinnedFetch(get(`http://anbieter.test:${port}/abbruch`), ["127.0.0.1"]);
    const failure = await response.text().catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(TypeError);
    expect((failure as Error).message).toBe("terminated");
    expect(mapProviderError(failure)).toBe("anbieter_nicht_erreichbar");
  });

  it("Zeitgrenze ohne Datenfluss beendet die Verbindung", async () => {
    const response = await pinnedFetch(get(`http://anbieter.test:${port}/haengt`), ["127.0.0.1"], {
      idleTimeoutMs: 100,
    });
    const failure = await response.text().catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(TypeError);
    expect(mapProviderError(failure)).toBe("anbieter_nicht_erreichbar");
  });

  it("entpackt gzip und liefert 204 ohne Körper", async () => {
    const packed = await pinnedFetch(get(`http://anbieter.test:${port}/gzip`), ["127.0.0.1"]);
    expect(await packed.json()).toEqual({ gepackt: true });
    const empty = await pinnedFetch(get(`http://anbieter.test:${port}/leer`), ["127.0.0.1"]);
    expect(empty.status).toBe(204);
    expect(empty.body).toBeNull();
  });

  it("Netzfehler wie fetch: TypeError fetch failed", async () => {
    const closed = createHttpServer();
    const freePort = await listen(closed);
    await close(closed);
    const failure = await pinnedFetch(get(`http://anbieter.test:${freePort}/`), [
      "127.0.0.1",
    ]).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(TypeError);
    expect((failure as Error).message).toBe("fetch failed");
    expect(mapProviderError(failure)).toBe("anbieter_nicht_erreichbar");
  });

  it("ohne geprüfte Adresse oder mit einem Namen statt einer Adresse: keine Verbindung", async () => {
    seen.length = 0;
    for (const addresses of [[], ["localhost"], ["anbieter.test"]]) {
      await expect(
        pinnedFetch(get(`http://anbieter.test:${port}/`), addresses),
      ).rejects.toBeInstanceOf(TypeError);
    }
    expect(seen).toHaveLength(0);
  });
});

const MODULE = fileURLToPath(new URL("./pinned-fetch.ts", import.meta.url));

/** Führt ein Skript in einem eigenen Node-Prozess aus (Umgebung wird beim Start gelesen). */
function runNode(script: string, extraEnv: Record<string, string>): Promise<string> {
  const env: Record<string, string> = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (value !== undefined && !/proxy/i.test(name)) env[name] = value;
  }
  Object.assign(env, { NODE_NO_WARNINGS: "1" }, extraEnv);
  return new Promise<string>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["--experimental-strip-types", "--input-type=module", "-e", script],
      { env },
    );
    let out = "";
    let err = "";
    child.stdout.on("data", (c) => {
      out += c;
    });
    child.stderr.on("data", (c) => {
      err += c;
    });
    child.on("close", (code) => (code === 0 ? resolve(out) : reject(new Error(err))));
  });
}

const lastJson = (output: string) => JSON.parse(output.trim().split("\n").at(-1) ?? "{}");

/** Erzeugt ein selbst signiertes Zertifikat für `anbieter.test`, wenn openssl da ist. */
function selfSigned(dir: string): { key: string; cert: string; certFile: string } | undefined {
  try {
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "ec",
        "-pkeyopt",
        "ec_paramgen_curve:prime256v1",
        "-nodes",
        "-days",
        "1",
        "-subj",
        "/CN=anbieter.test",
        "-addext",
        "subjectAltName=DNS:anbieter.test",
        "-keyout",
        join(dir, "key.pem"),
        "-out",
        join(dir, "cert.pem"),
      ],
      { stdio: "ignore" },
    );
    return {
      key: readFileSync(join(dir, "key.pem"), "utf8"),
      cert: readFileSync(join(dir, "cert.pem"), "utf8"),
      certFile: join(dir, "cert.pem"),
    };
  } catch {
    return undefined;
  }
}

const tlsDir = mkdtempSync(join(tmpdir(), "pb-tls-"));
const tls = selfSigned(tlsDir);
afterAll(() => rmSync(tlsDir, { recursive: true, force: true }));

describe.skipIf(tls === undefined)("pinnedFetch über HTTPS", () => {
  it("prüft das Zertifikat gegen den Namen aus der URL und sendet ihn als SNI", async () => {
    const material = tls as { key: string; cert: string; certFile: string };
    const names: Array<string | false> = [];
    const hosts: Array<string | undefined> = [];
    const server = createHttpsServer({ key: material.key, cert: material.cert }, (req, res) => {
      names.push((req.socket as unknown as { servername: string | false }).servername);
      hosts.push(req.headers.host);
      res.end("sicher");
    });
    const port = await listen(server as unknown as Server);
    const script = `
      const { pinnedFetch } = await import(${JSON.stringify(MODULE)});
      const attempt = async (host, extra = {}) => {
        try {
          const r = await pinnedFetch({ url: new URL("https://" + host + ":${port}/"), method: "GET", headers: new Headers(extra) }, ["127.0.0.1"]);
          return await r.text();
        } catch (e) { return "fehler " + (e.cause?.code ?? e.message); }
      };
      console.log(JSON.stringify({
        richtig: await attempt("anbieter.test"),
        falsch: await attempt("anderer.test"),
        // Eine mitgegebene Host-Kopfzeile ändert weder den Namen für das Zertifikat noch den Host.
        falschMitHost: await attempt("anderer.test", { host: "anbieter.test" }),
        richtigMitHost: await attempt("anbieter.test", { host: "anderer.test", "x-forwarded-host": "anderer.test" }),
      }));
    `;
    try {
      const result = lastJson(
        await runNode(script, { NODE_EXTRA_CA_CERTS: material.certFile, NODE_OPTIONS: "" }),
      );
      expect(result.richtig).toBe("sicher");
      expect(result.falsch).toMatch(/^fehler ERR_TLS_CERT_ALTNAME_INVALID/);
      expect(result.falschMitHost).toMatch(/^fehler ERR_TLS_CERT_ALTNAME_INVALID/);
      expect(result.richtigMitHost).toBe("sicher");
      expect(names).toEqual(["anbieter.test", "anbieter.test"]);
      expect(hosts).toEqual([`anbieter.test:${port}`, `anbieter.test:${port}`]);
    } finally {
      await close(server as unknown as Server);
    }
  }, 20_000);
});

describe("Proxy-Variablen der Umgebung", () => {
  it("NODE_USE_ENV_PROXY und HTTP_PROXY lenken die Verbindung nicht um", async () => {
    let targetHits = 0;
    let proxyHits = 0;
    const target = createHttpServer((_req, res) => {
      targetHits++;
      res.end("direkt");
    });
    const proxy = createHttpServer((_req, res) => {
      proxyHits++;
      res.end("proxy");
    });
    const targetPort = await listen(target);
    const proxyPort = await listen(proxy);
    const script = `
      import http from "node:http";
      const { pinnedFetch } = await import(${JSON.stringify(MODULE)});
      const url = "http://anbieter.test:${targetPort}/";
      // Gegenprobe: Der globale Agent von Node folgt der Variable.
      const viaGlobal = await new Promise((resolve) => {
        const req = http.request(url, { lookup: (h, o, cb) => o.all ? cb(null, [{ address: "127.0.0.1", family: 4 }]) : cb(null, "127.0.0.1", 4) }, (res) => {
          let body = ""; res.on("data", (c) => (body += c)); res.on("end", () => resolve(body));
        });
        req.on("error", (e) => resolve("fehler " + e.code));
        req.end();
      });
      const pinned = await (await pinnedFetch({ url: new URL(url), method: "GET", headers: new Headers() }, ["127.0.0.1"])).text();
      console.log(JSON.stringify({ viaGlobal, pinned }));
    `;
    try {
      const output = await runNode(script, {
        NODE_USE_ENV_PROXY: "1",
        HTTP_PROXY: `http://127.0.0.1:${proxyPort}`,
        HTTPS_PROXY: `http://127.0.0.1:${proxyPort}`,
      });
      const result = lastJson(output);
      expect(result.viaGlobal).toBe("proxy");
      expect(result.pinned).toBe("direkt");
      expect(targetHits).toBe(1);
      expect(proxyHits).toBe(1);
    } finally {
      await close(target);
      await close(proxy);
    }
  }, 20_000);
});
