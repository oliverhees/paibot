/**
 * PaiBot – Tests für die Schnittstelle des Krypto-Pakets.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { isNotImplemented, NOT_IMPLEMENTED_CODE } from "@paibot/stub";
import { describe, expect, it } from "vitest";
import pkg from "../package.json";
import * as crypto from "./index";

const FUNCTIONS = [
  "toBase64Url",
  "fromBase64Url",
  "toHex",
  "fromHex",
  "safeEqual",
  "loadMasterSecret",
  "deriveKey",
  "encryptSecret",
  "decryptSecret",
  "hashPassword",
  "verifyPassword",
  "newToken",
  "hashToken",
  "hmac",
  "contextDigest",
  "generateSigningKey",
  "publicKeyOf",
  "sign",
  "verify",
  "fingerprint",
] as const;

describe("Schnittstelle", () => {
  it("hat außer der Hilfe für fehlende Umsetzungen keine Abhängigkeit", () => {
    expect(Object.keys(pkg.dependencies)).toEqual(["@paibot/stub"]);
  });

  it("exportiert alle Funktionen", async () => {
    const api: Record<string, unknown> = await import("./index");
    for (const name of FUNCTIONS) expect(typeof api[name]).toBe("function");
  });

  it("feste Werte stehen fest", () => {
    expect(crypto.KEY_PURPOSES).toEqual(["secrets-v1", "session-v1", "context-v1", "keys-v1"]);
    expect(crypto.HKDF_SALT).toBe("pb/wurzel/1");
    expect(crypto.MASTER_SECRET_ENV).toBe("PAIBOT_SECRET");
    expect(crypto.SCRYPT_PARAMS).toEqual({ N: 32768, r: 8, p: 1, saltBytes: 16, keyBytes: 32 });
    expect(crypto.isKeyPurpose("context-v1")).toBe(true);
    expect(crypto.isKeyPurpose("context-v2")).toBe(false);
  });

  it("die Muster erkennen die verbindlichen Formate", () => {
    const iv = "A".repeat(16);
    const tag = "B".repeat(22);
    const salt = "s".repeat(22);
    const hash = "h".repeat(43);
    expect(crypto.isEncryptedSecret(["v1", iv, tag, "Q2xhcnRleHQ"].join(":"))).toBe(true);
    expect(crypto.isEncryptedSecret(["v2", iv, tag, "Q2xhcnRleHQ"].join(":"))).toBe(false);
    expect(crypto.isEncryptedSecret(["v1", `${iv}=`, tag, "x"].join(":"))).toBe(false);
    expect(crypto.isPasswordHash(["scrypt", "32768", "8", "1", salt, hash].join("$"))).toBe(true);
    expect(crypto.isPasswordHash(["scrypt", "16384", "8", "1", salt, hash].join("$"))).toBe(false);
  });

  it("noch nicht umgesetzte Funktionen melden das mit festem Code", () => {
    let caught: unknown;
    try {
      crypto.newToken();
    } catch (error) {
      caught = error;
    }
    expect(isNotImplemented(caught)).toBe(true);
    expect((caught as { code: string }).code).toBe(NOT_IMPLEMENTED_CODE);
    expect((caught as { feature: string }).feature).toBe("crypto.newToken");
  });

  it("CryptoError trägt den Grund", () => {
    const error = new crypto.CryptoError("entschluesseln_fehlgeschlagen");
    expect(crypto.isCryptoError(error, "entschluesseln_fehlgeschlagen")).toBe(true);
    expect(crypto.isCryptoError(error, "format_ungueltig")).toBe(false);
  });
});
