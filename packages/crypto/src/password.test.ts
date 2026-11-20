/**
 * PaiBot – Tests für Passwort-Hash und -Prüfung.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { scryptSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  hashPassword,
  isCryptoError,
  isPasswordHash,
  PASSWORD_HASH_PATTERN,
  SCRYPT_PARAMS,
  verifyPassword,
} from "./index";

describe("hashPassword", () => {
  it("liefert das vorgegebene Format mit den vorgegebenen Parametern", async () => {
    const hash = await hashPassword("ein langes Passwort");
    expect(hash).toMatch(PASSWORD_HASH_PATTERN);
    expect(isPasswordHash(hash)).toBe(true);
    const [name, n, r, p, salt, key] = hash.split("$");
    expect(name).toBe("scrypt");
    expect([Number(n), Number(r), Number(p)]).toEqual([
      SCRYPT_PARAMS.N,
      SCRYPT_PARAMS.r,
      SCRYPT_PARAMS.p,
    ]);
    expect(salt?.length).toBe(22); // 16 Byte
    expect(key?.length).toBe(43); // 32 Byte
    expect(hash).not.toContain("=");
    expect(hash).not.toContain("langes Passwort");
  });

  it("nutzt für jeden Aufruf ein neues Salz", async () => {
    const [a, b] = await Promise.all([hashPassword("gleich"), hashPassword("gleich")]);
    expect(a).not.toBe(b);
  });
});

describe("verifyPassword", () => {
  it("bestätigt das richtige und weist jedes andere Passwort ab", async () => {
    const hash = await hashPassword("Rich-tig 1234 äöü 🙂");
    expect(await verifyPassword("Rich-tig 1234 äöü 🙂", hash)).toBe(true);
    for (const wrong of [
      "Rich-tig 1234 äöü",
      "rich-tig 1234 äöü 🙂",
      "",
      "Rich-tig 1234 äöü 🙂 ",
    ]) {
      expect(await verifyPassword(wrong, hash)).toBe(false);
    }
  });

  it("weist einen veränderten Hash ab, ohne zu werfen", async () => {
    const hash = await hashPassword("Passwort");
    const parts = hash.split("$");
    const last = parts[5] ?? "";
    parts[5] = `${last.slice(0, 10)}${last[10] === "A" ? "B" : "A"}${last.slice(11)}`;
    expect(await verifyPassword("Passwort", parts.join("$"))).toBe(false);
  });

  it("meldet falsche Formate", async () => {
    const hash = await hashPassword("Passwort");
    const bad = [
      "",
      "Passwort",
      "scrypt$32768$8$1$abc$def",
      hash.replace("$32768$", "$16384$"),
      hash.replace("$8$1$", "$8$2$"),
      hash.replace("scrypt", "argon2"),
      `${hash}$x`,
      `${hash}=`,
    ];
    for (const stored of bad) {
      let caught: unknown;
      try {
        await verifyPassword("Passwort", stored);
      } catch (error) {
        caught = error;
      }
      expect(isCryptoError(caught, "format_ungueltig")).toBe(true);
    }
  });

  it("liest die Parameter aus dem gespeicherten Hash und rechnet wie scrypt", async () => {
    // Das Salz und der erwartete Hash werden hier unabhängig mit scrypt berechnet.
    const salt = Buffer.alloc(16, 7);
    const expected = scryptSync("Passwort", salt, 32, {
      N: 32768,
      r: 8,
      p: 1,
      maxmem: 128 * 1024 * 1024,
    });
    const stored = `scrypt$32768$8$1$${salt.toString("base64url")}$${expected.toString("base64url")}`;
    expect(await verifyPassword("Passwort", stored)).toBe(true);
    expect(await verifyPassword("Passwort!", stored)).toBe(false);
  });

  it("Grundlage: scrypt liefert den Wert aus RFC 7914", () => {
    // Quelle: RFC 7914, Abschnitt 12, Testvektor 3 (N = 16384, r = 8, p = 1).
    const out = scryptSync("pleaseletmein", "SodiumChloride", 64, {
      N: 16384,
      r: 8,
      p: 1,
      maxmem: 64 * 1024 * 1024,
    });
    expect(out.toString("hex")).toBe(
      "7023bdcb3afd7348461c06cd81fd38ebfda8fbba904f8e3ea9b543f6545da1f2d5432955613f0fcf62d49705242a9af9e61e85dc0d651e40dfcf017b45575887",
    );
  });
});
