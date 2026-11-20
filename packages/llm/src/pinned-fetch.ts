/**
 * PaiBot – Eine HTTP-Anfrage an genau die vorher geprüften Adressen, mit der Form von `fetch`.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

// Nur Bausteine von Node, keine Abhängigkeit im Paket: so lässt sich die Datei auch in einem
// eigenen Prozess laden (Test zu Proxy-Variablen der Umgebung).
import { Agent as HttpAgent, request as httpRequest, type IncomingMessage } from "node:http";
import { Agent as HttpsAgent, request as httpsRequest } from "node:https";
import { isIPv4, isIPv6, type LookupFunction } from "node:net";
import type { Readable } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

/** Zeitgrenze ohne Datenfluss, wenn nichts anderes angegeben ist (wie bei `fetch` in Node). */
export const PINNED_IDLE_TIMEOUT_MS = 300_000;

/** Eine einzelne Anfrage, ohne Weiterleitungen zu verfolgen. */
export interface PinnedRequest {
  url: URL;
  method: string;
  headers: Headers;
  body?: BodyInit | null;
  signal?: AbortSignal | null;
}

export interface PinnedOptions {
  /** Höchstens so lange darf die Verbindung ohne Datenfluss bleiben. */
  idleTimeoutMs?: number;
}

const NULL_BODY_STATUS = new Set([101, 204, 205, 304]);

/** Fehler mit Code, wie ihn auch Node bei Netzfehlern liefert. */
function codedError(message: string, code: string): Error {
  return Object.assign(new Error(message), { code });
}

/**
 * Namensauflösung, die nur die übergebenen Adressen liefert. Fragt Node nach allen Adressen
 * (`all: true`, für das parallele Probieren von IPv4 und IPv6), kommen alle; sonst die erste.
 */
function lookupOnly(addresses: readonly string[]): LookupFunction {
  const entries = addresses.map((address) => ({ address, family: isIPv6(address) ? 6 : 4 }));
  return (_hostname, options, callback) => {
    const wanted = typeof options === "object" && options !== null ? options.family : undefined;
    const matching = entries.filter(
      (entry) => wanted === undefined || wanted === 0 || entry.family === wanted,
    );
    const first = matching[0];
    if (first === undefined) {
      callback(codedError("Keine geprüfte Adresse", "ENOTFOUND"), "", 4);
      return;
    }
    if (typeof options === "object" && options !== null && options.all === true) {
      (callback as unknown as (e: null, list: typeof matching) => void)(null, matching);
      return;
    }
    callback(null, first.address, first.family);
  };
}

function decode(response: IncomingMessage): Readable {
  const encoding = (response.headers["content-encoding"] ?? "").trim().toLowerCase();
  let decoder: Readable & NodeJS.WritableStream;
  if (encoding === "gzip" || encoding === "x-gzip") decoder = createGunzip();
  else if (encoding === "deflate") decoder = createInflate();
  else if (encoding === "br") decoder = createBrotliDecompress();
  else return response;
  response.on("error", (error) => decoder.destroy(error));
  response.pipe(decoder);
  return decoder;
}

/**
 * Macht aus einem Node-Strom einen Web-Strom. Bricht die Verbindung mitten im Körper ab, endet der
 * Strom mit `TypeError("terminated")` und der Ursache (wie `fetch` in Node).
 */
function toWebStream(
  source: Readable,
  response: IncomingMessage,
  abortReason: () => unknown,
): ReadableStream<Uint8Array> {
  let done = false;
  return new ReadableStream<Uint8Array>(
    {
      start(controller) {
        const fail = (cause: unknown) => {
          if (done) return;
          done = true;
          const reason = abortReason();
          controller.error(reason !== undefined ? reason : new TypeError("terminated", { cause }));
        };
        source.on("data", (chunk: Buffer) => {
          if (done) return;
          controller.enqueue(new Uint8Array(chunk));
          if ((controller.desiredSize ?? 1) <= 0) source.pause();
        });
        source.on("end", () => {
          if (done) return;
          done = true;
          controller.close();
        });
        source.on("error", fail);
        response.on("close", () => {
          if (!response.complete) fail(codedError("Verbindung abgebrochen", "UND_ERR_SOCKET"));
        });
      },
      pull() {
        source.resume();
      },
      cancel() {
        done = true;
        response.destroy();
        source.destroy();
      },
    },
    { highWaterMark: 4 },
  );
}

