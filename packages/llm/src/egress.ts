/**
 * PaiBot – Ausgangs-Liste: `fetch`, das nur erlaubte Ziele erreicht, und die Prüfung von Basis-URLs.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { lookup } from "node:dns/promises";
import type { Region } from "@paibot/shared/objekte";
import { classifyIpAddress, isIpAddress, METADATA_HOSTS, normalizeHost } from "./address";

/** Namen der Dienste im Compose-Stack. Sie sind als Anbieter-Ziel nie erlaubt. */
export const INTERNAL_SERVICE_HOSTS = ["postgres", "datenschleuse", "web", "worker"] as const;

/** Erlaubtes Ziel: Protokoll, Host und Port (ohne Port gilt der Standard des Protokolls). */
export interface EgressTarget {
  protocol: "https:" | "http:";
  host: string;
  port?: number;
  /**
   * Das Ziel darf auf eine private Adresse zeigen (lokaler Anbieter, Datenschleuse im eigenen
   * Netz). Link-Local- und Metadaten-Adressen bleiben auch dann gesperrt.
   */
  allowPrivate?: boolean;
}

/** Warum ein Aufruf abgelehnt wurde. */
export type EgressBlockReason =
  | "nicht_erlaubt"
  | "adresse_nicht_erlaubt"
  | "weiterleitung"
  | "zugangsdaten_in_url";

/** Ein Aufruf hat ein Ziel außerhalb der Ausgangs-Liste angesprochen. Es wurde nichts gesendet. */
export class EgressBlockedError extends Error {
  /** Ziel als `protokoll//host:port`, ohne Pfad und ohne Abfrage. */
  readonly target: string;
  readonly reason: EgressBlockReason;

  constructor(target: string, reason: EgressBlockReason = "nicht_erlaubt") {
    super(`Ziel nicht erlaubt: ${target}`);
    this.name = "EgressBlockedError";
    this.target = target;
    this.reason = reason;
  }
}

/** Löst einen Namen in alle seine Adressen auf. */
export type HostLookup = (host: string) => Promise<readonly string[]>;

export interface EgressOptions {
  /** Namensauflösung (Standard: das Betriebssystem). Zum Testen austauschbar. */
  lookup?: HostLookup;
  /** Wird mit dem Ziel aufgerufen, wenn ein Aufruf abgelehnt wurde. */
  onBlocked?: (target: string, reason: EgressBlockReason) => void;
}

const MAX_REDIRECTS = 5;

async function systemLookup(host: string): Promise<readonly string[]> {
  const results = await lookup(host, { all: true, verbatim: true });
  return results.map((entry) => entry.address);
}

function defaultPort(protocol: string): number {
  return protocol === "https:" ? 443 : 80;
}

function describeTarget(url: URL): string {
  return `${url.protocol}//${normalizeHost(url.hostname)}:${url.port || defaultPort(url.protocol)}`;
}

function sameTarget(allowed: EgressTarget, url: URL): boolean {
  return (
    allowed.protocol === url.protocol &&
    normalizeHost(allowed.host) === normalizeHost(url.hostname) &&
    (allowed.port ?? defaultPort(allowed.protocol)) ===
      Number(url.port || defaultPort(url.protocol))
  );
}

/** Erlaubtes Ziel aus einer Basis-URL. Wirft `TypeError`, wenn es keine http(s)-URL ist. */
export function egressTargetOf(baseUrl: string): EgressTarget {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new TypeError("Ungültige Basis-URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new TypeError("Ungültige Basis-URL");
  }
  const target: EgressTarget = { protocol: url.protocol, host: normalizeHost(url.hostname) };
  if (url.port) target.port = Number(url.port);
  return target;
}

/**
 * Prüft die Adressen eines Ziels. Bei IP-Adressen direkt, bei Namen nach der Auflösung: eine
 * einzige gesperrte Adresse genügt. Link-Local und Metadaten sind nie erlaubt, private Adressen
 * nur mit `allowPrivate`.
 */
