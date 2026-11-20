/**
 * PaiBot – kleine Bausteine für Schemas: Zeitstempel, Prüfsummen, Kodierungen, Ganzzahlen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { z } from "zod";

/** Zeitpunkt als ISO 8601 in UTC mit genau drei Stellen Millisekunden, z. B. `2026-11-20T10:00:00.000Z`. */
export const isoTimeSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  .refine((value) => !Number.isNaN(Date.parse(value)) && new Date(value).toISOString() === value);
export type IsoTime = z.infer<typeof isoTimeSchema>;

/** Wandelt einen Zeitpunkt in das Format von `isoTimeSchema`. */
export function toIsoTime(date: Date): IsoTime {
  return date.toISOString();
}

/** Prüfsumme in der Form `sha256:<64 Hex-Zeichen klein>`. */
export const sha256DigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);
export type Sha256Digest = z.infer<typeof sha256DigestSchema>;

/** Prüfsumme mit Schlüssel in der Form `hmac-sha256:<64 Hex-Zeichen klein>`. */
export const hmacDigestSchema = z.string().regex(/^hmac-sha256:[0-9a-f]{64}$/);
export type HmacDigest = z.infer<typeof hmacDigestSchema>;

/** Öffentlicher Ed25519-Schlüssel: 32 Rohbyte, base64url ohne Auffüllung (43 Zeichen). */
export const publicKeySchema = z.string().regex(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/);

/** Ed25519-Signatur: 64 Rohbyte, base64url ohne Auffüllung (86 Zeichen). */
export const signatureSchema = z.string().regex(/^[A-Za-z0-9_-]{85}[AQgw]$/);

/** Kurzform eines öffentlichen Schlüssels zum Vergleichen, z. B. `3f9c-2ab1-77d0-e4c5`. */
export const fingerprintSchema = z.string().regex(/^[0-9a-f]{4}(-[0-9a-f]{4}){3}$/);

/** Ganzzahl ab 0. Gleitkommazahlen kommen in Verträgen nicht vor. */
export const countSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

/** Ganzzahl ab 1. */
export const positiveIntSchema = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);

/** Token-Zahlen einer Antwort. */
export const tokenUsageSchema = z.strictObject({
  input: countSchema,
  output: countSchema,
});
export type TokenUsage = z.infer<typeof tokenUsageSchema>;

/** Zeitzone als IANA-Name, z. B. `Europe/Berlin`. */
export const timezoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("de", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  });
