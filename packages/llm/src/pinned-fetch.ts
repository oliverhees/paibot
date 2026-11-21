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

/** Höchstens so viele Byte darf ein Antwort-Körper entpackt haben (16 MiB), wenn nichts anderes gilt. */
export const PINNED_MAX_BODY_BYTES = 16 * 1024 * 1024;
/**
 * Von einer Fehlerantwort (Status außerhalb von 2xx) werden höchstens so viele Byte gelesen
 * (64 KiB, entpackt); der Rest wird nicht mehr empfangen. Für die Abbildung auf einen Fehlercode
 * reicht das immer.
 */
export const PINNED_MAX_ERROR_BODY_BYTES = 64 * 1024;
/** Höchstens so viel mal größer als empfangen darf ein Körper beim Entpacken werden. */
export const PINNED_MAX_DECODE_RATIO = 500;
/** Bis zu dieser entpackten Größe (1 MiB) gilt die Verhältnis-Grenze noch nicht. */
export const PINNED_DECODE_RATIO_GRACE_BYTES = 1024 * 1024;
/** Längste Zeile in einem Ereignis-Strom (`text/event-stream`, 1 MiB). */
export const PINNED_MAX_LINE_BYTES = 1024 * 1024;
/** Höchstens so viele Byte dürfen Status-Zeile und Kopfzeilen einer Antwort zusammen haben (16 KiB). */
export const PINNED_MAX_HEADER_BYTES = 16 * 1024;

/**
 * Kopfzeilen, die nie vom Aufrufer kommen: `host` bildet die Verbindung selbst aus der URL, die
 * übrigen beschreiben Proxys, die Verbindung oder die Übertragung und gehören nicht in eine Anfrage
 * an einen Anbieter.
 */
export const PINNED_DROPPED_HEADERS: readonly string[] = [
  "host",
  "forwarded",
  "via",
  "x-real-ip",
  "client-ip",
  "true-client-ip",
  "connection",
  "keep-alive",
  "proxy-connection",
  "transfer-encoding",
  "te",
  "trailer",
  "upgrade",
];
/** Wie `PINNED_DROPPED_HEADERS`, für alle Kopfzeilen mit diesem Anfang (z. B. `x-forwarded-for`). */
export const PINNED_DROPPED_HEADER_PREFIXES: readonly string[] = ["x-forwarded-", "proxy-"];

/** Welche Grenze eine Antwort überschritten hat. */
export type ResponseLimitKind = "groesse" | "verhaeltnis" | "zeile" | "kopfzeilen";

/**
 * Eine Antwort war größer als erlaubt. Die Verbindung ist schon geschlossen; ein neuer Versuch
 * bringt nichts. Als Ursache in `TypeError("terminated")` (im Strom) bzw.
 * `TypeError("fetch failed")` (Kopfzeilen), wie andere Netzfehler auch.
 */
export class ResponseTooLargeError extends Error {
  readonly code = "antwort_zu_gross";
  readonly limit: ResponseLimitKind;

  constructor(limit: ResponseLimitKind) {
    super("Antwort zu groß");
    this.name = "ResponseTooLargeError";
    this.limit = limit;
  }
}

/** Grenzen für eine Antwort; fehlende Werte nehmen die Standards `PINNED_MAX_…`. */
export interface ResponseLimits {
  /** Höchstens so viele Byte entpackt je erfolgreicher Antwort (`PINNED_MAX_BODY_BYTES`). */
  maxBodyBytes?: number;
  /** Höchstens so viele Byte einer Fehlerantwort werden gelesen (`PINNED_MAX_ERROR_BODY_BYTES`). */
  maxErrorBodyBytes?: number;
  /** Verhältnis entpackt zu empfangen (`PINNED_MAX_DECODE_RATIO`). */
  maxDecodeRatio?: number;
  /** Längste Zeile in `text/event-stream` (`PINNED_MAX_LINE_BYTES`). */
  maxLineBytes?: number;
}

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
  /** Größen-Grenzen der Antwort. */
  limits?: ResponseLimits;
}

interface ResolvedLimits {
  maxBodyBytes: number;
  maxErrorBodyBytes: number;
  maxDecodeRatio: number;
  maxLineBytes: number;
}

function positive(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isFinite(value) && value > 0 ? value : fallback;
}

function resolveLimits(limits: ResponseLimits = {}): ResolvedLimits {
  return {
    maxBodyBytes: positive(limits.maxBodyBytes, PINNED_MAX_BODY_BYTES),
    maxErrorBodyBytes: positive(limits.maxErrorBodyBytes, PINNED_MAX_ERROR_BODY_BYTES),
    maxDecodeRatio: positive(limits.maxDecodeRatio, PINNED_MAX_DECODE_RATIO),
    maxLineBytes: positive(limits.maxLineBytes, PINNED_MAX_LINE_BYTES),
  };
}

