/**
 * PaiBot – Modelle eines Anbieters abrufen und die Verbindung testen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { anzeigeText } from "@paibot/shared/anzeigetext";
import type { ErrorCode } from "@paibot/shared/fehler";
import {
  checkProviderBaseUrl,
  createEgressFetch,
  EgressBlockedError,
  providerEgressTarget,
} from "./egress";
import { mapProviderError, providerFailure } from "./errors";
import type { ResponseLimits } from "./pinned-fetch";
import { ROUTING_RULE_SLUG_PREFIX } from "./routing-rules";
import type { ProviderEndpoint } from "./templates";

/** Ein Modell aus der Liste des Anbieters. */
export interface ModelInfo {
  /** Name beim Anbieter, z. B. `mistral-small-latest`. */
  slug: string;
  displayName: string;
  contextWindow?: number;
}

export interface ProviderCallOptions {
  /** `fetch` mit Ausgangs-Liste; ohne Angabe baut die Funktion eines nur für `provider.baseUrl`. */
  fetch?: typeof fetch;
  signal?: AbortSignal;
  /** Höchstdauer in Millisekunden. */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_BODY_BYTES = 5_000_000;

/** Grenzen für die Modell-Liste: höchstens 5 MB entpackt, Fehlerkörper höchstens 16 KiB. */
export const MODEL_LIST_LIMITS: Readonly<ResponseLimits> = Object.freeze({
  maxBodyBytes: MAX_BODY_BYTES,
  maxErrorBodyBytes: 16 * 1024,
});
const MAX_MODELS = 5_000;
const MAX_SLUG_CHARS = 200;
/** Kennung eines Modells: sichtbare ASCII-Zeichen ohne Leerzeichen, höchstens 200. */
const MODEL_SLUG_PATTERN = /^[\x21-\x7e]{1,200}$/;
/** Sichtbare ASCII-Zeichen ohne Leerzeichen; alles andere ließe sich nicht als Kopfzeile senden. */
const API_KEY_PATTERN = /^[\x21-\x7e]{1,4096}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeEndpoint(entry: unknown): string {
  return typeof entry === "string" ? entry.toLowerCase().replaceAll("/", ".") : "";
}

/**
 * Filter: Text zu Text, Chat-Endpunkt, Streaming. Fehlende Zusatzfelder zählen als passend. Zwei
 * Formen von Zusatzfeldern: wie bei EUrouter (`architecture.modality`, `supported_api_endpoints`,
 * `supported_parameters`) und wie bei Mistral (`capabilities.completion_chat`, `archived`).
 */
function suitable(item: Record<string, unknown>): boolean {
  if (item.archived === true) return false;
  const capabilities = item.capabilities;
  if (isRecord(capabilities) && capabilities.completion_chat === false) return false;
  const architecture = item.architecture;
  if (isRecord(architecture) && typeof architecture.modality === "string") {
    if (architecture.modality !== "text->text") return false;
  }
  const endpoints = item.supported_api_endpoints;
  if (Array.isArray(endpoints)) {
    if (!endpoints.some((entry) => normalizeEndpoint(entry).endsWith("chat.completions"))) {
      return false;
    }
  }
  const parameters = item.supported_parameters;
  if (Array.isArray(parameters) && !parameters.includes("stream")) return false;
  return true;
}

function contextWindowOf(item: Record<string, unknown>): number | undefined {
  const topProvider = isRecord(item.top_provider) ? item.top_provider : {};
  for (const candidate of [
    item.context_length,
    item.context_window,
    item.max_context_length,
    topProvider.context_length,
  ]) {
    if (typeof candidate === "number" && Number.isInteger(candidate) && candidate > 0) {
      return candidate;
    }
  }
  return undefined;
}

function toModels(payload: unknown): ModelInfo[] {
  if (!isRecord(payload) || !Array.isArray(payload.data))
    throw providerFailure("anbieter_nicht_erreichbar");
  const bySlug = new Map<string, ModelInfo>();
  for (const item of payload.data.slice(0, MAX_MODELS)) {
    if (!isRecord(item)) continue;
    const id = item.id;
    if (typeof id !== "string" || !MODEL_SLUG_PATTERN.test(id)) continue;
    // Diese Vorsilbe steht für Routing-Regeln; ein Modell gleichen Namens wäre eine Verwechslung.
    if (id.startsWith(ROUTING_RULE_SLUG_PREFIX)) continue;
    if (!suitable(item) || bySlug.has(id)) continue;
    const name = anzeigeText(item.name, MAX_SLUG_CHARS) ?? id;
    const info: ModelInfo = { slug: id, displayName: name };
    const contextWindow = contextWindowOf(item);
    if (contextWindow !== undefined) info.contextWindow = contextWindow;
    bySlug.set(id, info);
  }
  return [...bySlug.values()].sort(
    (a, b) =>
      a.displayName.localeCompare(b.displayName, "de", { sensitivity: "base" }) ||
      a.slug.localeCompare(b.slug),
  );
}

/** Liest den Text einer Antwort, höchstens `MAX_BODY_BYTES` Byte. */
async function readLimited(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => undefined);
      throw providerFailure("limit_erreicht");
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    all.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(all);
}

