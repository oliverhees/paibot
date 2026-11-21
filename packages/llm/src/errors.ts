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
import type { Route } from "@paibot/shared/objekte";
import { errorText, errorWayOut } from "@paibot/shared/texte";
import { EgressBlockedError } from "./egress";
import { ResponseTooLargeError } from "./pinned-fetch";

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

/** Wie die Datenschleuse eine blockierte Anfrage im Text ihrer Fehlermeldung beschreibt. */
const SCHLEUSE_BLOCK_TEXT =
  /blockiert|fail[\s_-]?closed|nicht an die cloud|datenschleuse[\s_-]?blocked/i;
/** Längster Antwort-Körper, den die Abbildung für die Datenschleuse überhaupt ansieht. */
export const SCHLEUSE_ERROR_BODY_LIMIT = 64 * 1024;

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

  const record = error as Record<string, unknown>;
  const status = statusOf(error);
  if (status !== undefined) {
    // Erfolgreiche Antwort, danach Fehler (z. B. Strom bricht ab): Die Ursache entscheidet.
    if (status >= 200 && status < 300) {
      const inner =
        depth < MAX_DEPTH && "cause" in error ? mapValue(record.cause, depth + 1) : undefined;
      return inner ?? "intern";
    }
    return mapStatus(status);
  }

  const name = typeof record.name === "string" ? record.name : "";
  if (name === "TimeoutError") return "anbieter_nicht_erreichbar";
  if (name === "AbortError") return "unterbrochen";
  if (typeof record.code === "string" && NETWORK_CODES.has(record.code)) {
    return "anbieter_nicht_erreichbar";
  }
  if (error instanceof TypeError && /fetch failed|network|terminated/i.test(error.message)) {
    return "anbieter_nicht_erreichbar";
  }
  if (depth < MAX_DEPTH && "cause" in error) return mapValue(record.cause, depth + 1);
  return undefined;
}

/**
 * Wurde eine Antwort abgebrochen, weil sie zu groß war (`ResponseTooLargeError` irgendwo in der
 * Kette der Ursachen, auch eingepackt von der Modell-Bibliothek)? Dann hilft kein neuer Versuch.
 */
export function isResponseTooLarge(error: unknown): boolean {
  for (let current = error, depth = 0; depth <= MAX_DEPTH; depth++) {
    if (current === null || typeof current !== "object") return false;
    if (current instanceof ResponseTooLargeError) return true;
    const record = current as Record<string, unknown>;
    if (record.name === "ResponseTooLargeError" && record.code === "antwort_zu_gross") return true;
    current = record.cause;
  }
  return false;
}

/** Woher ein Fehler kam; bei Route `schleuse` gilt die Abbildung für die Datenschleuse zuerst. */
export interface ProviderErrorContext {
  route?: Route;
}

/**
 * Code für eine Fehlerantwort der Datenschleuse, nur aus Status und Kennungen im Körper:
 * HTTP 500 mit `error.type` `None` und einer Meldung, die einen Block beschreibt →
 * `schleuse_blockiert`; HTTP 400 mit `error.type` `no_db_connection` (falscher Zugangsschlüssel bei
 * einer Datenschleuse ohne eigene Datenbank) → `schluessel_ungueltig`; alles andere nach dem Status
 * wie bei einem Anbieter. Der Körper wird nur geprüft, nie zurückgegeben oder aufbewahrt.
 */
export function schleuseFailureCode(status: number, body: string | undefined): MotorErrorCode {
  const error = schleuseErrorOf(body);
  if (error !== undefined) {
    if (status === 500 && error.type === "None" && SCHLEUSE_BLOCK_TEXT.test(error.message)) {
      return "schleuse_blockiert";
    }
    if (status === 400 && error.type === "no_db_connection") return "schluessel_ungueltig";
  }
  if (status >= 200 && status < 300) return "intern";
  return mapStatus(status);
}

