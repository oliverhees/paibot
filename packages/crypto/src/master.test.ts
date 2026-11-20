/**
 * PaiBot – Tests für das Wurzel-Geheimnis und die Schlüsselableitung.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  DERIVED_KEY_BYTES,
  deriveKey,
  isCryptoError,
  isWeakMasterSecret,
  KEY_PURPOSES,
  loadMasterSecret,
  type MasterSecret,
  toHex,
} from "./index";

function codeOf(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return isCryptoError(error) ? error.reason : error;
  }
  return undefined;
}

describe("loadMasterSecret", () => {
  const bytes = randomBytes(32);

  it("liest Standard-Base64 wie von openssl, mit und ohne Auffüllung", () => {
    const standard = bytes.toString("base64");
    expect(standard.endsWith("=")).toBe(true);
    expect(Buffer.from(loadMasterSecret({ PAIBOT_SECRET: standard }))).toEqual(bytes);
    expect(Buffer.from(loadMasterSecret({ PAIBOT_SECRET: standard.replace(/=+$/, "") }))).toEqual(
      bytes,
    );
  });

  it("liest base64url und ignoriert Leerraum außen", () => {
    expect(
      Buffer.from(loadMasterSecret({ PAIBOT_SECRET: ` ${bytes.toString("base64url")}\n` })),
    ).toEqual(bytes);
  });

  it("meldet fehlendes oder leeres Geheimnis", () => {
    expect(codeOf(() => loadMasterSecret({}))).toBe("geheimnis_fehlt");
    expect(codeOf(() => loadMasterSecret({ PAIBOT_SECRET: "" }))).toBe("geheimnis_fehlt");
    expect(codeOf(() => loadMasterSecret({ PAIBOT_SECRET: "   " }))).toBe("geheimnis_fehlt");
  });

  it("meldet ungültige Werte, ohne den Wert zu nennen", () => {
    const wrong = [
      randomBytes(31).toString("base64"),
      randomBytes(33).toString("base64"),
      "kein base64 !!!",
      "AAAA+AAA_AAA", // gemischte Alphabete
      "A",
    ];
    for (const value of wrong) {
      let caught: unknown;
      try {
        loadMasterSecret({ PAIBOT_SECRET: value });
      } catch (error) {
        caught = error;
      }
      expect(isCryptoError(caught, "geheimnis_ungueltig")).toBe(true);
      expect(String((caught as Error).message)).not.toContain(value);
    }
  });

  it("lehnt erkennbar nicht zufällige Werte ab, ohne den Wert zu nennen", () => {
    const pattern = Buffer.alloc(32);
    for (let i = 0; i < 32; i++) pattern[i] = (i % 8) * 31;
    const weak = [
      Buffer.alloc(32, 0), // Nullen
      Buffer.alloc(32, 0xff),
      Buffer.alloc(32, 7),
      pattern, // kurze Wiederholung
      Buffer.from("das-ist-mein-geheimes-passwort!!", "utf8"), // Text statt Zufall
    ];
    for (const bytes of weak) {
      expect(bytes.length).toBe(32);
      for (const value of [bytes.toString("base64"), bytes.toString("base64url")]) {
        let caught: unknown;
        try {
          loadMasterSecret({ PAIBOT_SECRET: value });
        } catch (error) {
          caught = error;
        }
        expect(isCryptoError(caught, "geheimnis_schwach")).toBe(true);
        expect(String((caught as Error).message)).not.toContain(value);
      }
    }
  });

  it("nimmt viele echte Zufallswerte an", () => {
    for (let i = 0; i < 2000; i++) {
      const bytes = randomBytes(32);
      expect(isWeakMasterSecret(bytes)).toBe(false);
    }
    // Ränder der Regel: 16 verschiedene Werte, nicht nur Text
    const sixteen = Buffer.alloc(32);
    for (let i = 0; i < 32; i++) sixteen[i] = (i % 16) * 16;
    expect(isWeakMasterSecret(sixteen)).toBe(false);
    sixteen[15] = 0;
    sixteen[31] = 0;
    expect(isWeakMasterSecret(sixteen)).toBe(true);
  });
});

describe("deriveKey", () => {
  const master = loadMasterSecret({ PAIBOT_SECRET: randomBytes(32).toString("base64") });

  it("liefert 32 Byte, stabil bei gleichen Eingaben", () => {
    for (const purpose of KEY_PURPOSES) {
      const a = deriveKey(master, purpose);
      expect(a.length).toBe(DERIVED_KEY_BYTES);
      expect(toHex(deriveKey(master, purpose))).toBe(toHex(a));
    }
  });

  it("gibt je Zweck einen anderen Schlüssel", () => {
    const keys = KEY_PURPOSES.map((purpose) => toHex(deriveKey(master, purpose)));
    expect(new Set(keys).size).toBe(KEY_PURPOSES.length);
  });

  it("hängt vom Wurzel-Geheimnis ab und verändert es nicht", () => {
    const other = loadMasterSecret({ PAIBOT_SECRET: randomBytes(32).toString("base64") });
    const before = toHex(master);
    expect(toHex(deriveKey(other, "secrets-v1"))).not.toBe(toHex(deriveKey(master, "secrets-v1")));
    expect(toHex(master)).toBe(before);
  });

  it("wirft TypeError bei unbekanntem Zweck", () => {
    // @ts-expect-error absichtlich falscher Zweck
    expect(() => deriveKey(master, "context-v2")).toThrow(TypeError);
  });

  it("entspricht HKDF-SHA-256 mit Salz pb/wurzel/1 und Info = Zweck (festes Beispiel)", () => {
    // Festes Wurzel-Geheimnis (32 Mal 0x01) → stabile Ableitung; schützt vor versehentlicher Änderung.
    // Direkt als Bytes, weil `loadMasterSecret` einen so gleichförmigen Wert ablehnt.
    const fixed = new Uint8Array(32).fill(1) as unknown as MasterSecret;
    expect(toHex(deriveKey(fixed, "secrets-v1"))).toMatch(/^[0-9a-f]{64}$/);
    expect(toHex(deriveKey(fixed, "secrets-v1"))).toBe(FIXED_SECRETS_KEY);
  });
});

// Unabhängig berechnet (HKDF nach RFC 5869 mit HMAC-SHA-256, Salz pb/wurzel/1, Info secrets-v1, IKM 32×0x01).
const FIXED_SECRETS_KEY = "9e547eac0190fc2acc94ec43d14ce34002ebe80f8fcd9fb82b2891b484cf3f30";
