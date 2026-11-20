/**
 * PaiBot – Ziel einer Modell-Anfrage: lesbarer Origin und Abdruck für die Fakten des Tors.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { hashToken } from "@paibot/crypto";
import { targetDigestInput, targetOrigin } from "@paibot/shared/bindung";
import type { Sha256Digest } from "@paibot/shared/grundtypen";
import type { ProviderId } from "@paibot/shared/ids";

/**
 * Abdruck des Ziels eines Anbieters (`targetDigest` in den Fakten von `modell.anfragen`):
 * `sha256:` + SHA-256 über `targetDigestInput(providerId, baseUrl)`. Die Basis-URL geht genau so
 * ein, wie sie gespeichert ist.
 */
export function providerTargetDigest(providerId: ProviderId, baseUrl: string): Sha256Digest {
  return `sha256:${hashToken(targetDigestInput(providerId, baseUrl))}` as Sha256Digest;
}

/** Lesbares Ziel (`targetOrigin` in den Fakten): Origin der Basis-URL, z. B. `https://api.eurouter.ai`. */
export function providerTargetOrigin(baseUrl: string): string {
  return targetOrigin(baseUrl);
}

/** Beide Fakten zum Ziel, wie die Lauf-Steuerung sie aus dem gelesenen Anbieter bildet. */
export function providerTargetFacts(
  providerId: ProviderId,
  baseUrl: string,
): { targetOrigin: string; targetDigest: Sha256Digest } {
  return {
    targetOrigin: providerTargetOrigin(baseUrl),
    targetDigest: providerTargetDigest(providerId, baseUrl),
  };
}
