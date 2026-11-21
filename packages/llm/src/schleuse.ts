/**
 * PaiBot – Anbindung der Datenschleuse als getrennter Dienst: Einstellungen, Erreichbarkeit,
 * Modellnamen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { type ProviderTemplateKey, providerTemplateKeySchema } from "@paibot/shared/objekte";
import { classifyIpAddress, isIpAddress, METADATA_HOSTS, normalizeHost } from "./address";
import { createEgressFetch, egressTargetOf } from "./egress";
import { SCHLEUSE_ERROR_BODY_LIMIT, schleuseFailureCode } from "./errors";

const DEFAULT_HEALTH_TIMEOUT_MS = 3_000;

/** Namen der Umgebungsvariablen für die Datenschleuse. */
export const SCHLEUSE_ENV = {
  url: "SCHLEUSE_URL",
  key: "SCHLEUSE_KEY",
  keyPath: "SCHLEUSE_SCHLUESSEL_WEG",
} as const;

/**
 * Wie der Schlüssel des Anbieters zur Datenschleuse kommt: `anfrage` – PaiBot schickt ihn mit jeder
 * Anfrage im Körper mit (Feld `api_key`), die Datenschleuse hält keinen; `umgebung` – die
 * Datenschleuse liest ihn aus ihrer eigenen Umgebung, PaiBot schickt ihn nicht mit.
 */
export const SCHLEUSE_KEY_PATHS = ["anfrage", "umgebung"] as const;
export type SchleuseKeyPath = (typeof SCHLEUSE_KEY_PATHS)[number];

/** Standard, wenn `SCHLEUSE_SCHLUESSEL_WEG` fehlt. */
export const DEFAULT_SCHLEUSE_KEY_PATH: SchleuseKeyPath = "anfrage";

/** Pfad der Lebenszeichen-Prüfung, die ohne Schlüssel antwortet (neben `/v1`). */
export const SCHLEUSE_LIVENESS_PATH = "/health/liveliness";

/** Kopfzeile mit der Sitzungs-ID (= ID der Unterhaltung) für die Datenschleuse. */
export const SCHLEUSE_SESSION_HEADER = "x-litellm-session-id";

/** Verbindung zur Datenschleuse aus der Umgebung. Der Schlüssel verlässt den Server nie. */
export interface SchleuseConnection {
  /** OpenAI-kompatible Basis-URL, z. B. `http://datenschleuse:4000/v1`. */
  baseUrl: string;
  apiKey: string;
  /** Weg des Anbieter-Schlüssels; fehlt er, gilt `DEFAULT_SCHLEUSE_KEY_PATH`. */
  providerKeyPath?: SchleuseKeyPath;
}

/** Zustand der Datenschleuse für Route und Tor. */
export interface SchleuseStatus {
  installed: boolean;
  reachable: boolean;
}

/**
 * Liest `SCHLEUSE_URL`, `SCHLEUSE_KEY` und `SCHLEUSE_SCHLUESSEL_WEG` (Standard `anfrage`). Fehlt
 * `SCHLEUSE_URL`, ist die Datenschleuse nicht installiert (`undefined`). Fehler: `TypeError`, wenn
 * die URL ungültig ist, der Schlüssel bei gesetzter URL fehlt oder der Weg unbekannt ist.
 */
export function schleuseFromEnv(
  env: Readonly<Record<string, string | undefined>>,
): SchleuseConnection | undefined {
  const rawUrl = env[SCHLEUSE_ENV.url]?.trim();
  if (rawUrl === undefined || rawUrl === "") return undefined;
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new TypeError(`${SCHLEUSE_ENV.url} ist keine gültige URL`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new TypeError(`${SCHLEUSE_ENV.url} muss mit http oder https beginnen`);
  }
  if (url.username !== "" || url.password !== "") {
    throw new TypeError(`${SCHLEUSE_ENV.url} darf keine Zugangsdaten enthalten`);
  }
  const host = normalizeHost(url.hostname);
  if (
    METADATA_HOSTS.includes(host) ||
    (isIpAddress(host) && classifyIpAddress(host) === "link_local")
  ) {
    throw new TypeError(`${SCHLEUSE_ENV.url} zeigt auf eine nicht erlaubte Adresse`);
  }
  const apiKey = env[SCHLEUSE_ENV.key]?.trim();
  if (apiKey === undefined || apiKey === "") {
    throw new TypeError(`${SCHLEUSE_ENV.key} fehlt`);
  }
  const rawPath = env[SCHLEUSE_ENV.keyPath]?.trim();
  const providerKeyPath =
    rawPath === undefined || rawPath === "" ? DEFAULT_SCHLEUSE_KEY_PATH : rawPath;
  if (!isSchleuseKeyPath(providerKeyPath)) {
    throw new TypeError(`${SCHLEUSE_ENV.keyPath} muss ${SCHLEUSE_KEY_PATHS.join(" oder ")} sein`);
  }
  url.search = "";
  url.hash = "";
  return { baseUrl: url.href.replace(/\/+$/, ""), apiKey, providerKeyPath };
}

function isSchleuseKeyPath(value: string): value is SchleuseKeyPath {
  return (SCHLEUSE_KEY_PATHS as readonly string[]).includes(value);
}

/** Weg des Anbieter-Schlüssels einer Verbindung (Standard, wenn nicht angegeben). */
export function schleuseKeyPathOf(connection: SchleuseConnection): SchleuseKeyPath {
  return connection.providerKeyPath ?? DEFAULT_SCHLEUSE_KEY_PATH;
}

