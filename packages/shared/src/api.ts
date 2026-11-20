/**
 * PaiBot – Antwort-Hülle der API: Schemas und Helfer für Erfolg und Fehler.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { z } from "zod";
import {
  ERROR_STATUS,
  type ErrorCode,
  errorCodeSchema,
  type FieldError,
  fieldErrorSchema,
  isPaiBotError,
} from "./errors";
import { errorText, errorWayOut } from "./i18n";
import type { Locale } from "./locale";

/**
 * Jede JSON-Antwort der API hat diese Hülle. Ausgenommen sind `/api/health`, der Ereignis-Strom
 * und der Download des Beleg-Exports.
 */
export function apiOk<T extends z.ZodType>(daten: T) {
  return z.strictObject({ ok: z.literal(true), daten });
}

export const apiErrorDetailSchema = z.strictObject({
  code: errorCodeSchema,
  text: z.string().min(1),
  ausweg: z.string().min(1).optional(),
  felder: z.array(fieldErrorSchema).min(1).optional(),
});
export type ApiErrorDetail = z.infer<typeof apiErrorDetailSchema>;

export const apiError = z.strictObject({ ok: z.literal(false), fehler: apiErrorDetailSchema });
export type ApiErrorBody = z.infer<typeof apiError>;

/** Schema für eine Antwort, die Erfolg mit `daten` oder einen Fehler enthalten kann. */
export function apiResponse<T extends z.ZodType>(daten: T) {
  return z.discriminatedUnion("ok", [apiOk(daten), apiError]);
}

export type ApiOkBody<T> = { ok: true; daten: T };
export type ApiResponse<T> = ApiOkBody<T> | ApiErrorBody;

/** Baut die Erfolgs-Hülle. */
export function okBody<T>(daten: T): ApiOkBody<T> {
  return { ok: true, daten };
}

export interface ErrorBodyOptions {
  text?: string;
  ausweg?: string;
  felder?: FieldError[];
  locale?: Locale;
}

/**
 * Baut die Fehler-Hülle. Ohne eigenen Text gelten Standardtext und Standard-Ausweg des Codes.
 * Leere oder fehlende optionale Felder werden weggelassen.
 */
export function errorBody(code: ErrorCode, options: ErrorBodyOptions = {}): ApiErrorBody {
  const fehler: ApiErrorDetail = { code, text: options.text ?? errorText(code, options.locale) };
  const ausweg = options.ausweg ?? errorWayOut(code, options.locale);
  if (ausweg !== undefined) fehler.ausweg = ausweg;
  if (options.felder !== undefined && options.felder.length > 0) fehler.felder = options.felder;
  return { ok: false, fehler };
}

/** HTTP-Status, Kopfzeilen und Körper für einen beliebigen Fehler. Unbekannte Fehler werden `intern`. */
export function apiErrorFrom(
  error: unknown,
  locale?: Locale,
): { status: number; headers: Record<string, string>; body: ApiErrorBody } {
  if (!isPaiBotError(error)) {
    return { status: ERROR_STATUS.intern, headers: {}, body: errorBody("intern", { locale }) };
  }
  const headers: Record<string, string> = {};
  if (error.retryAfterSeconds !== undefined) {
    headers["Retry-After"] = String(Math.max(0, Math.ceil(error.retryAfterSeconds)));
  }
  const options: ErrorBodyOptions = { locale };
  if (error.text !== undefined) options.text = error.text;
  if (error.ausweg !== undefined) options.ausweg = error.ausweg;
  if (error.felder !== undefined) options.felder = error.felder;
  return { status: error.status, headers, body: errorBody(error.code, options) };
}
