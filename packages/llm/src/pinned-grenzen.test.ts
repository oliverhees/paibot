/**
 * PaiBot – Tests für die Grenzen der festgenagelten Verbindung: Größe, Entpacken, Zeilen,
 * Fehlerkörper, Kopfzeilen und die Kopfzeile `Host`.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  type AddressInfo,
  createServer as createNetServer,
  type Server as NetServer,
} from "node:net";
import {
  createBrotliCompress,
  createDeflate,
  createGzip,
  type Gzip,
  constants as zlibConstants,
} from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createEgressFetch } from "./egress";
import { isResponseTooLarge, isRetryableError, mapProviderError } from "./errors";
import { fetchModels, MODEL_LIST_LIMITS } from "./models";
import {
  PINNED_MAX_ERROR_BODY_BYTES,
  PINNED_MAX_HEADER_BYTES,
  pinnedFetch,
  ResponseTooLargeError,
} from "./pinned-fetch";

const MiB = 1024 * 1024;
/** Erlaubter Zuwachs des Speichers während einer Bombe (ohne Grenze waren es über 1 GiB). */
const RSS_BOUND = 96 * MiB;

/** Packt `total` Byte Nullen, ohne sie je ganz im Speicher zu haben. */
async function bomb(kind: "gzip" | "deflate" | "br", total: number): Promise<Buffer> {
  const packer: Gzip =
    kind === "gzip"
      ? createGzip({ level: 9 })
      : kind === "deflate"
        ? createDeflate({ level: 9 })
        : (createBrotliCompress({
            params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 5 },
          }) as unknown as Gzip);
  const out: Buffer[] = [];
  packer.on("data", (chunk: Buffer) => out.push(chunk));
  const done = new Promise<void>((resolve) => packer.on("end", () => resolve()));
  const zeros = Buffer.alloc(MiB);
  for (let written = 0; written < total; written += zeros.length) {
    if (!packer.write(zeros)) await new Promise((resolve) => packer.once("drain", resolve));
  }
  packer.end();
  await done;
  return Buffer.concat(out);
}

/** Schreibt endlos `piece`, bis der Empfänger die Verbindung schließt. */
function endless(res: ServerResponse, piece: Buffer | string): void {
  let open = true;
  res.on("close", () => {
    open = false;
  });
  const pump = () => {
    while (open && res.write(piece)) {
      // weiter, solange der Puffer Platz hat
    }
    if (open) res.once("drain", pump);
  };
  pump();
}

let server: Server;
let origin: string;
let port: number;
const closed: string[] = [];
const seenHeaders: IncomingMessage["headers"][] = [];
let gzipBomb: Buffer;
let deflateBomb: Buffer;
let brBomb: Buffer;

