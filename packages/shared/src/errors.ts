/**
 * PaiBot – Fehlercodes mit HTTP-Status, Feld-Codes und die Fehlerklasse für alle Pakete.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { z } from "zod";
import { PATTERN_SOURCES } from "./grundtypen";
import { ERROR_STATUS_3 } from "./tor-fassung-3";
import { ERROR_STATUS_4 } from "./tor-fassung-4";
import { ERROR_STATUS_5 } from "./tor-fassung-5";

/** Schreibweise aller Codes: Kleinbuchstaben, Wörter mit Unterstrich, Umlaute ausgeschrieben. */
export const CODE_PATTERN = new RegExp(PATTERN_SOURCES.errorCode);

/** Alle Fehlercodes mit ihrem HTTP-Status. */
export const ERROR_STATUS = {
  nicht_angemeldet: 401,
  pruefzeichen_fehlt: 403,
  herkunft_falsch: 403,
  eingabe_ungueltig: 400,
  nicht_gefunden: 404,
  zu_viele_versuche: 429,
  passwort_falsch: 401,
  einrichtungs_code_falsch: 401,
  einrichtung_offen: 409,
  einrichtung_fertig: 409,
  regel_fehlt: 403,
  abgelehnt: 403,
  lauf_aktiv: 409,
  kein_modell: 409,
  schleuse_blockiert: 502,
  schleuse_nicht_installiert: 409,
  anbieter_nicht_erreichbar: 502,
  schluessel_ungueltig: 502,
  /** Die Datenschleuse lehnt den Schlüssel von PaiBot ab (nicht der Schlüssel des Anbieters). */
  schluessel_passt_nicht: 502,
  /** Die Antwort war größer als erlaubt; PaiBot hat sie abgebrochen. */
  antwort_zu_gross: 502,
  limit_erreicht: 429,
  /** Die gewählte Routing-Regel gibt es beim Anbieter nicht (mehr) oder sie ist ausgeschaltet. */
  regel_unbekannt: 409,
  unterbrochen: 500,
  intern: 500,
  /** Der Not-Aus ist an: Bots nehmen nichts an und fragen kein Modell an. */
  angehalten: 409,
  /** Ein Werkzeug-Aufruf bräuchte die Erlaubnis des Besitzers; in dieser Fassung abgelehnt. */
  freigabe_noetig: 202,
  /** Das Modell wünscht ein Werkzeug, das es in diesem Schritt nicht gibt. */
  werkzeug_unbekannt: 400,
  /** Die Eingabe des Modells passt nicht zum Werkzeug. */
  werkzeug_eingabe_ungueltig: 400,
  /** Das Werkzeug hat nicht rechtzeitig geantwortet. */
  werkzeug_zeitgrenze: 504,
  /** Das Werkzeug hat einen Fehler gemeldet. */
  werkzeug_fehler: 502,
  /** Ob ein Werkzeug-Aufruf gewirkt hat, ist nicht bekannt. */
  ausgang_unbekannt: 500,
  /** Der Lauf hat alle erlaubten Schritte verbraucht. */
  schritte_aufgebraucht: 429,
  /** Der Lauf hat alle erlaubten Werkzeug-Aufrufe verbraucht. */
  zu_viele_aufrufe: 429,
  /** Ab Tor-Fassung 3: Fehler rund um Apps (siehe `ERROR_STATUS_3`). */
  ...ERROR_STATUS_3,
  /** Ab Tor-Fassung 4: Fehler rund um Bots, Teams und Entwürfe (siehe `ERROR_STATUS_4`). */
  ...ERROR_STATUS_4,
  /** Ab Tor-Fassung 5: Fehler rund um Aufträge und Übergaben (siehe `ERROR_STATUS_5`). */
  ...ERROR_STATUS_5,
} as const satisfies Record<string, number>;

