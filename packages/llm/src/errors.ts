/**
 * PaiBot – Fehler von Anbietern und der Datenschleuse auf feste Codes abbilden.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { type ErrorCode, PaiBotError } from "@paibot/shared/fehler";
import { MOTOR_ERROR_CODES, type MotorErrorCode } from "@paibot/shared/motor";
import { errorText, errorWayOut } from "@paibot/shared/texte";
import { EgressBlockedError } from "./egress";

const NETWORK_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ECONNABORTED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "EPIPE",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_SOCKET",
]);

const BLOCK_PATTERN = /datenschleuse[\s_-]?blocked|schleuse[\s_-]?blockiert/i;
const MAX_DEPTH = 5;

function statusOf(value: object): number | undefined {
  const record = value as Record<string, unknown>;
  for (const key of ["status", "statusCode"]) {
    const candidate = record[key];
    if (typeof candidate === "number" && Number.isInteger(candidate)) return candidate;
  }
  return undefined;
}

function mapStatus(status: number): MotorErrorCode {
  if (status === 401 || status === 403) return "schluessel_ungueltig";
  if (status === 402 || status === 429) return "limit_erreicht";
  if (status === 404 || status === 408 || status >= 500) return "anbieter_nicht_erreichbar";
  return "intern";
}

/** Sucht in den üblichen Feldern nach der Kennung eines Blocks der Datenschleuse. */
function looksBlocked(value: object): boolean {
  const record = value as Record<string, unknown>;
  const texts: unknown[] = [record.name, record.type, record.code, record.message];
  texts.push(record.responseBody, record.body);
  for (const nested of [record.data, record.error]) {
    if (nested && typeof nested === "object") {
      const inner = nested as Record<string, unknown>;
      texts.push(inner.type, inner.code, inner.message);
      const deeper = inner.error;
      if (deeper && typeof deeper === "object") {
        const d = deeper as Record<string, unknown>;
        texts.push(d.type, d.code, d.message);
      }
    }
  }
  return texts.some((text) => typeof text === "string" && BLOCK_PATTERN.test(text));
}

function mapValue(error: unknown, depth: number): MotorErrorCode | undefined {
  if (error === null || typeof error !== "object") return undefined;
  if (error instanceof PaiBotError) {
    return (MOTOR_ERROR_CODES as readonly string[]).includes(error.code)
      ? (error.code as MotorErrorCode)
      : undefined;
  }
  if (error instanceof EgressBlockedError) return "anbieter_nicht_erreichbar";
  if (looksBlocked(error)) return "schleuse_blockiert";

  const status = statusOf(error);
  if (status !== undefined) return mapStatus(status);

  const record = error as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name : "";
  if (name === "TimeoutError") return "anbieter_nicht_erreichbar";
  if (name === "AbortError") return "unterbrochen";
  if (typeof record.code === "string" && NETWORK_CODES.has(record.code)) {
    return "anbieter_nicht_erreichbar";
  }
  if (error instanceof TypeError && /fetch failed|network/i.test(error.message)) {
    return "anbieter_nicht_erreichbar";
  }
  if (depth < MAX_DEPTH && "cause" in error) return mapValue(record.cause, depth + 1);
  return undefined;
}

/**
 * Bildet einen Fehler beim Aufruf eines Anbieters ab: HTTP 401/403 → `schluessel_ungueltig`,
 * 402/429 → `limit_erreicht`, Antwort der Datenschleuse mit Block → `schleuse_blockiert`,
 * Netzfehler, Zeitüberschreitung, 404, 408, 5xx und `EgressBlockedError` →
 * `anbieter_nicht_erreichbar`, Abbruch über ein Signal → `unterbrochen`, alles andere → `intern`.
 *
 * Akzeptiert `Response`, Fehler von `fetch` und Fehlerobjekte mit `status`/`statusCode`. Rein.
 * Wie die Datenschleuse einen Block als HTTP-Antwort meldet, ist noch nicht gegen den laufenden
 * Dienst geprüft; erkannt wird die Kennung `DatenschleuseBlocked` in den üblichen Feldern.
 */
export function mapProviderError(error: unknown): MotorErrorCode {
  return mapValue(error, 0) ?? "intern";
}

/** Ob ein Fehlercode einen späteren neuen Versuch sinnvoll macht (`limit_erreicht`, `anbieter_nicht_erreichbar`). */
export function isRetryable(code: MotorErrorCode): boolean {
  return code === "limit_erreicht" || code === "anbieter_nicht_erreichbar";
}

/** Text-Schlüssel des Ausweg-Satzes zu einem Fehlercode (Katalog in `@paibot/shared/texte`). */
export function wayOutKeyOf(code: MotorErrorCode): `fehler.${MotorErrorCode}.ausweg` {
  return `fehler.${code}.ausweg`;
}

/** Fehler mit Standardtext und Ausweg aus dem Text-Katalog. Enthält nie Schlüssel oder Ursachen. */
export function providerFailure(code: ErrorCode): PaiBotError {
  const ausweg = errorWayOut(code);
  return new PaiBotError(code, {
    text: errorText(code),
    ...(ausweg === undefined ? {} : { ausweg }),
  });
}