beforeAll(async () => {
  // 400 MiB Nullen; gepackt nur einige hundert KB.
  gzipBomb = await bomb("gzip", 400 * MiB);
  deflateBomb = await bomb("deflate", 200 * MiB);
  brBomb = await bomb("br", 400 * MiB);
  server = createServer((req, res) => {
    seenHeaders.push(req.headers);
    const path = req.url ?? "/";
    res.on("close", () => closed.push(path));
    const packed = (status: number, encoding: string, body: Buffer, type = "application/json") => {
      res.writeHead(status, { "content-type": type, "content-encoding": encoding });
      res.end(body);
    };
    if (path === "/bombe/200") return packed(200, "gzip", gzipBomb);
    if (path === "/bombe/400") return packed(400, "gzip", gzipBomb);
    if (path === "/bombe/500") return packed(500, "gzip", gzipBomb);
    if (path === "/bombe/deflate") return packed(200, "deflate", deflateBomb);
    if (path === "/bombe/br") return packed(200, "br", brBomb);
    if (path === "/zeile") {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write("data: ");
      return endless(res, Buffer.alloc(16 * 1024, 0x61));
    }
    if (path === "/stuecke") {
      res.writeHead(200, { "content-type": "text/event-stream" });
      return endless(res, 'data: {"x":1}\n\n');
    }
    if (path === "/fehler/400" || path === "/fehler/500") {
      res.writeHead(Number(path.slice(-3)), { "content-type": "application/json" });
      res.write('{"error":{"message":"');
      return endless(res, Buffer.alloc(16 * 1024, 0x62));
    }
    if (path === "/v1/models") {
      res.writeHead(200, { "content-type": "application/json" });
      res.write('{"data":[');
      return endless(res, '{"id":"m","name":"Modell"},');
    }
    res.writeHead(200, { "content-type": "application/json" }).end("{}");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  port = (server.address() as AddressInfo).port;
  origin = `http://127.0.0.1:${port}`;
}, 120_000);

afterAll(async () => {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
});

const request = (path: string, headers: HeadersInit = {}) => ({
  url: new URL(`${origin}${path}`),
  method: "GET",
  headers: new Headers(headers),
});

/** Liest einen Körper so, wie die Modell-Bibliothek es tut (`text()`), und misst den Speicher. */
async function readMeasured(
  promise: Promise<Response>,
): Promise<{ status: number; text?: string; error?: unknown; grown: number }> {
  const before = process.memoryUsage().rss;
  let peak = before;
  const sampler = setInterval(() => {
    peak = Math.max(peak, process.memoryUsage().rss);
  }, 5);
  try {
    const response = await promise;
    try {
      const text = await response.text();
      return {
        status: response.status,
        text,
        grown: Math.max(peak, process.memoryUsage().rss) - before,
      };
    } catch (error) {
      return {
        status: response.status,
        error,
        grown: Math.max(peak, process.memoryUsage().rss) - before,
      };
    }
  } finally {
    clearInterval(sampler);
  }
}

async function waitClosed(path: string): Promise<void> {
  for (let i = 0; i < 200 && !closed.includes(path); i++) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(closed).toContain(path);
}

function limitOf(error: unknown): string | undefined {
  for (let current = error, i = 0; i < 5; i++) {
    if (current instanceof ResponseTooLargeError) return current.limit;
    current = (current as { cause?: unknown } | undefined)?.cause;
  }
  return undefined;
}

describe("Grenzen der Antwort", () => {
  it("gzip-Bombe im Strom (HTTP 200): Abbruch nach kurzer Zeit, Speicher wächst kaum, Verbindung zu", async () => {
    expect(gzipBomb.length).toBeLessThan(1 * MiB);
    const result = await readMeasured(pinnedFetch(request("/bombe/200"), ["127.0.0.1"]));
    expect(result.status).toBe(200);
    expect(result.error).toBeInstanceOf(TypeError);
    expect((result.error as Error).message).toBe("terminated");
    expect(limitOf(result.error)).toBe("verhaeltnis");
    expect(result.grown).toBeLessThan(RSS_BOUND);
    expect(mapProviderError(result.error)).toBe("limit_erreicht");
    expect(isResponseTooLarge(result.error)).toBe(true);
    expect(isRetryableError(result.error)).toBe(false);
    await waitClosed("/bombe/200");
  }, 30_000);

  it.each(["/bombe/400", "/bombe/500"])(
    "gzip-Bombe als Fehlerantwort (%s): nur der Anfang wird gelesen",
    async (path) => {
      const result = await readMeasured(pinnedFetch(request(path), ["127.0.0.1"]));
      expect(result.status).toBe(Number(path.slice(-3)));
      // Lesbar wie eine normale Fehlerantwort, aber nur der Anfang.
      expect(result.error).toBeUndefined();
      expect(result.text?.length).toBe(PINNED_MAX_ERROR_BODY_BYTES);
      expect(result.grown).toBeLessThan(RSS_BOUND);
      await waitClosed(path);
    },
    30_000,
  );

  it.each(["/bombe/deflate", "/bombe/br"])(
    "Bombe mit %s: Verhältnis-Grenze greift",
    async (path) => {
      const result = await readMeasured(pinnedFetch(request(path), ["127.0.0.1"]));
      expect(limitOf(result.error)).toBe("verhaeltnis");
      expect(result.grown).toBeLessThan(RSS_BOUND);
      await waitClosed(path);
    },
    30_000,
  );

  it("ohne Verhältnis-Grenze bleibt die Größen-Grenze: Abbruch bei maxBodyBytes", async () => {
    const result = await readMeasured(
      pinnedFetch(request("/bombe/200"), ["127.0.0.1"], {
        limits: { maxDecodeRatio: Number.MAX_SAFE_INTEGER, maxBodyBytes: 8 * MiB },
      }),
    );
    expect(limitOf(result.error)).toBe("groesse");
    expect(result.grown).toBeLessThan(RSS_BOUND);
  }, 30_000);

  it("endlose Zeile ohne Zeilenumbruch im Ereignis-Strom: Abbruch bei der Zeilen-Grenze", async () => {
    const result = await readMeasured(pinnedFetch(request("/zeile"), ["127.0.0.1"]));
    expect(limitOf(result.error)).toBe("zeile");
    expect(result.grown).toBeLessThan(RSS_BOUND);
    await waitClosed("/zeile");
  }, 30_000);

  it("endloser Strom winziger Stücke: Abbruch bei der Gesamtgröße", async () => {
    const result = await readMeasured(
      pinnedFetch(request("/stuecke"), ["127.0.0.1"], { limits: { maxBodyBytes: 2 * MiB } }),
    );
    expect(limitOf(result.error)).toBe("groesse");
    await waitClosed("/stuecke");
  }, 30_000);

  it.each(["/fehler/400", "/fehler/500"])(
    "riesiger Fehlerkörper ohne Packen (%s): höchstens die Grenze gelesen, Verbindung zu",
    async (path) => {
      const response = await pinnedFetch(request(path), ["127.0.0.1"], {
        limits: { maxErrorBodyBytes: 4096 },
      });
      const text = await response.text();
      expect(text.length).toBe(4096);
      expect(text.startsWith('{"error":{"message":"')).toBe(true);
      await waitClosed(path);
    },
    30_000,
  );

  it("riesige Modell-Liste: limit_erreicht, Verbindung zu", async () => {
    await expect(
      fetchModels({ baseUrl: `${origin}/v1`, region: "local" }, undefined),
    ).rejects.toMatchObject({ code: "limit_erreicht" });
    expect(MODEL_LIST_LIMITS.maxBodyBytes).toBeLessThanOrEqual(8 * MiB);
    await waitClosed("/v1/models");
  }, 30_000);

  it("die Grenzen gelten auch durch die Ausgangs-Liste hindurch", async () => {
    const guarded = createEgressFetch(
      [{ protocol: "http:", host: "127.0.0.1", port, allowPrivate: true }],
      undefined,
      {
        limits: { maxBodyBytes: 1 * MiB },
      },
    );
    const response = await guarded(`${origin}/stuecke`);
    const error = await response.text().catch((e: unknown) => e);
    expect(limitOf(error)).toBe("groesse");
  }, 30_000);
});

describe("Kopfzeilen der Antwort", () => {
  let raw: NetServer;
  let rawPort: number;

  beforeAll(async () => {
    // Antwortet mit einer Kopfzeile, die größer ist als die Grenze.
    raw = createNetServer((socket) => {
      socket.once("data", () => {
        socket.write(`HTTP/1.1 200 OK\r\nx-gross: ${"k".repeat(4 * PINNED_MAX_HEADER_BYTES)}\r\n`);
        socket.end("content-length: 2\r\n\r\nok");
      });
      socket.on("error", () => undefined);
    });
    await new Promise<void>((resolve) => raw.listen(0, "127.0.0.1", () => resolve()));
    rawPort = (raw.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((resolve) => raw.close(() => resolve())));

  it("riesige Kopfzeilen: fetch failed mit Ursache „zu groß“, unabhängig von Node-Optionen", async () => {
    const error = await pinnedFetch(
      { url: new URL(`http://127.0.0.1:${rawPort}/`), method: "GET", headers: new Headers() },
      ["127.0.0.1"],
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(TypeError);
    expect((error as Error).message).toBe("fetch failed");
    expect(limitOf(error)).toBe("kopfzeilen");
    expect(mapProviderError(error)).toBe("limit_erreicht");
  });
});

describe("Kopfzeile Host und Proxy-Angaben", () => {
  it("Host kommt immer aus der URL; Host, X-Forwarded-*, Forwarded und Proxy-Angaben des Aufrufers fallen weg", async () => {
    seenHeaders.length = 0;
    const response = await pinnedFetch(
      request("/", {
        host: "anderer.example",
        "x-forwarded-host": "anderer.example",
        "x-forwarded-for": "10.0.0.1",
        "x-forwarded-proto": "https",
        forwarded: "for=10.0.0.1;host=anderer.example",
        "x-real-ip": "10.0.0.1",
        via: "1.1 fremd",
        "proxy-authorization": "Basic eA==",
        "x-eigene": "bleibt",
      }),
      ["127.0.0.1"],
    );
    await response.text();
    const seen = seenHeaders.at(-1) ?? {};
    expect(seen.host).toBe(`127.0.0.1:${port}`);
    for (const name of [
      "x-forwarded-host",
      "x-forwarded-for",
      "x-forwarded-proto",
      "forwarded",
      "x-real-ip",
      "via",
      "proxy-authorization",
    ]) {
      expect(seen[name], name).toBeUndefined();
    }
    expect(seen["x-eigene"]).toBe("bleibt");
  });

  it("auch durch die Ausgangs-Liste: ein Name in der URL bleibt der Host", async () => {
    seenHeaders.length = 0;
    const guarded = createEgressFetch(
      [{ protocol: "http:", host: "anbieter.example", port, allowPrivate: true }],
      undefined,
      { lookup: async () => ["127.0.0.1"] },
    );
    const response = await guarded(`http://anbieter.example:${port}/`, {
      headers: { host: "anderer.example", "x-forwarded-host": "anderer.example" },
    });
    await response.text();
    expect(seenHeaders.at(-1)?.host).toBe(`anbieter.example:${port}`);
    expect(seenHeaders.at(-1)?.["x-forwarded-host"]).toBeUndefined();
  });
});