async function addressesAllowed(
  host: string,
  allowPrivate: boolean,
  resolve: HostLookup,
): Promise<boolean> {
  const addresses = isIpAddress(host) ? [host] : await resolve(host);
  if (addresses.length === 0) return false;
  return addresses.every((address) => {
    const kind = classifyIpAddress(address);
    return kind === "oeffentlich" || (kind === "privat" && allowPrivate);
  });
}

/**
 * Baut ein `fetch`, das nur die genannten Ziele erreicht (Vergleich von Protokoll, Host und Port
 * nach Normalisierung; Weiterleitungen werden nicht automatisch verfolgt, sondern ebenfalls
 * geprüft). Jedes andere Ziel wird mit `EgressBlockedError` abgelehnt, bevor eine Verbindung
 * entsteht. `baseFetch` ist das eigentliche `fetch` (Standard: `globalThis.fetch`).
 *
 * Zusätzlich werden die Adressen jedes Ziels geprüft, bei Namen nach der Auflösung (siehe
 * `EgressTarget.allowPrivate`). Weiterleitungen folgt die Hülle selbst, höchstens fünf, und nur
 * zu erlaubten Zielen; `Authorization` wird bei einem Wechsel des Ziels entfernt.
 */
export function createEgressFetch(
  allowed: readonly EgressTarget[],
  baseFetch?: typeof fetch,
  options: EgressOptions = {},
): typeof fetch {
  const resolve = options.lookup ?? systemLookup;

  const block = (url: URL, reason: EgressBlockReason): never => {
    const target = describeTarget(url);
    options.onBlocked?.(target, reason);
    throw new EgressBlockedError(target, reason);
  };

  return async (input, init) => {
    const doFetch = baseFetch ?? globalThis.fetch;
    let request: { url: URL; method: string; headers: Headers; body: BodyInit | null | undefined };
    let signal: AbortSignal | null | undefined = init?.signal;
    let redirectMode: RequestRedirect = init?.redirect ?? "follow";

    if (input instanceof Request) {
      const method = init?.method ?? input.method;
      const hasBody = method !== "GET" && method !== "HEAD";
      request = {
        url: new URL(input.url),
        method,
        headers: new Headers(init?.headers ?? input.headers),
        body: init?.body ?? (hasBody ? await input.clone().arrayBuffer() : undefined),
      };
      signal = init?.signal ?? input.signal;
      redirectMode = init?.redirect ?? input.redirect;
    } else {
      request = {
        url: new URL(typeof input === "string" ? input : input.href),
        method: init?.method ?? "GET",
        headers: new Headers(init?.headers),
        body: init?.body,
      };
    }

    for (let hop = 0; ; hop++) {
      const { url } = request;
      if (url.username || url.password) return block(url, "zugangsdaten_in_url");
      const match = allowed.find((entry) => sameTarget(entry, url));
      if (!match) return block(url, hop === 0 ? "nicht_erlaubt" : "weiterleitung");

      let addressesOk = false;
      try {
        addressesOk = await addressesAllowed(
          normalizeHost(url.hostname),
          match.allowPrivate === true,
          resolve,
        );
      } catch {
        // Name nicht auflösbar: wie ein Netzfehler behandeln.
        throw new TypeError("fetch failed");
      }
      if (!addressesOk) return block(url, "adresse_nicht_erlaubt");

      const response = await doFetch(url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        signal,
        redirect: "manual",
      });

      const location = response.headers.get("location");
      const isRedirect = [301, 302, 303, 307, 308].includes(response.status) && location !== null;
      if (!isRedirect || redirectMode === "manual") return response;
      await response.body?.cancel().catch(() => undefined);
      if (redirectMode === "error") throw new TypeError("fetch failed");
      if (hop >= MAX_REDIRECTS) throw new TypeError("fetch failed");

      let next: URL;
      try {
        next = new URL(location, url);
      } catch {
        throw new TypeError("fetch failed");
      }

      const toGet =
        response.status === 303 ||
        ((response.status === 301 || response.status === 302) && request.method === "POST");
      const headers = new Headers(request.headers);
      let body = request.body;
      let method = request.method;
      if (toGet) {
        method = "GET";
        body = undefined;
        headers.delete("content-type");
        headers.delete("content-length");
      } else if (body !== undefined && body !== null && typeof body !== "string") {
        const kind = Object.prototype.toString.call(body);
        const replayable =
          body instanceof ArrayBuffer ||
          ArrayBuffer.isView(body) ||
          body instanceof URLSearchParams ||
          kind === "[object Blob]";
        if (!replayable) return block(next, "weiterleitung");
      }
      if (next.host !== url.host || next.protocol !== url.protocol) {
        headers.delete("authorization");
        headers.delete("proxy-authorization");
        headers.delete("cookie");
      }
      request = { url: next, method, headers, body };
    }
  };
}