export type ErrorCode = keyof typeof ERROR_STATUS;
export const ERROR_CODES = Object.keys(ERROR_STATUS) as [ErrorCode, ...ErrorCode[]];
export const errorCodeSchema = z.enum(ERROR_CODES);

/** Kurze Codes für einzelne Felder einer ungültigen Eingabe. */
export const FIELD_CODES = [
  "fehlt",
  "zu_kurz",
  "zu_lang",
  "zu_klein",
  "zu_gross",
  "format",
  "ungueltig",
] as const;
export type FieldCode = (typeof FIELD_CODES)[number];
export const fieldCodeSchema = z.enum(FIELD_CODES);

export const fieldErrorSchema = z.strictObject({
  feld: z.string().min(1).max(200),
  code: fieldCodeSchema,
});
export type FieldError = z.infer<typeof fieldErrorSchema>;

export interface PaiBotErrorOptions {
  /** Deutscher Satz für die Oberfläche; ohne Angabe gilt der Standardtext des Codes. */
  text?: string;
  /** Deutscher Satz, was man tun kann; ohne Angabe gilt der Standard-Ausweg des Codes, falls es einen gibt. */
  ausweg?: string;
  felder?: FieldError[];
  /** Wartezeit in Sekunden für `Retry-After`. */
  retryAfterSeconds?: number;
  cause?: unknown;
}

/** Fehler mit festem Code. Die API wandelt ihn mit `apiErrorBody` in die Antwort-Hülle um. */
export class PaiBotError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly text?: string;
  readonly ausweg?: string;
  readonly felder?: FieldError[];
  readonly retryAfterSeconds?: number;

  constructor(code: ErrorCode, options: PaiBotErrorOptions = {}) {
    super(options.text ?? code, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "PaiBotError";
    this.code = code;
    this.status = ERROR_STATUS[code];
    if (options.text !== undefined) this.text = options.text;
    if (options.ausweg !== undefined) this.ausweg = options.ausweg;
    if (options.felder !== undefined) this.felder = options.felder;
    if (options.retryAfterSeconds !== undefined) this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export function isPaiBotError(value: unknown): value is PaiBotError {
  return value instanceof PaiBotError;
}

/**
 * Ordnet einen Zod-Fehler den kurzen Feld-Codes zu. Mit der geprüften Eingabe lässt sich
 * zuverlässig erkennen, ob ein Feld ganz fehlt.
 */
export function fieldErrorsFromZod(error: z.ZodError, input?: unknown): FieldError[] {
  return error.issues.map((issue) => ({
    feld: issue.path.length > 0 ? issue.path.map(String).join(".") : "eingabe",
    code: fieldCodeOf(issue, input),
  }));
}

function valueAt(input: unknown, path: readonly PropertyKey[]): unknown {
  let current = input;
  for (const key of path) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<PropertyKey, unknown>)[key];
  }
  return current;
}

function isMissing(issue: z.core.$ZodIssueInvalidType, input: unknown): boolean {
  if (input !== undefined) return valueAt(input, issue.path) === undefined;
  return issue.input === undefined && /received undefined$/.test(issue.message);
}

function fieldCodeOf(issue: z.core.$ZodIssue, input: unknown): FieldCode {
  switch (issue.code) {
    case "invalid_type":
      return isMissing(issue, input) ? "fehlt" : "ungueltig";
    case "too_small":
      return issue.origin === "string" || issue.origin === "array" ? "zu_kurz" : "zu_klein";
    case "too_big":
      return issue.origin === "string" || issue.origin === "array" ? "zu_lang" : "zu_gross";
    case "invalid_format":
      return "format";
    default:
      return "ungueltig";
  }
}

/** Fehler `eingabe_ungueltig` mit den betroffenen Feldern. */
export function invalidInput(error: z.ZodError, input?: unknown): PaiBotError {
  return new PaiBotError("eingabe_ungueltig", {
    felder: fieldErrorsFromZod(error, input),
    cause: error,
  });
}