/**
 * Zustand der Datenschleuse aus zwei Prüfungen:
 * - `aus` – nicht eingerichtet (keine Verbindung),
 * - `nicht_erreichbar` – die Lebenszeichen-Prüfung antwortet nicht mit Erfolg (Zeitgrenze, kein
 *   Dienst, Fehlerantwort), oder die Modell-Liste scheitert aus einem anderen Grund als dem Schlüssel,
 * - `schluessel_falsch` – sie läuft, lehnt aber den Zugangsschlüssel ab,
 * - `bereit` – sie läuft und nimmt den Schlüssel an.
 */
export type SchleuseHealthState = "aus" | "nicht_erreichbar" | "schluessel_falsch" | "bereit";

export interface SchleuseHealth {
  state: SchleuseHealthState;
}

export interface SchleuseHealthOptions {
  /** Grund-`fetch` (nur für Tests); sonst festgenagelte Verbindung über die Ausgangs-Liste. */
  fetch?: typeof fetch;
  /** Zeitgrenze je Prüfung in Millisekunden (Standard 3 000). */
  timeoutMs?: number;
  signal?: AbortSignal;
}

/** Adresse der Lebenszeichen-Prüfung: neben dem letzten Pfad-Teil `/v1` der Basis-URL. */
function livenessUrl(baseUrl: string): string {
  const url = new URL(baseUrl);
  url.pathname = `${url.pathname.replace(/\/+$/, "").replace(/\/v1$/, "")}${SCHLEUSE_LIVENESS_PATH}`;
  return url.href;
}

/**
 * Prüft die Datenschleuse in zwei Stufen, jede mit eigener Zeitgrenze: läuft sie
 * (`GET /health/liveliness`, ohne Schlüssel) und stimmt der Schlüssel (`GET /v1/models` mit ihrem
 * Schlüssel)? Die Verbindung geht nur an ihre Adresse (Ausgangs-Liste, festgenagelt, private
 * Adressen im eigenen Netz erlaubt), ohne Weiterleitungen. Antworten werden nicht gelesen, nur ihr
 * Status (bei HTTP 400 die Kennung im Körper). Wirft nie.
 */
export async function probeSchleuse(
  connection: SchleuseConnection | undefined,
  options: SchleuseHealthOptions = {},
): Promise<SchleuseHealth> {
  if (!connection) return { state: "aus" };
  try {
    const doFetch =
      options.fetch ??
      createEgressFetch([{ ...egressTargetOf(connection.baseUrl), allowPrivate: true }]);
    const timeoutMs = options.timeoutMs ?? DEFAULT_HEALTH_TIMEOUT_MS;
    const signalFor = () => {
      const timeout = AbortSignal.timeout(timeoutMs);
      return options.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
    };

    const live = await doFetch(livenessUrl(connection.baseUrl), {
      method: "GET",
      headers: { accept: "application/json" },
      redirect: "error",
      signal: signalFor(),
    });
    await discard(live);
    if (!live.ok) return { state: "nicht_erreichbar" };

    const models = await doFetch(`${connection.baseUrl}/models`, {
      method: "GET",
      headers: { accept: "application/json", authorization: `Bearer ${connection.apiKey}` },
      redirect: "error",
      signal: signalFor(),
    });
    if (models.ok) {
      await discard(models);
      return { state: "bereit" };
    }
    if (models.status === 401 || models.status === 403) {
      await discard(models);
      return { state: "schluessel_falsch" };
    }
    if (models.status === 400) {
      const code = schleuseFailureCode(400, await readLimited(models, SCHLEUSE_ERROR_BODY_LIMIT));
      return { state: code === "schluessel_ungueltig" ? "schluessel_falsch" : "nicht_erreichbar" };
    }
    await discard(models);
    return { state: "nicht_erreichbar" };
  } catch {
    return { state: "nicht_erreichbar" };
  }
}

async function discard(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}

/**
 * Liest höchstens `limit` Bytes eines Antwort-Körpers als Text; ist er länger, `undefined`.
 * Der Rest wird verworfen.
 */
export async function readLimited(response: Response, limit: number): Promise<string | undefined> {
  const reader = response.body?.getReader();
  if (reader === undefined) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) return undefined;
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  return new TextDecoder().decode(Buffer.concat(chunks));
}

/**
 * Kurzform von `probeSchleuse` für Route und Tor: erreichbar heißt `bereit` (sie läuft und nimmt
 * den Schlüssel an). Ohne Verbindung: `{ installed: false, reachable: false }`. Wirft nie.
 */
export async function checkSchleuseHealth(
  connection: SchleuseConnection | undefined,
  options?: SchleuseHealthOptions,
): Promise<SchleuseStatus> {
  if (!connection) return { installed: false, reachable: false };
  const { state } = await probeSchleuse(connection, options);
  return { installed: true, reachable: state === "bereit" };
}

/**
 * Name eines Modells in der Konfiguration der Datenschleuse: `<anbieter>/<slug>`, z. B.
 * `eurouter/mistral-small-latest`. `providerKey` ist der Schlüssel der Vorlage aus
 * `PROVIDER_TEMPLATE_KEYS` (z. B. `eurouter`); ein anderer Wert wirft einen `TypeError`.
 */
export function schleuseModelName(providerKey: ProviderTemplateKey, slug: string): string {
  if (!providerTemplateKeySchema.safeParse(providerKey).success) {
    throw new TypeError("Ungültiger Anbieter-Schlüssel");
  }
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Steuerzeichen sollen abgelehnt werden
  if (slug === "" || /[\u0000-\u001f\u007f\s]/.test(slug))
    throw new TypeError("Ungültiger Modellname");
  return `${providerKey}/${slug}`;
}
