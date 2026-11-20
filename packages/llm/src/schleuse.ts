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

import { classifyIpAddress, isIpAddress, METADATA_HOSTS, normalizeHost } from "./address";
import { createEgressFetch, egressTargetOf } from "./egress";

const DEFAULT_HEALTH_TIMEOUT_MS = 3_000;
const PROVIDER_KEY_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** Namen der Umgebungsvariablen für die Datenschleuse. */
export const SCHLEUSE_ENV = { url: "SCHLEUSE_URL", key: "SCHLEUSE_KEY" } as const;

/** Kopfzeile mit der Sitzungs-ID (= ID der Unterhaltung) für die Datenschleuse. */
export const SCHLEUSE_SESSION_HEADER = "x-litellm-session-id";

/** Verbindung zur Datenschleuse aus der Umgebung. Der Schlüssel verlässt den Server nie. */
export interface SchleuseConnection {
  /** OpenAI-kompatible Basis-URL, z. B. `http://datenschleuse:4000/v1`. */
  baseUrl: string;
  apiKey: string;
}

/** Zustand der Datenschleuse für Route und Tor. */
export interface SchleuseStatus {
  installed: boolean;
  reachable: boolean;
}

/**
 * Liest `SCHLEUSE_URL` und `SCHLEUSE_KEY`. Fehlt `SCHLEUSE_URL`, ist die Datenschleuse nicht
 * installiert (`undefined`). Fehler: `TypeError`, wenn die URL ungültig ist oder der Schlüssel
 * bei gesetzter URL fehlt.
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
  url.search = "";
  url.hash = "";
  return { baseUrl: url.href.replace(/\/+$/, ""), apiKey };
}

/**
 * Prüft, ob die Datenschleuse antwortet (Gesundheits-Endpunkt bzw. `GET /models` mit ihrem
 * Schlüssel), mit kurzer Zeitgrenze. Ohne Verbindung: `{ installed: false, reachable: false }`.
 * Wirft nie.
 */
export async function checkSchleuseHealth(
  connection: SchleuseConnection | undefined,
  options?: { fetch?: typeof fetch; timeoutMs?: number; signal?: AbortSignal },
): Promise<SchleuseStatus> {
  if (!connection) return { installed: false, reachable: false };
  try {
    const timeout = AbortSignal.timeout(options?.timeoutMs ?? DEFAULT_HEALTH_TIMEOUT_MS);
    const signal = options?.signal ? AbortSignal.any([timeout, options.signal]) : timeout;
    const doFetch =
      options?.fetch ??
      createEgressFetch([{ ...egressTargetOf(connection.baseUrl), allowPrivate: true }]);
    const response = await doFetch(`${connection.baseUrl}/models`, {
      method: "GET",
      headers: { accept: "application/json", authorization: `Bearer ${connection.apiKey}` },
      signal,
    });
    await response.body?.cancel().catch(() => undefined);
    return { installed: true, reachable: response.ok };
  } catch {
    return { installed: true, reachable: false };
  }
}

/**
 * Name eines Modells in der Konfiguration der Datenschleuse: `<anbieter>/<slug>`, z. B.
 * `eurouter/mistral-small-latest`. `providerKey` ist der Schlüssel der Vorlage (z. B. `eurouter`).
 */
export function schleuseModelName(providerKey: string, slug: string): string {
  if (!PROVIDER_KEY_PATTERN.test(providerKey)) throw new TypeError("Ungültiger Anbieter-Schlüssel");
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Steuerzeichen sollen abgelehnt werden
  if (slug === "" || /[\u0000-\u001f\u007f\s]/.test(slug))
    throw new TypeError("Ungültiger Modellname");
  return `${providerKey}/${slug}`;
}
