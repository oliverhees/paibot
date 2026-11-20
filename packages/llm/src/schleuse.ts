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

import { notImplemented } from "@paibot/stub";

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
  return notImplemented("llm.schleuseFromEnv", env);
}

/**
 * Prüft, ob die Datenschleuse antwortet (Gesundheits-Endpunkt bzw. `GET /models` mit ihrem
 * Schlüssel), mit kurzer Zeitgrenze. Ohne Verbindung: `{ installed: false, reachable: false }`.
 * Wirft nie.
 */
export function checkSchleuseHealth(
  connection: SchleuseConnection | undefined,
  options?: { fetch?: typeof fetch; timeoutMs?: number; signal?: AbortSignal },
): Promise<SchleuseStatus> {
  return notImplemented("llm.checkSchleuseHealth", connection, options);
}

/**
 * Name eines Modells in der Konfiguration der Datenschleuse: `<anbieter>/<slug>`, z. B.
 * `eurouter/mistral-small-latest`. `providerKey` ist der Schlüssel der Vorlage (z. B. `eurouter`).
 */
export function schleuseModelName(providerKey: string, slug: string): string {
  return notImplemented("llm.schleuseModelName", providerKey, slug);
}
