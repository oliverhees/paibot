/**
 * PaiBot – Fehler des Krypto-Pakets mit festem Grund.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

/** Gründe, aus denen eine Krypto-Funktion abbricht. */
export const CRYPTO_ERROR_REASONS = [
  /** `PAIBOT_SECRET` fehlt oder ist leer. */
  "geheimnis_fehlt",
  /** `PAIBOT_SECRET` ist kein Base64 oder nicht genau 32 Byte lang. */
  "geheimnis_ungueltig",
  /** Ein gespeicherter Wert (Geheimtext, Passwort-Hash, Schlüssel, Signatur) hat nicht das erwartete Format. */
  "format_ungueltig",
  /** Ein Geheimtext hat eine Formatversion, die dieses Paket nicht kennt (z. B. `v2:`). */
  "version_unbekannt",
  /** Entschlüsseln ist gescheitert: falscher Schlüssel oder veränderter Geheimtext bzw. Tag. */
  "entschluesseln_fehlgeschlagen",
] as const;
export type CryptoErrorReason = (typeof CRYPTO_ERROR_REASONS)[number];

/**
 * Fehler des Krypto-Pakets. Die Meldung enthält nie Geheimnisse, Schlüssel oder Klartext, nur
 * den Grund.
 */
export class CryptoError extends Error {
  readonly reason: CryptoErrorReason;

  constructor(reason: CryptoErrorReason, options?: { cause?: unknown }) {
    super(reason, options);
    this.name = "CryptoError";
    this.reason = reason;
  }
}

/** Typwächter für `CryptoError`, optional mit einem bestimmten Grund. */
export function isCryptoError(value: unknown, reason?: CryptoErrorReason): value is CryptoError {
  return value instanceof CryptoError && (reason === undefined || value.reason === reason);
}
