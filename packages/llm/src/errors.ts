/**
 * PaiBot – Fehler von Anbietern und der Datenschleuse auf feste Codes abbilden.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { MotorErrorCode } from "@paibot/shared/motor";
import { notImplemented } from "@paibot/stub";

/**
 * Bildet einen Fehler beim Aufruf eines Anbieters ab: HTTP 401/403 → `schluessel_ungueltig`,
 * 429 → `limit_erreicht`, Antwort der Datenschleuse mit Block → `schleuse_blockiert`,
 * Netzfehler, Zeitüberschreitung, 5xx und `EgressBlockedError` → `anbieter_nicht_erreichbar`,
 * Abbruch über ein Signal → `unterbrochen`, alles andere → `intern`.
 *
 * Akzeptiert `Response`, Fehler von `fetch` und Fehlerobjekte mit `status`/`statusCode`. Rein.
 */
export function mapProviderError(error: unknown): MotorErrorCode {
  return notImplemented("llm.mapProviderError", error);
}

/** Ob ein Fehlercode einen späteren neuen Versuch sinnvoll macht (`limit_erreicht`, `anbieter_nicht_erreichbar`). */
export function isRetryable(code: MotorErrorCode): boolean {
  return code === "limit_erreicht" || code === "anbieter_nicht_erreichbar";
}
