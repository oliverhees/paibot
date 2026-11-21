/**
 * PaiBot – `fetch` des Modell-Zugangs auf der Route über die Datenschleuse.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { PaiBotError } from "@paibot/shared/fehler";
import { providerFailure, SCHLEUSE_ERROR_BODY_LIMIT, schleuseFailureCode } from "./errors";
import { readLimited } from "./schleuse";

/** Pfad des Chat-Endpunkts unter der Basis-URL der Datenschleuse. */
export const SCHLEUSE_CHAT_PATH = "/chat/completions";

/**
 * Felder im Körper einer Anfrage, mit denen die Datenschleuse Ziel oder Schlüssel des Anbieters je
 * Anfrage umstellen würde. Auf dem Weg `anfrage` setzt nur PaiBot `api_key`; die übrigen werden
 * entfernt, damit der Schlüssel nur an den Anbieter geht, den die Datenschleuse eingerichtet hat.
 */
export const SCHLEUSE_CLIENT_ROUTING_FIELDS = [
  "api_key",
  "api_base",
  "base_url",
  "api_version",
  "user_config",
] as const;

export interface SchleuseFetchOptions {
  /** `fetch` unter der Ausgangs-Liste (nur die Adresse der Datenschleuse). */
  guarded: typeof fetch;
  /** Basis-URL der Datenschleuse, z. B. `http://datenschleuse:4000/v1`. */
  baseUrl: string;
  /** Zugangsschlüssel der Datenschleuse; geht als `authorization: Bearer …` mit. */
  schleuseKey: string;
  /** Entschlüsselter Schlüssel des Anbieters für den Weg `anfrage`; leer = nicht mitschicken. */
  providerKey: string;
  /** Prüft vor jedem Abruf, ob der Zugang noch gilt. */
  stillAllowed: () => boolean;
}

/**
 * Baut das `fetch` für die Route `schleuse`:
 * - `authorization` trägt immer den Schlüssel der Datenschleuse (mitgegebene Werte werden ersetzt).
 * - Mit `providerKey` (Weg `anfrage`) bekommt jede POST-Anfrage an den Chat-Endpunkt den Schlüssel
 *   des Anbieters als `api_key` in den JSON-Körper; Felder aus `SCHLEUSE_CLIENT_ROUTING_FIELDS`
 *   werden vorher entfernt, `content-length` stimmt, Weiterleitungen sind dann verboten. Ein Körper,
 *   der kein JSON-Objekt ist, wird nicht gesendet (`intern`).
 * - Eine Fehlerantwort der Datenschleuse wird hier abgebildet (`schleuseFailureCode`): Der Abruf
 *   wirft einen `PaiBotError` mit festem Code und Standardtext, ohne Ursache und ohne ein Wort aus
 *   ihrer Meldung (sie kann eine Begründung mit Inhalt der Anfrage enthalten).
 */
export function createSchleuseFetch(options: SchleuseFetchOptions): typeof fetch {
  const { guarded, schleuseKey, providerKey, stillAllowed } = options;
  const chatUrl = new URL(`${options.baseUrl.replace(/\/+$/, "")}${SCHLEUSE_CHAT_PATH}`);

  return async (input, init) => {
    if (!stillAllowed()) throw providerFailure("abgelehnt");
    const isRequest = input instanceof Request;
    const url = new URL(isRequest ? input.url : typeof input === "string" ? input : input.href);
    const method = (init?.method ?? (isRequest ? input.method : "GET")).toUpperCase();
    const headers = new Headers(init?.headers ?? (isRequest ? input.headers : undefined));
    headers.set("authorization", `Bearer ${schleuseKey}`);

    let outgoing: RequestInit = { ...init, method, headers };
    if (isRequest) {
      outgoing.signal = init?.signal ?? input.signal;
      outgoing.redirect = init?.redirect ?? input.redirect;
    }
    if (providerKey !== "" && method === "POST" && isChatEndpoint(url, chatUrl)) {
      const raw = init?.body ?? (isRequest ? await input.clone().text() : undefined);
      const body = withProviderKey(raw, providerKey);
      headers.delete("content-length");
      headers.set("content-type", "application/json");
      outgoing = { ...outgoing, body, redirect: "error" };
    } else if (isRequest && init?.body === undefined && method !== "GET" && method !== "HEAD") {
      outgoing.body = await input.clone().arrayBuffer();
    }

    const response = await guarded(url.href, outgoing);
    if (response.ok) return response;
    throw await failureOf(response);
  };
}

function isChatEndpoint(url: URL, chatUrl: URL): boolean {
  return url.origin === chatUrl.origin && url.pathname.replace(/\/+$/, "") === chatUrl.pathname;
}

/** Setzt `api_key` in einen JSON-Körper; alles andere als ein JSON-Objekt wird nicht gesendet. */
function withProviderKey(raw: BodyInit | null | undefined, providerKey: string): string {
  let text: string;
  if (typeof raw === "string") text = raw;
  else if (raw instanceof ArrayBuffer || ArrayBuffer.isView(raw)) {
    const bytes =
      raw instanceof ArrayBuffer
        ? new Uint8Array(raw)
        : new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } else {
    throw providerFailure("intern");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw providerFailure("intern");
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw providerFailure("intern");
  }
  const body = { ...(parsed as Record<string, unknown>) };
  for (const field of SCHLEUSE_CLIENT_ROUTING_FIELDS) delete body[field];
  body.api_key = providerKey;
  return JSON.stringify(body);
}

/** Fehler zu einer Fehlerantwort der Datenschleuse: nur der Code, kein Text aus der Antwort. */
async function failureOf(response: Response): Promise<PaiBotError> {
  let body: string | undefined;
  try {
    body = await readLimited(response, SCHLEUSE_ERROR_BODY_LIMIT);
  } catch (error) {
    // Abbruch beim Lesen bleibt ein Abbruch; alles andere zählt nur nach dem Status.
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    body = undefined;
  }
  return providerFailure(schleuseFailureCode(response.status, body));
}