/**
 * Schickt eine Anfrage genau an eine der `addresses` (vorher geprüft) und liefert eine `Response`
 * wie `fetch`: Strom-Körper, Abbruch über `signal`, Entpacken von gzip, deflate und br.
 * Weiterleitungen werden nicht verfolgt (das macht die Ausgangs-Liste selbst).
 *
 * - Verbunden wird nur mit diesen Adressen: Die Namensauflösung der Verbindung liefert genau sie.
 *   Ein zweites Auflösen des Namens findet nicht statt.
 * - Host-Kopfzeile und TLS (SNI, Prüfung des Zertifikats) nutzen den Namen aus der URL.
 * - Jede Anfrage hat ihren eigenen Agent: kein Proxy aus der Umgebung, keine geteilten Verbindungen.
 *
 * Fehler wie `fetch`: Netzfehler → `TypeError("fetch failed", { cause })`, Abbruch → der Grund des
 * Signals.
 */
export async function pinnedFetch(
  request: PinnedRequest,
  addresses: readonly string[],
  options: PinnedOptions = {},
): Promise<Response> {
  const { url, signal } = request;
  if (signal?.aborted) throw signal.reason;
  if (addresses.length === 0 || addresses.some((a) => !isIPv4(a) && !isIPv6(a))) {
    throw new TypeError("fetch failed", {
      cause: codedError("Keine geprüfte Adresse", "ENOTFOUND"),
    });
  }

  // Körper und Kopfzeilen so aufbereiten, wie `fetch` es täte (z. B. content-type bei Text).
  const prepared = new Request(url, {
    method: request.method,
    headers: request.headers,
    ...(request.body === undefined || request.body === null
      ? {}
      : { body: request.body, duplex: "half" }),
  } as RequestInit);
  const payload = prepared.body === null ? undefined : Buffer.from(await prepared.arrayBuffer());
  const headers: Record<string, string> = {};
  prepared.headers.forEach((value, name) => {
    headers[name] = value;
  });
  if (headers.accept === undefined) headers.accept = "*/*";
  if (headers["accept-encoding"] === undefined) headers["accept-encoding"] = "gzip, deflate, br";
  if (payload !== undefined) headers["content-length"] = String(payload.length);

  const https = url.protocol === "https:";
  const hostname = url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname;
  const port = url.port === "" ? (https ? 443 : 80) : Number(url.port);
  const idleTimeoutMs = options.idleTimeoutMs ?? PINNED_IDLE_TIMEOUT_MS;
  const lookup = lookupOnly(addresses);

  return new Promise<Response>((resolve, reject) => {
    let abortReason: unknown;
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    const common = {
      method: prepared.method,
      hostname,
      port,
      path: `${url.pathname}${url.search}`,
      headers,
      lookup,
    };
    const outgoing = https
      ? httpsRequest({ ...common, agent: new HttpsAgent({ keepAlive: false }) })
      : httpRequest({ ...common, agent: new HttpAgent({ keepAlive: false }) });

    const onAbort = () => {
      abortReason = signal?.reason;
      outgoing.destroy(codedError("Abgebrochen", "ABORT_ERR"));
      settle(() => reject(abortReason));
    };
    signal?.addEventListener("abort", onAbort, { once: true });

    outgoing.setTimeout(idleTimeoutMs, () => {
      outgoing.destroy(codedError("Zeitgrenze ohne Datenfluss erreicht", "ETIMEDOUT"));
    });

    outgoing.on("error", (error) => {
      signal?.removeEventListener("abort", onAbort);
      settle(() => reject(abortReason ?? new TypeError("fetch failed", { cause: error })));
    });

    outgoing.on("response", (response) => {
      const status = response.statusCode ?? 0;
      const responseHeaders = new Headers();
      const raw = response.rawHeaders;
      for (let i = 0; i + 1 < raw.length; i += 2) {
        const name = raw[i] ?? "";
        const value = raw[i + 1] ?? "";
        try {
          responseHeaders.append(name, value);
        } catch {
          // Kopfzeilen, die `Headers` nicht annimmt, entfallen (wie bei `fetch`).
        }
      }
      const noBody = prepared.method === "HEAD" || NULL_BODY_STATUS.has(status);
      let body: ReadableStream<Uint8Array> | null = null;
      if (noBody) {
        response.resume();
        response.on("end", () => signal?.removeEventListener("abort", onAbort));
      } else {
        body = toWebStream(decode(response), response, () => abortReason);
        response.on("close", () => signal?.removeEventListener("abort", onAbort));
      }
      try {
        const result = new Response(body, {
          status,
          statusText: response.statusMessage ?? "",
          headers: responseHeaders,
        });
        settle(() => resolve(result));
      } catch (error) {
        response.destroy();
        settle(() => reject(new TypeError("fetch failed", { cause: error })));
      }
    });

    outgoing.end(payload);
  });
}