function droppedHeader(name: string): boolean {
  return (
    PINNED_DROPPED_HEADERS.includes(name) ||
    PINNED_DROPPED_HEADER_PREFIXES.some((prefix) => name.startsWith(prefix))
  );
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

/** Wie viele gepackte Byte der Entpacker schon verarbeitet hat (ohne Packen: `undefined`). */
type Consumed = () => number | undefined;

function decode(response: IncomingMessage): { source: Readable; consumed: Consumed } {
  const encoding = (response.headers["content-encoding"] ?? "").trim().toLowerCase();
  let decoder: (Readable & NodeJS.WritableStream & { bytesWritten: number }) | undefined;
  if (encoding === "gzip" || encoding === "x-gzip") decoder = createGunzip();
  else if (encoding === "deflate") decoder = createInflate();
  else if (encoding === "br") decoder = createBrotliDecompress();
  if (decoder === undefined) return { source: response, consumed: () => undefined };
  const active = decoder;
  response.on("error", (error) => active.destroy(error));
  response.pipe(active);
  // `bytesWritten` zählt, was der Entpacker wirklich verarbeitet hat, nicht was im Puffer wartet.
  return { source: active, consumed: () => active.bytesWritten };
}

/**
 * Prüft je Stück die Grenzen: Gesamtgröße entpackt, Verhältnis zum Empfangenen (ab
 * `PINNED_DECODE_RATIO_GRACE_BYTES`) und bei Ereignis-Strömen die Länge der aktuellen Zeile.
 * Liefert die überschrittene Grenze oder `undefined`.
 */
function createMeter(limits: ResolvedLimits, consumed: Consumed, eventStream: boolean) {
  let decoded = 0;
  let line = 0;
  return (chunk: Buffer, maxBytes: number): ResponseLimitKind | undefined => {
    decoded += chunk.length;
    if (decoded > maxBytes) return "groesse";
    const packed = consumed();
    if (
      packed !== undefined &&
      decoded > PINNED_DECODE_RATIO_GRACE_BYTES &&
      decoded > Math.max(packed, 1) * limits.maxDecodeRatio
    ) {
      return "verhaeltnis";
    }
    if (eventStream) {
      let end = chunk.length - 1;
      while (end >= 0 && chunk[end] !== 0x0a && chunk[end] !== 0x0d) end--;
      line = end < 0 ? line + chunk.length : chunk.length - end - 1;
      if (line > limits.maxLineBytes) return "zeile";
    }
    return undefined;
  };
}

/**
 * Macht aus einem Node-Strom einen Web-Strom. Bricht die Verbindung mitten im Körper ab, endet der
 * Strom mit `TypeError("terminated")` und der Ursache (wie `fetch` in Node).
 */
function toWebStream(
  source: Readable,
  response: IncomingMessage,
  abortReason: () => unknown,
  check: (chunk: Buffer) => ResponseLimitKind | undefined,
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
          const exceeded = check(chunk);
          if (exceeded !== undefined) {
            // Sofort schließen: nichts mehr empfangen, nichts mehr entpacken.
            fail(new ResponseTooLargeError(exceeded));
            response.destroy();
            source.destroy();
            return;
          }
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
 * Liest den Anfang einer Fehlerantwort, höchstens `maxBytes` entpackt, dann wird die Verbindung
 * geschlossen. Bricht sie vorher ab, gilt das bis dahin Gelesene.
 */
function readErrorBody(
  source: Readable,
  response: IncomingMessage,
  maxBytes: number,
  check: (chunk: Buffer) => ResponseLimitKind | undefined,
): Promise<Buffer> {
  return new Promise<Buffer>((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      resolve(Buffer.concat(chunks, size));
    };
    source.on("data", (chunk: Buffer) => {
      if (finished) return;
      const room = maxBytes - size;
      const part = chunk.length > room ? chunk.subarray(0, room) : chunk;
      chunks.push(part);
      size += part.length;
      if (size >= maxBytes || check(chunk) !== undefined) {
        finish();
        response.destroy();
        source.destroy();
      }
    });
    source.on("end", finish);
    source.on("error", finish);
    response.on("close", finish);
  });
}

/**
 * Schickt eine Anfrage genau an eine der `addresses` (vorher geprüft) und liefert eine `Response`
 * wie `fetch`: Strom-Körper, Abbruch über `signal`, Entpacken von gzip, deflate und br.
 * Weiterleitungen werden nicht verfolgt (das macht die Ausgangs-Liste selbst).
 *
 * - Verbunden wird nur mit diesen Adressen: Die Namensauflösung der Verbindung liefert genau sie.
 *   Ein zweites Auflösen des Namens findet nicht statt.
 * - Host-Kopfzeile und TLS (SNI, Prüfung des Zertifikats) bildet die Verbindung allein aus der URL.
 *   Mitgegebene `host`-, `x-forwarded-*`-, `forwarded`-, `proxy-*`- und Verbindungs-Kopfzeilen
 *   (`PINNED_DROPPED_HEADERS`) werden verworfen.
 * - Jede Anfrage hat ihren eigenen Agent: kein Proxy aus der Umgebung, keine geteilten Verbindungen.
 * - Grenzen (`options.limits`, Standards `PINNED_MAX_…`): Ein erfolgreicher Körper darf entpackt
 *   höchstens `maxBodyBytes` haben, beim Entpacken höchstens `maxDecodeRatio`-mal größer werden als
 *   empfangen, und in `text/event-stream` darf keine Zeile länger als `maxLineBytes` sein; sonst
 *   wird die Verbindung sofort geschlossen und der Strom endet mit `TypeError("terminated")` mit
 *   Ursache `ResponseTooLargeError`. Von einer Fehlerantwort (Status außerhalb von 2xx) liest die
 *   Verbindung nur die ersten `maxErrorBodyBytes` und schließt dann; die `Response` enthält genau
 *   diesen Anfang. Kopfzeilen über `PINNED_MAX_HEADER_BYTES` → `TypeError("fetch failed")` mit
 *   Ursache `ResponseTooLargeError`.
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
    if (!droppedHeader(name)) headers[name] = value;
  });
  if (headers.accept === undefined) headers.accept = "*/*";
  if (headers["accept-encoding"] === undefined) headers["accept-encoding"] = "gzip, deflate, br";
  if (payload !== undefined) headers["content-length"] = String(payload.length);

  const https = url.protocol === "https:";
  const hostname = url.hostname.startsWith("[") ? url.hostname.slice(1, -1) : url.hostname;
  const port = url.port === "" ? (https ? 443 : 80) : Number(url.port);
  const idleTimeoutMs = options.idleTimeoutMs ?? PINNED_IDLE_TIMEOUT_MS;
  const limits = resolveLimits(options.limits);
  const lookup = lookupOnly(addresses);
  // Immer selbst gesetzt: der Name aus der URL, mit Port, wenn er nicht der Standard ist.
  headers.host = url.host;

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
      maxHeaderSize: PINNED_MAX_HEADER_BYTES,
    };
    const outgoing = https
      ? httpsRequest({
          ...common,
          // Name für SNI und Prüfung des Zertifikats: nur aus der URL, nie aus einer Kopfzeile.
          ...(isIPv4(hostname) || isIPv6(hostname) ? {} : { servername: hostname }),
          agent: new HttpsAgent({ keepAlive: false }),
        })
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
      const cause =
        (error as { code?: unknown }).code === "HPE_HEADER_OVERFLOW"
          ? new ResponseTooLargeError("kopfzeilen")
          : error;
      settle(() => reject(abortReason ?? new TypeError("fetch failed", { cause })));
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
      const respond = (body: BodyInit | null) => {
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
      };
      if (noBody) {
        response.resume();
        response.on("end", () => signal?.removeEventListener("abort", onAbort));
        respond(null);
        return;
      }
      const contentType = (response.headers["content-type"] ?? "").toLowerCase();
      const { source, consumed } = decode(response);
      const meter = createMeter(limits, consumed, contentType.includes("text/event-stream"));
      response.on("close", () => signal?.removeEventListener("abort", onAbort));
      if (status >= 200 && status < 300) {
        respond(
          toWebStream(
            source,
            response,
            () => abortReason,
            (chunk) => meter(chunk, limits.maxBodyBytes),
          ),
        );
        return;
      }
      // Fehlerantwort: nur den Anfang lesen, der Rest kommt gar nicht erst an.
      void readErrorBody(source, response, limits.maxErrorBodyBytes, (chunk) =>
        meter(chunk, Number.POSITIVE_INFINITY),
      ).then((bytes) => {
        if (abortReason !== undefined) settle(() => reject(abortReason));
        else respond(bytes.length === 0 ? null : new Uint8Array(bytes));
      });
    });

    outgoing.end(payload);
  });
}