/** Gründe, aus denen eine Basis-URL abgelehnt wird. */
export type BaseUrlProblem =
  | "keine_url"
  | "protokoll"
  | "interner_dienst"
  | "link_local"
  | "private_adresse"
  | "zugangsdaten_in_url";

export type BaseUrlCheck = { ok: true; url: URL } | { ok: false; problem: BaseUrlProblem };

const PRIVATE_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".lan",
  ".home.arpa",
  ".localdomain",
  ".intranet",
  ".corp",
  ".private",
];

const MAX_URL_CHARS = 2048;

/**
 * Prüft die Basis-URL eines Anbieters:
 * - nur `https`; `http` nur bei Region `local`
 * - keine internen Dienstnamen (`INTERNAL_SERVICE_HOSTS`), keine Link-Local-Adressen
 *   (z. B. `169.254.169.254`, `fe80::/10`) und keine Namen von Metadaten-Diensten
 * - private Adressen und `localhost` nur bei Region `local`
 * - keine Zugangsdaten in der URL (`user:pass@`)
 *
 * Rein: löst keine Namen auf und baut keine Verbindung auf. Die Schreibweisen von IP-Adressen
 * (dezimal, hexadezimal, oktal, gekürzt, IPv6 inklusive abgebildeter IPv4) normalisiert der
 * URL-Parser vor der Prüfung. Die Auflösung von Namen prüft `createEgressFetch` bei jedem Aufruf.
 */
export function checkProviderBaseUrl(baseUrl: string, region: Region): BaseUrlCheck {
  if (typeof baseUrl !== "string" || baseUrl.length === 0 || baseUrl.length > MAX_URL_CHARS) {
    return { ok: false, problem: "keine_url" };
  }
  let url: URL;
  try {
    url = new URL(baseUrl.trim());
  } catch {
    return { ok: false, problem: "keine_url" };
  }
  if (url.username !== "" || url.password !== "") {
    return { ok: false, problem: "zugangsdaten_in_url" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, problem: "protokoll" };
  }

  const host = normalizeHost(url.hostname);
  const local = region === "local";
  if (host === "") return { ok: false, problem: "keine_url" };

  if ((INTERNAL_SERVICE_HOSTS as readonly string[]).includes(host)) {
    return { ok: false, problem: "interner_dienst" };
  }
  if (METADATA_HOSTS.includes(host)) return { ok: false, problem: "link_local" };

  if (isIpAddress(host)) {
    const kind = classifyIpAddress(host);
    if (kind === "link_local") return { ok: false, problem: "link_local" };
    if (kind === "privat" && !local) return { ok: false, problem: "private_adresse" };
  } else if (!local) {
    const internalName =
      host === "localhost" ||
      !host.includes(".") ||
      PRIVATE_SUFFIXES.some((suffix) => host.endsWith(suffix));
    if (internalName) return { ok: false, problem: "private_adresse" };
  }

  if (url.protocol === "http:" && !local) return { ok: false, problem: "protokoll" };
  return { ok: true, url };
}

/** Hinweise zu einer erlaubten Basis-URL, die die Oberfläche anzeigen soll. */
export type BaseUrlWarning = "unverschluesselt" | "lokale_adresse";

/** Warnhinweise für eine bereits geprüfte Basis-URL (nur bei Region `local` relevant). */
export function baseUrlWarnings(url: URL, region: Region): BaseUrlWarning[] {
  if (region !== "local") return [];
  const warnings: BaseUrlWarning[] = [];
  if (url.protocol === "http:") warnings.push("unverschluesselt");
  warnings.push("lokale_adresse");
  return warnings;
}
