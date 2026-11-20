/**
 * PaiBot – Modelle eines Anbieters abrufen und die Verbindung testen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { ErrorCode } from "@paibot/shared/fehler";
import { notImplemented } from "@paibot/stub";
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

/**
 * Ruft `GET <baseUrl>/models` ab und filtert auf Modelle, die Text zu Text können, den
 * Chat-Endpunkt anbieten und streamen (bei EUrouter: `architecture.modality = "text->text"`,
 * `supported_api_endpoints` mit `chat.completions`, `supported_parameters` mit `stream`; fehlen
 * diese Zusatzfelder, gilt ein Modell als passend). Sortiert nach `displayName`.
 *
 * `apiKey` ist optional (EUrouter liefert die Liste auch ohne Schlüssel) und wird nur als
 * `Authorization: Bearer` gesendet.
 *
 * Fehler: `PaiBotError` mit `anbieter_nicht_erreichbar`, `schluessel_ungueltig` oder
 * `limit_erreicht` (über `mapProviderError`). Schlüssel erscheinen nie in Fehlern oder Logs.
 */
export function fetchModels(
  provider: ProviderEndpoint,
  apiKey: string | undefined,
  options?: ProviderCallOptions,
): Promise<ModelInfo[]> {
  return notImplemented("llm.fetchModels", provider, apiKey, options);
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
    };

/**
 * Prüft, ob der Anbieter mit diesem Schlüssel erreichbar ist, und liefert dabei die gefilterte
 * Modell-Liste (für die Modell-Wahl direkt danach). Führt keinen kostenpflichtigen Modell-Aufruf aus.
 */
export function testConnection(
  provider: ProviderEndpoint,
  apiKey: string | undefined,
  options?: ProviderCallOptions,
): Promise<ConnectionTestResult> {
  return notImplemented("llm.testConnection", provider, apiKey, options);
}