/** `<baseUrl>/models`, ohne Abfrage und Anker. */
function modelsUrl(baseUrl: URL): URL {
  const url = new URL(baseUrl.href);
  url.search = "";
  url.hash = "";
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/models`;
  return url;
}

/**
 * Ruft `GET <baseUrl>/models` ab und filtert auf Modelle, die Text zu Text können, den
 * Chat-Endpunkt anbieten und streamen (bei EUrouter: `architecture.modality = "text->text"`,
 * `supported_api_endpoints` mit `chat.completions`, `supported_parameters` mit `stream`; fehlen
 * diese Zusatzfelder, gilt ein Modell als passend). Sortiert nach `displayName`.
 *
 * `apiKey` ist optional (EUrouter liefert die Liste auch ohne Schlüssel) und wird nur als
 * `Authorization: Bearer` gesendet.
 *
 * Fehler: `PaiBotError` mit `anbieter_nicht_erreichbar`, `schluessel_ungueltig`, `limit_erreicht`
 * oder `unterbrochen` (Abbruch über das Signal), über `mapProviderError`. Schlüssel erscheinen
 * nie in Fehlern oder Logs.
 */
export async function fetchModels(
  provider: ProviderEndpoint,
  apiKey: string | undefined,
  options: ProviderCallOptions = {},
): Promise<ModelInfo[]> {
  const check = checkProviderBaseUrl(provider.baseUrl, provider.region);
  if (!check.ok) throw providerFailure("anbieter_nicht_erreichbar");

  const key = apiKey?.trim();
  if (key !== undefined && key !== "" && !API_KEY_PATTERN.test(key)) {
    throw providerFailure("schluessel_ungueltig");
  }

  const doFetch =
    options.fetch ??
    createEgressFetch([providerEgressTarget(check.url.href, provider.region)], undefined, {
      limits: MODEL_LIST_LIMITS,
    });
  const timeout = AbortSignal.timeout(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const signal = options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
  const headers: Record<string, string> = { accept: "application/json" };
  if (key) headers.authorization = `Bearer ${key}`;

  try {
    const response = await doFetch(modelsUrl(check.url), { method: "GET", headers, signal });
    if (!response.ok) {
      await response.body?.cancel().catch(() => undefined);
      throw providerFailure(mapProviderError(response));
    }
    const text = await readLimited(response);
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw providerFailure("anbieter_nicht_erreichbar");
    }
    return toModels(payload);
  } catch (error) {
    if (options.signal?.aborted) throw providerFailure("unterbrochen");
    if (error instanceof Error && error.name === "PaiBotError") throw error;
    if (provider.region === "local" && blockedAddress(error)) throw new NotLocalError();
    throw providerFailure(mapProviderError(error));
  }
}

/**
 * Ein „lokaler“ Anbieter, dessen Name auf eine Adresse außerhalb des eigenen Rechners und Netzes
 * zeigt. Es wurde nichts gesendet.
 */
export class NotLocalError extends Error {
  constructor() {
    super("Die Adresse liegt nicht im eigenen Rechner oder Netz.");
    this.name = "NotLocalError";
  }
}

function blockedAddress(error: unknown): boolean {
  for (let current = error, depth = 0; depth < 5; depth++) {
    if (current instanceof EgressBlockedError) return current.reason === "adresse_nicht_erlaubt";
    if (typeof current !== "object" || current === null) return false;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** Ergebnis des Verbindungstests. Wirft nicht, sondern meldet den Fehlercode. */
export type ConnectionTestResult =
  | { ok: true; models: ModelInfo[] }
  | {
      ok: false;
      code: Extract<
        ErrorCode,
        "anbieter_nicht_erreichbar" | "schluessel_ungueltig" | "limit_erreicht"
      >;
      /**
       * `nicht_lokal`: Ort „lokal“, aber die Adresse (oder die Auflösung ihres Namens) liegt nicht
       * im eigenen Rechner oder Netz; es wurde nichts gesendet.
       */
      detail?: "nicht_lokal";
    };

/**
 * Prüft, ob der Anbieter mit diesem Schlüssel erreichbar ist, und liefert dabei die gefilterte
 * Modell-Liste (für die Modell-Wahl direkt danach). Führt keinen kostenpflichtigen Modell-Aufruf aus.
 */
export async function testConnection(
  provider: ProviderEndpoint,
  apiKey: string | undefined,
  options?: ProviderCallOptions,
): Promise<ConnectionTestResult> {
  const check = checkProviderBaseUrl(provider.baseUrl, provider.region);
  if (!check.ok && check.problem === "nicht_lokal") {
    return { ok: false, code: "anbieter_nicht_erreichbar", detail: "nicht_lokal" };
  }
  try {
    return { ok: true, models: await fetchModels(provider, apiKey, options) };
  } catch (error) {
    if (error instanceof NotLocalError) {
      return { ok: false, code: "anbieter_nicht_erreichbar", detail: "nicht_lokal" };
    }
    const code = mapProviderError(error);
    if (code === "schluessel_ungueltig" || code === "limit_erreicht") return { ok: false, code };
    return { ok: false, code: "anbieter_nicht_erreichbar" };
  }
}