/** Liest `error.type` und `error.message` aus einem Körper im OpenAI-Format; sonst `undefined`. */
function schleuseErrorOf(body: string | undefined): { type: string; message: string } | undefined {
  if (body === undefined || body === "" || body.length > SCHLEUSE_ERROR_BODY_LIMIT)
    return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return undefined;
  }
  if (parsed === null || typeof parsed !== "object") return undefined;
  const error = (parsed as Record<string, unknown>).error;
  if (error === null || typeof error !== "object") return undefined;
  const { type, message } = error as Record<string, unknown>;
  return {
    type: typeof type === "string" ? type : "",
    message: typeof message === "string" ? message : "",
  };
}

/** Status und Körper aus einem Fehler der Bibliothek (`statusCode`/`status`, `responseBody`). */
function schleuseCodeOf(error: unknown): MotorErrorCode | undefined {
  for (let current = error, depth = 0; depth < MAX_DEPTH; depth++) {
    if (current === null || typeof current !== "object") return undefined;
    if (current instanceof PaiBotError) return undefined;
    const status = statusOf(current);
    if (status !== undefined) {
      if (status >= 200 && status < 300) return undefined;
      const body = (current as Record<string, unknown>).responseBody;
      return schleuseFailureCode(status, typeof body === "string" ? body : undefined);
    }
    current = (current as Record<string, unknown>).cause;
  }
  return undefined;
}

/**
 * Bildet einen Fehler beim Aufruf eines Anbieters ab: HTTP 401/403 → `schluessel_ungueltig`,
 * 402/429 → `limit_erreicht`, Antwort der Datenschleuse mit Block → `schleuse_blockiert`,
 * Netzfehler, Zeitüberschreitung, 404, 408, 5xx und `EgressBlockedError` →
 * `anbieter_nicht_erreichbar`, Abbruch über ein Signal → `unterbrochen`, alles andere → `intern`.
 * Ein Fehler mit Status 2xx (die Antwort hatte begonnen, dann brach z. B. der Strom ab) wird nach
 * seiner Ursache abgebildet: Verbindungsabbruch → `anbieter_nicht_erreichbar`, Abbruch →
 * `unterbrochen`; ohne erkennbare Ursache `intern`.
 *
 * Akzeptiert `Response`, Fehler von `fetch` und Fehlerobjekte mit `status`/`statusCode`. Rein.
 *
 * Eine Antwort, die PaiBot wegen ihrer Größe abgebrochen hat (`isResponseTooLarge`), ergibt
 * `limit_erreicht`; anders als ein Limit des Anbieters ist das nicht wiederholbar
 * (`isRetryableError`).
 *
 * Mit `{ route: "schleuse" }` gilt zuerst `schleuseFailureCode` (Status und `responseBody`): So
 * meldet die Datenschleuse einen Block (HTTP 500) und einen falschen Zugangsschlüssel (HTTP 400).
 * Der Modell-Zugang auf dieser Route (`resolveModel`) bildet ihre Fehlerantworten schon selbst ab
 * und wirft einen `PaiBotError` mit dem Code, ohne Text der Datenschleuse; ihn gibt diese Funktion
 * unverändert zurück. Ohne Route wird die Kennung `DatenschleuseBlocked` in den üblichen Feldern
 * erkannt.
 */
export function mapProviderError(
  error: unknown,
  context: ProviderErrorContext = {},
): MotorErrorCode {
  // Vor allem anderen: Der Fehler kann einen Status tragen (eingepackt von der Bibliothek).
  if (isResponseTooLarge(error)) return "limit_erreicht";
  if (context.route === "schleuse") {
    const code = schleuseCodeOf(error);
    if (code !== undefined) return code;
  }
  return mapValue(error, 0) ?? "intern";
}

/** Ob ein Fehlercode einen späteren neuen Versuch sinnvoll macht (`limit_erreicht`, `anbieter_nicht_erreichbar`). */
export function isRetryable(code: MotorErrorCode): boolean {
  return code === "limit_erreicht" || code === "anbieter_nicht_erreichbar";
}

/**
 * Ob ein neuer Versuch nach genau diesem Fehler sinnvoll ist: wie `isRetryable` für seinen Code,
 * aber nie nach einer zu großen Antwort.
 */
export function isRetryableError(error: unknown, context: ProviderErrorContext = {}): boolean {
  if (isResponseTooLarge(error)) return false;
  return isRetryable(mapProviderError(error, context));
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
