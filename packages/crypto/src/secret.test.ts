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
  ENCRYPTED_SECRET_V2_PATTERN,
  encryptSecret,
  isCryptoError,
  isEncryptedSecret,
  loadMasterSecret,
  rebindSecret,
  secretFormatOf,
  toBase64Url,
  upgradeSecret,
} from "./index";

const master = loadMasterSecret({ PAIBOT_SECRET: randomBytes(32).toString("base64") });
const key = deriveKey(master, "secrets-v1");

// Zusatzdaten wie sie `secretAad` aus `@paibot/shared` baut (fünf Zeilen).
const aadOf = (table: string, id: string, purpose: string, extra: string) =>
  ["pb-geheimnis/v2", table, id, purpose, extra].join("\n");
const AAD = aadOf("providers", `anb_0${"1".repeat(25)}`, "api_key", "https://api.eurouter.ai");
const bound = { aad: AAD };
/** Absichtlich die veraltete Form ohne Bindung: so entsteht Altbestand im Format v1. */
const v1 = (plain: string) => encryptSecret(plain, key);

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
    for (const plain of ["sk-test-123", "Größe äöü ß 🙂", "x".repeat(10_000), "a:b:c"]) {
      expect(decryptSecret(encryptSecret(plain, key, bound), key, bound)).toBe(plain);
    }
  });

  it("liefert das Format v2:<iv>:<tag>:<ct> mit richtigen Längen", () => {
    const encrypted = encryptSecret("geheim", key, bound);
    expect(encrypted).toMatch(ENCRYPTED_SECRET_PATTERN);
    expect(encrypted).toMatch(ENCRYPTED_SECRET_V2_PATTERN);
    expect(isEncryptedSecret(encrypted)).toBe(true);
    expect(secretFormatOf(encrypted)).toBe("v2");
    const [version, iv, tag, ct] = encrypted.split(":");
    expect(version).toBe("v2");
    expect(iv?.length).toBe(16); // 12 Byte
    expect(tag?.length).toBe(22); // 16 Byte
    expect(ct?.length).toBe(8); // 6 Byte Klartext
    expect(encrypted).not.toContain("=");
  });

  it("verwendet jedes Mal einen neuen IV", () => {
    const a = encryptSecret("gleich", key, bound);
    const b = encryptSecret("gleich", key, bound);
    expect(a).not.toBe(b);
    expect(a.split(":")[1]).not.toBe(b.split(":")[1]);
  });

  it("enthält den Klartext nicht", () => {
    expect(encryptSecret("sk-sehr-geheim", key, bound)).not.toContain("sehr-geheim");
  });

  it("scheitert mit falschem Schlüssel", () => {
    const encrypted = encryptSecret("geheim", key, bound);
    const other = deriveKey(
      loadMasterSecret({ PAIBOT_SECRET: randomBytes(32).toString("base64") }),
      "secrets-v1",
    );
    expect(reasonOf(() => decryptSecret(encrypted, other, bound))).toBe(
      "entschluesseln_fehlgeschlagen",
    );
  });

  it("scheitert mit dem Schlüssel eines anderen Zwecks", () => {
    const encrypted = encryptSecret("geheim", key, bound);
    const keysKey = deriveKey(master, "keys-v1");
    expect(reasonOf(() => decryptSecret(encrypted, keysKey, bound))).toBe(
      "entschluesseln_fehlgeschlagen",
    );
    expect(decryptSecret(encryptSecret("privat", keysKey, bound), keysKey, bound)).toBe("privat");
  });

  it("erkennt jede Veränderung an IV, Tag und Geheimtext", () => {
    const encrypted = encryptSecret("geheim-und-lang-genug", key, bound);
    for (const index of [1, 2, 3]) {
      const first = withPart(encrypted, index, flip);
      const last = withPart(
        encrypted,
        index,
        (part) => `${part.slice(0, -1)}${part.endsWith("A") ? "Q" : "A"}`,
      );
      expect(reasonOf(() => decryptSecret(first, key, bound))).toBe(
        "entschluesseln_fehlgeschlagen",
      );
      expect(reasonOf(() => decryptSecret(last, key, bound))).toBe("entschluesseln_fehlgeschlagen");
    }
  });

  it("erkennt verkürzten und verlängerten Geheimtext", () => {
    const encrypted = encryptSecret("geheim-und-lang-genug", key, bound);
    expect(
      reasonOf(() =>
        decryptSecret(
          withPart(encrypted, 3, (p) => p.slice(0, -4)),
          key,
          bound,
        ),
      ),
    ).toBe("entschluesseln_fehlgeschlagen");
    expect(
      reasonOf(() =>
        decryptSecret(
          withPart(encrypted, 3, (p) => `${p}AAAA`),
          key,
          bound,
        ),
      ),
    ).toBe("entschluesseln_fehlgeschlagen");
  });

  it("vertauschte Teile zweier Geheimnisse gehen nicht durch", () => {
    const a = encryptSecret("erstes", key, bound).split(":");
    const b = encryptSecret("zweites", key, bound).split(":");
    const mixed = [a[0], a[1], b[2], a[3]].join(":");
    expect(reasonOf(() => decryptSecret(mixed, key, bound))).toBe("entschluesseln_fehlgeschlagen");
  });

  it("meldet falsche Formate", () => {
    const encrypted = encryptSecret("geheim", key, bound);
    const bad = [
      "",
      "klartext",
      "v1:a:b",
      "v2:a:b",
      withPart(encrypted, 3, () => ""), // v2 ohne Geheimtext
      `${encrypted}:extra`,
      withPart(encrypted, 1, (p) => p.slice(1)),
      withPart(encrypted, 2, (p) => `${p}=`),
      withPart(encrypted, 3, (p) => `${p}+`),
      encrypted.replace(/^v2/, "x2"),
    ];
    for (const value of bad)
      expect(reasonOf(() => decryptSecret(value, key, bound))).toBe("format_ungueltig");
    expect(reasonOf(() => decryptSecret(42 as unknown as string, key, bound))).toBe(
      "format_ungueltig",
    );
  });

  it("meldet unbekannte Versionen", () => {
    const encrypted = encryptSecret("geheim", key, bound);
    expect(reasonOf(() => decryptSecret(encrypted.replace(/^v2/, "v3"), key, bound))).toBe(
      "version_unbekannt",
    );
    expect(reasonOf(() => decryptSecret(encrypted.replace(/^v2/, "v10"), key, bound))).toBe(
      "version_unbekannt",
    );
  });

  it("nennt weder Klartext noch Schlüssel noch Geheimtext in Fehlermeldungen", () => {
    const encrypted = encryptSecret("sk-sehr-geheim", key, bound);
    const other = deriveKey(
      loadMasterSecret({ PAIBOT_SECRET: randomBytes(32).toString("base64") }),
      "secrets-v1",
    );
    let caught: unknown;
    try {
      decryptSecret(encrypted, other, bound);
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
    expect(() => encryptSecret("x", short, bound)).toThrow(TypeError);
    expect(() => decryptSecret(encryptSecret("x", key, bound), short, bound)).toThrow(TypeError);
  });

  it("hält sich an AES-256-GCM: unabhängig mit Node-Grundfunktionen nachgerechnet", () => {
    const encrypted = encryptSecret("Gegenprobe ä", key, bound);
    const [, iv, tag, ct] = encrypted.split(":");
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv ?? "", "base64url"));
    decipher.setAAD(Buffer.from(AAD, "utf8"));
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

describe("Bindung (Format v2)", () => {
  const PROVIDER_A = `anb_0${"1".repeat(25)}`;
  const PROVIDER_B = `anb_0${"2".repeat(25)}`;
  const ORIGIN = "https://api.eurouter.ai";
  const original = aadOf("providers", PROVIDER_A, "api_key", ORIGIN);
  const stored = encryptSecret("sk-echter-schluessel", key, { aad: original });

  it("ein Wert lässt sich nur mit genau seiner Bindung entschlüsseln", () => {
    expect(decryptSecret(stored, key, { aad: original })).toBe("sk-echter-schluessel");
    const elsewhere = [
      aadOf("providers", PROVIDER_B, "api_key", ORIGIN), // anderer Datensatz
      aadOf("installation_keys", PROVIDER_A, "api_key", ORIGIN), // andere Tabelle
      aadOf("providers", PROVIDER_A, "private_key", ORIGIN), // anderer Zweck
      aadOf("providers", PROVIDER_A, "api_key", "https://fremd.example"), // anderes Ziel
      aadOf("providers", PROVIDER_A, "api_key", "https://api.eurouter.ai:8443"),
      aadOf("providers", PROVIDER_A, "api_key", "http://api.eurouter.ai"),
      `${original}\n`,
      original.toUpperCase(),
    ];
    for (const aad of elsewhere) {
      expect(reasonOf(() => decryptSecret(stored, key, { aad }))).toBe(
        "entschluesseln_fehlgeschlagen",
      );
    }
  });

  it("v2 ohne Bindung wird nicht entschlüsselt, auch nicht mit allowV1", () => {
    expect(reasonOf(() => decryptSecret(stored, key))).toBe("bindung_fehlt");
    expect(reasonOf(() => decryptSecret(stored, key, { allowV1: true }))).toBe("bindung_fehlt");
    expect(reasonOf(() => decryptSecret(stored, key, { aad: "" }))).toBe("bindung_fehlt");
  });

  it("verschlüsseln verlangt Zusatzdaten und einen nicht leeren Klartext", () => {
    expect(() => encryptSecret("x", key, { aad: "" })).toThrow(TypeError);
    expect(() => encryptSecret("x", key, {} as { aad: string })).toThrow(TypeError);
    expect(() => encryptSecret("", key, bound)).toThrow(TypeError);
  });

  it("ein v1-Geheimtext mit vorangestelltem v2 geht nicht durch", () => {
    const old = v1("sk-alt");
    const relabeled = old.replace(/^v1/, "v2");
    expect(reasonOf(() => decryptSecret(relabeled, key, bound))).toBe(
      "entschluesseln_fehlgeschlagen",
    );
  });
});

describe("Altbestand im Format v1", () => {
  const old = v1("sk-alter-schluessel");

  it("die veraltete Form schreibt noch v1", () => {
    expect(secretFormatOf(old)).toBe("v1");
    expect(isEncryptedSecret(old)).toBe(true);
  });

  it("v1 ist nur mit allowV1 lesbar", () => {
    expect(reasonOf(() => decryptSecret(old, key))).toBe("version_veraltet");
    expect(reasonOf(() => decryptSecret(old, key, bound))).toBe("version_veraltet");
    expect(decryptSecret(old, key, { allowV1: true })).toBe("sk-alter-schluessel");
    expect(decryptSecret(old, key, { allowV1: true, aad: AAD })).toBe("sk-alter-schluessel");
    expect(decryptSecret(v1(""), key, { allowV1: true })).toBe("");
  });

  it("upgradeSecret bringt v1 nach v2 und lässt v2 unverändert", () => {
    const upgraded = upgradeSecret(old, key, bound);
    expect(upgraded.changed).toBe(true);
    expect(secretFormatOf(upgraded.value)).toBe("v2");
    expect(decryptSecret(upgraded.value, key, bound)).toBe("sk-alter-schluessel");
    const again = upgradeSecret(upgraded.value, key, bound);
    expect(again).toEqual({ value: upgraded.value, changed: false });
    const otherAad = aadOf("providers", `anb_0${"9".repeat(25)}`, "api_key", "https://x.example");
    expect(reasonOf(() => upgradeSecret(upgraded.value, key, { aad: otherAad }))).toBe(
      "entschluesseln_fehlgeschlagen",
    );
  });

  it("rebindSecret bindet an ein neues Ziel; das alte gilt danach nicht mehr", () => {
    const from = AAD;
    const to = aadOf("providers", `anb_0${"1".repeat(25)}`, "api_key", "https://neu.example");
    const stored = encryptSecret("sk-umzug", key, { aad: from });
    const moved = rebindSecret(stored, key, { from, to });
    expect(decryptSecret(moved, key, { aad: to })).toBe("sk-umzug");
    expect(reasonOf(() => decryptSecret(moved, key, { aad: from }))).toBe(
      "entschluesseln_fehlgeschlagen",
    );
    expect(reasonOf(() => rebindSecret(stored, key, { from: to, to: from }))).toBe(
      "entschluesseln_fehlgeschlagen",
    );
    expect(decryptSecret(rebindSecret(old, key, { from, to }), key, { aad: to })).toBe(
      "sk-alter-schluessel",
    );
  });
});
