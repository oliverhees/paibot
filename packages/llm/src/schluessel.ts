/**
 * PaiBot – Anbieter-Schlüssel verschlüsseln und bei einer neuen Adresse bewusst umbinden.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { timingSafeEqual } from "node:crypto";
import { type DerivedKey, decryptSecret, encryptSecret } from "@paibot/crypto";
import { providerSecretBinding, secretAad } from "@paibot/shared/bindung";
import { PaiBotError } from "@paibot/shared/fehler";
import type { ProviderId } from "@paibot/shared/ids";
import { providerFailure } from "./errors";

function aadOf(providerId: ProviderId, baseUrl: string): string {
  try {
    return secretAad(providerSecretBinding(providerId, baseUrl));
  } catch {
    throw new PaiBotError("eingabe_ungueltig", { felder: [{ feld: "baseUrl", code: "format" }] });
  }
}

/**
 * Verschlüsselt den Schlüssel eines Anbieters für genau diesen Datensatz und diese Basis-URL
 * (`providerSecretBinding`). So speichert die Einrichtung bzw. die Seite „Modell und Anbieter“
 * einen neu eingetragenen Schlüssel, auch wenn sich dabei die Adresse ändert.
 *
 * Fehler: `eingabe_ungueltig` (Feld `baseUrl`), wenn die Adresse keine gültige Basis-URL ist.
 */
export function encryptProviderSecret(
  plain: string,
  secretsKey: DerivedKey<"secrets-v1">,
  target: { providerId: ProviderId; baseUrl: string },
): string {
  return encryptSecret(plain, secretsKey, { aad: aadOf(target.providerId, target.baseUrl) });
}

/** Was `rebindProviderSecret` braucht. */
export interface ProviderSecretRebind {
  providerId: ProviderId;
  /** Basis-URL, an die der gespeicherte Schlüssel heute gebunden ist. */
  fromBaseUrl: string;
  /** Neue Basis-URL, die der Besitzer eingetragen hat. */
  toBaseUrl: string;
  /** Der Schlüssel, wie der Besitzer ihn zur Bestätigung erneut eingegeben hat. */
  confirmKey: string;
}

/**
 * Bindet einen gespeicherten Anbieter-Schlüssel an eine neue Basis-URL, wenn der Besitzer die
 * Adresse bewusst ändert und den Schlüssel dabei erneut eingibt. Ergebnis: der Schlüssel, neu
 * verschlüsselt mit der Bindung an `toBaseUrl`; der alte Wert gilt danach für die neue Adresse
 * nicht mehr und umgekehrt.
 *
 * Es gibt keinen Weg ohne erneute Eingabe: Wer die Adresse ändern kann, ohne den Schlüssel zu
 * kennen (ein Fehler in einer Seite, eine fremde Sitzung, ein geänderter Datensatz), darf den
 * gespeicherten Schlüssel nicht an ein neues Ziel schicken lassen.
 *
 * Fehler (ohne Ursache, ohne Teile des Schlüssels): `schluessel_ungueltig`, wenn sich der
 * gespeicherte Wert mit der Bindung an `fromBaseUrl` nicht entschlüsseln lässt (die Adresse passt
 * nicht mehr zum Schlüssel: neu eintragen) oder `confirmKey` nicht gleich dem gespeicherten
 * Schlüssel ist; `eingabe_ungueltig`, wenn eine der Adressen keine gültige Basis-URL ist.
 */
export function rebindProviderSecret(
  encrypted: string,
  secretsKey: DerivedKey<"secrets-v1">,
  options: ProviderSecretRebind,
): string {
  const from = aadOf(options.providerId, options.fromBaseUrl);
  const to = aadOf(options.providerId, options.toBaseUrl);
  let plain: string;
  try {
    plain = decryptSecret(encrypted, secretsKey, { aad: from });
  } catch {
    throw providerFailure("schluessel_ungueltig");
  }
  const stored = Buffer.from(plain, "utf8");
  const given = Buffer.from(options.confirmKey.trim(), "utf8");
  if (stored.length !== given.length || !timingSafeEqual(stored, given)) {
    throw providerFailure("schluessel_ungueltig");
  }
  return encryptSecret(plain, secretsKey, { aad: to });
}
