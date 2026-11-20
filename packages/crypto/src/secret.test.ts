/**
 * PaiBot – Tests für das Verschlüsseln gespeicherter Geheimnisse.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  type DerivedKey,
  decryptSecret,
  deriveKey,
  ENCRYPTED_SECRET_PATTERN,
  encryptSecret,
  isCryptoError,
  isEncryptedSecret,
  loadMasterSecret,
  toBase64Url,
} from "./index";

const master = loadMasterSecret({ PAIBOT_SECRET: randomBytes(32).toString("base64") });
const key = deriveKey(master, "secrets-v1");

function reasonOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (error) {
    return isCryptoError(error) ? error.reason : `anderer Fehler: ${String(error)}`;
  }
  return undefined;
}

/** Ersetzt ein Zeichen so, dass es sicher ein anderes ist. */
function flip(text: string): string {
  return text.startsWith("A") ? `B${text.slice(1)}` : `A${text.slice(1)}`;
}

function withPart(encrypted: string, index: number, edit: (part: string) => string): string {
  const parts = encrypted.split(":");
  parts[index] = edit(parts[index] ?? "");
  return parts.join(":");
}

describe("encryptSecret und decryptSecret", () => {
  it("läuft hin und zurück, auch mit Umlauten, Emojis und langen Texten", () => {
    for (const plain of ["sk-test-123", "Größe äöü ß 🙂", "x".repeat(10_000), "a:b:c", ""]) {
      expect(decryptSecret(encryptSecret(plain, key), key)).toBe(plain);
    }
  });

  it("liefert das Format v1:<iv>:<tag>:<ct> mit richtigen Längen", () => {
    const encrypted = encryptSecret("geheim", key);
    expect(encrypted).toMatch(ENCRYPTED_SECRET_PATTERN);
    expect(isEncryptedSecret(encrypted)).toBe(true);
    const [version, iv, tag, ct] = encrypted.split(":");
    expect(version).toBe("v1");
    expect(iv?.length).toBe(16); // 12 Byte
    expect(tag?.length).toBe(22); // 16 Byte
    expect(ct?.length).toBe(8); // 6 Byte Klartext
    expect(encrypted).not.toContain("=");
  });

  it("verwendet jedes Mal einen neuen IV", () => {
    const a = encryptSecret("gleich", key);
    const b = encryptSecret("gleich", key);
    expect(a).not.toBe(b);
    expect(a.split(":")[1]).not.toBe(b.split(":")[1]);
  });

  it("enthält den Klartext nicht", () => {
    expect(encryptSecret("sk-sehr-geheim", key)).not.toContain("sehr-geheim");
  });

  it("scheitert mit falschem Schlüssel", () => {
    const encrypted = encryptSecret("geheim", key);
    const other = deriveKey(
      loadMasterSecret({ PAIBOT_SECRET: randomBytes(32).toString("base64") }),
      "secrets-v1",
    );
    expect(reasonOf(() => decryptSecret(encrypted, other))).toBe("entschluesseln_fehlgeschlagen");
  });

  it("scheitert mit dem Schlüssel eines anderen Zwecks", () => {
    const encrypted = encryptSecret("geheim", key);
    const keysKey = deriveKey(master, "keys-v1");
    expect(reasonOf(() => decryptSecret(encrypted, keysKey))).toBe("entschluesseln_fehlgeschlagen");
    expect(decryptSecret(encryptSecret("privat", keysKey), keysKey)).toBe("privat");
  });

  it("erkennt jede Veränderung an IV, Tag und Geheimtext", () => {
    const encrypted = encryptSecret("geheim-und-lang-genug", key);
    for (const index of [1, 2, 3]) {
      const first = withPart(encrypted, index, flip);
      const last = withPart(
        encrypted,
        index,
        (part) => `${part.slice(0, -1)}${part.endsWith("A") ? "Q" : "A"}`,
      );
      expect(reasonOf(() => decryptSecret(first, key))).toBe("entschluesseln_fehlgeschlagen");
      expect(reasonOf(() => decryptSecret(last, key))).toBe("entschluesseln_fehlgeschlagen");
    }
  });

  it("erkennt verkürzten und verlängerten Geheimtext", () => {
    const encrypted = encryptSecret("geheim-und-lang-genug", key);
    expect(
      reasonOf(() =>
        decryptSecret(
          withPart(encrypted, 3, (p) => p.slice(0, -4)),
          key,
        ),
      ),
    ).toBe("entschluesseln_fehlgeschlagen");
    expect(
      reasonOf(() =>
        decryptSecret(
          withPart(encrypted, 3, (p) => `${p}AAAA`),
          key,
        ),
      ),
    ).toBe("entschluesseln_fehlgeschlagen");
  });

  it("vertauschte Teile zweier Geheimnisse gehen nicht durch", () => {
    const a = encryptSecret("erstes", key).split(":");
    const b = encryptSecret("zweites", key).split(":");
    const mixed = [a[0], a[1], b[2], a[3]].join(":");
    expect(reasonOf(() => decryptSecret(mixed, key))).toBe("entschluesseln_fehlgeschlagen");
  });

  it("meldet falsche Formate", () => {
    const encrypted = encryptSecret("geheim", key);
    const bad = [
      "",
      "klartext",
      "v1:a:b",
      `${encrypted}:extra`,
      withPart(encrypted, 1, (p) => p.slice(1)),
      withPart(encrypted, 2, (p) => `${p}=`),
      withPart(encrypted, 3, (p) => `${p}+`),
      encrypted.replace(/^v1/, "x1"),
    ];
    for (const value of bad)
      expect(reasonOf(() => decryptSecret(value, key))).toBe("format_ungueltig");
    expect(reasonOf(() => decryptSecret(42 as unknown as string, key))).toBe("format_ungueltig");
  });

  it("meldet unbekannte Versionen", () => {
    const encrypted = encryptSecret("geheim", key);
    expect(reasonOf(() => decryptSecret(encrypted.replace(/^v1/, "v2"), key))).toBe(
      "version_unbekannt",
    );
    expect(reasonOf(() => decryptSecret(encrypted.replace(/^v1/, "v10"), key))).toBe(
      "version_unbekannt",
    );
  });

  it("nennt weder Klartext noch Schlüssel noch Geheimtext in Fehlermeldungen", () => {
    const encrypted = encryptSecret("sk-sehr-geheim", key);
    const other = deriveKey(
      loadMasterSecret({ PAIBOT_SECRET: randomBytes(32).toString("base64") }),
      "secrets-v1",
    );
    let caught: unknown;
    try {
      decryptSecret(encrypted, other);
    } catch (error) {
      caught = error;
    }
    const text = JSON.stringify([
      String(caught),
      (caught as Error).message,
      (caught as Error).stack ?? "",
    ]);
    expect(text).not.toContain("sehr-geheim");
    expect(text).not.toContain(encrypted.split(":")[3] ?? "?");
    expect(text).not.toContain(toBase64Url(key));
    expect((caught as Error).cause).toBeUndefined();
  });

  it("wirft TypeError bei Schlüssel falscher Länge", () => {
    const short = new Uint8Array(16) as unknown as DerivedKey<"secrets-v1">;
    expect(() => encryptSecret("x", short)).toThrow(TypeError);
    expect(() => decryptSecret(encryptSecret("x", key), short)).toThrow(TypeError);
  });

  it("hält sich an AES-256-GCM: unabhängig mit Node-Grundfunktionen nachgerechnet", () => {
    const encrypted = encryptSecret("Gegenprobe ä", key);
    const [, iv, tag, ct] = encrypted.split(":");
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv ?? "", "base64url"));
    decipher.setAuthTag(Buffer.from(tag ?? "", "base64url"));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(ct ?? "", "base64url")),
      decipher.final(),
    ]);
    expect(plain.toString("utf8")).toBe("Gegenprobe ä");
  });

  it("Grundlage: AES-256-GCM liefert den bekannten Wert aus dem Standard", () => {
    // Quelle: McGrew/Viega, „The Galois/Counter Mode of Operation“, Test Case 15
    // (AES-256, IV 12 Byte, 64 Byte Klartext, ohne zusätzliche Daten).
    const k = Buffer.from(
      "feffe9928665731c6d6a8f9467308308feffe9928665731c6d6a8f9467308308",
      "hex",
    );
    const iv = Buffer.from("cafebabefacedbaddecaf888", "hex");
    const plain = Buffer.from(
      "d9313225f88406e5a55909c5aff5269a86a7a9531534f7da2e4c303d8a318a721c3c0c95956809532fcf0e2449a6b525b16aedf5aa0de657ba637b391aafd255",
      "hex",
    );
    const cipher = createCipheriv("aes-256-gcm", k, iv);
    const ct = Buffer.concat([cipher.update(plain), cipher.final()]);
    expect(ct.toString("hex")).toBe(
      "522dc1f099567d07f47f37a32a84427d643a8cdcbfe5c0c97598a2bd2555d1aa8cb08e48590dbb3da7b08b1056828838c5f61e6393ba7a0abcc9f662898015ad",
    );
    expect(cipher.getAuthTag().toString("hex")).toBe("b094dac5d93471bdec1a502270e3cc6c");
  });
});
