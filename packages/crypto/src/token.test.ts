/**
 * PaiBot – Tests für Tokens, Prüfsummen und HMAC.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { describe, expect, it } from "vitest";
import {
  contextDigest,
  type DerivedKey,
  deriveKey,
  fromBase64Url,
  hashToken,
  hmac,
  loadMasterSecret,
  newToken,
  toHex,
} from "./index";

describe("newToken", () => {
  it("hat bei 32 Byte genau 43 Zeichen aus dem base64url-Alphabet ohne =", () => {
    const token = newToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(fromBase64Url(token).length).toBe(32);
    expect(newToken(32)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("richtet die Länge nach den Bytes", () => {
    expect(newToken(16)).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(newToken(48)).toMatch(/^[A-Za-z0-9_-]{64}$/);
  });

  it("liefert keine Wiederholungen", () => {
    const tokens = new Set(Array.from({ length: 1000 }, () => newToken()));
    expect(tokens.size).toBe(1000);
  });

  it("wirft RangeError bei zu kurzer oder unsinniger Länge", () => {
    for (const bad of [15, 0, -1, 16.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => newToken(bad)).toThrow(RangeError);
    }
  });
});

describe("hashToken", () => {
  it("rechnet SHA-256 über die UTF-8-Bytes, Hex klein", () => {
    // Quelle: FIPS 180-2, Anhang B.1 (SHA-256 von „abc“).
    expect(hashToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    // SHA-256 des leeren Textes (FIPS 180-2 / allgemein bekannter Wert).
    expect(hashToken("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("ist stabil, 64 Zeichen lang und je Token verschieden", () => {
    const token = newToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).not.toBe(hashToken(newToken()));
    expect(hashToken(token)).not.toContain(token);
  });
});

describe("hmac", () => {
  // Quelle: RFC 4231, Abschnitt 4 (HMAC-SHA-256). Die Schlüssel dort haben andere Längen als unsere
  // abgeleiteten; der Typ wird deshalb nur für den Test angepasst.
  const asKey = (bytes: Uint8Array) => bytes as DerivedKey;
  const utf8 = (text: string) => new TextEncoder().encode(text);

  it("Testfall 1 aus RFC 4231", () => {
    const out = hmac(asKey(new Uint8Array(20).fill(0x0b)), "Hi There");
    expect(toHex(out)).toBe("b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7");
  });

  it("Testfall 2 aus RFC 4231, Text und Bytes ergeben dasselbe", () => {
    const key = asKey(utf8("Jefe"));
    const expected = "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843";
    expect(toHex(hmac(key, "what do ya want for nothing?"))).toBe(expected);
    expect(toHex(hmac(key, utf8("what do ya want for nothing?")))).toBe(expected);
  });

  it("hängt vom Schlüssel und den Daten ab, liefert 32 Byte", () => {
    const master = loadMasterSecret({ PAIBOT_SECRET: Buffer.alloc(32, 9).toString("base64") });
    const a = deriveKey(master, "session-v1");
    const b = deriveKey(master, "context-v1");
    expect(hmac(a, "x").length).toBe(32);
    expect(toHex(hmac(a, "x"))).toBe(toHex(hmac(a, "x")));
    expect(toHex(hmac(a, "x"))).not.toBe(toHex(hmac(b, "x")));
    expect(toHex(hmac(a, "x"))).not.toBe(toHex(hmac(a, "y")));
  });
});

describe("contextDigest", () => {
  it("liefert hmac-sha256:<64 Hex> und entspricht hmac", () => {
    const master = loadMasterSecret({ PAIBOT_SECRET: Buffer.alloc(32, 5).toString("base64") });
    const key = deriveKey(master, "context-v1");
    const digest = contextDigest(key, "Inhalt");
    expect(digest).toMatch(/^hmac-sha256:[0-9a-f]{64}$/);
    expect(digest).toBe(`hmac-sha256:${toHex(hmac(key, "Inhalt"))}`);
    expect(digest).not.toBe(contextDigest(key, "Inhalt2"));
    expect(digest).not.toContain("Inhalt");
  });
});
