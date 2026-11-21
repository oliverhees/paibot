/**
 * PaiBot – Tests: Anbieter-Schlüssel verschlüsseln und bei neuer Adresse bewusst umbinden.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { randomBytes } from "node:crypto";
import { decryptSecret, deriveKey, loadMasterSecret } from "@paibot/crypto";
import { providerSecretBinding, secretAad } from "@paibot/shared/bindung";
import { newId, type ProviderId } from "@paibot/shared/ids";
import { describe, expect, it } from "vitest";
import { encryptProviderSecret, rebindProviderSecret } from "./schluessel";

const secretsKey = deriveKey(
  loadMasterSecret({ PAIBOT_SECRET: randomBytes(32).toString("base64") }),
  "secrets-v1",
);
const KEY = `sk-umbinden-${"u".repeat(24)}`;
const providerId = newId("provider") as ProviderId;
const OLD = "https://gateway.example/konto-a/v1";
const NEW = "https://gateway.example/konto-b/v1";
const aad = (url: string) => secretAad(providerSecretBinding(providerId, url));

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}

describe("encryptProviderSecret", () => {
  it("bindet an Datensatz und ganze Basis-URL", () => {
    const enc = encryptProviderSecret(KEY, secretsKey, { providerId, baseUrl: OLD });
    expect(decryptSecret(enc, secretsKey, { aad: aad(OLD) })).toBe(KEY);
    expect(() => decryptSecret(enc, secretsKey, { aad: aad(NEW) })).toThrow();
  });

  it("lehnt eine Basis-URL mit Abfrage ab", () => {
    expect(
      codeOf(() => encryptProviderSecret(KEY, secretsKey, { providerId, baseUrl: `${OLD}?x=1` })),
    ).toBe("eingabe_ungueltig");
  });
});

describe("rebindProviderSecret", () => {
  const stored = () => encryptProviderSecret(KEY, secretsKey, { providerId, baseUrl: OLD });

  it("mit erneut eingegebenem Schlüssel: gilt danach nur für die neue Adresse", () => {
    const moved = rebindProviderSecret(stored(), secretsKey, {
      providerId,
      fromBaseUrl: OLD,
      toBaseUrl: NEW,
      confirmKey: ` ${KEY} `,
    });
    expect(decryptSecret(moved, secretsKey, { aad: aad(NEW) })).toBe(KEY);
    expect(() => decryptSecret(moved, secretsKey, { aad: aad(OLD) })).toThrow();
  });

  it("ohne den richtigen Schlüssel: schluessel_ungueltig, kein neuer Wert", () => {
    for (const confirmKey of ["", "sk-falsch", `${KEY}x`, KEY.slice(0, -1)]) {
      expect(
        codeOf(() =>
          rebindProviderSecret(stored(), secretsKey, {
            providerId,
            fromBaseUrl: OLD,
            toBaseUrl: NEW,
            confirmKey,
          }),
        ),
        confirmKey,
      ).toBe("schluessel_ungueltig");
    }
  });

  it("die alte Adresse passt schon nicht mehr (z. B. in der Datenbank geändert): schluessel_ungueltig", () => {
    const error = (() => {
      try {
        rebindProviderSecret(stored(), secretsKey, {
          providerId,
          fromBaseUrl: "https://gateway.example/fremd/v1",
          toBaseUrl: NEW,
          confirmKey: KEY,
        });
      } catch (e) {
        return e as Error & { code?: string; cause?: unknown };
      }
      return undefined;
    })();
    expect(error?.code).toBe("schluessel_ungueltig");
    expect(error?.cause).toBeUndefined();
    expect(String(error?.message)).not.toContain(KEY);
  });

  it("ungültige neue Adresse: eingabe_ungueltig", () => {
    expect(
      codeOf(() =>
        rebindProviderSecret(stored(), secretsKey, {
          providerId,
          fromBaseUrl: OLD,
          toBaseUrl: `${NEW}#x`,
          confirmKey: KEY,
        }),
      ),
    ).toBe("eingabe_ungueltig");
  });
});
