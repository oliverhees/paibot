/**
 * PaiBot – Tests für Kodierungen und den Vergleich in konstanter Zeit.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { describe, expect, it } from "vitest";
import { fromBase64Url, fromHex, isCryptoError, safeEqual, toBase64Url, toHex } from "./index";

describe("base64url", () => {
  // Beispiele aus RFC 4648, Abschnitt 10 (ohne Auffüllung, url-sicheres Alphabet).
  const vectors: [string, string][] = [
    ["", ""],
    ["f", "Zg"],
    ["fo", "Zm8"],
    ["foo", "Zm9v"],
    ["foob", "Zm9vYg"],
    ["fooba", "Zm9vYmE"],
    ["foobar", "Zm9vYmFy"],
  ];

  it.each(vectors)("kodiert %j als %s und zurück", (plain, encoded) => {
    const bytes = new TextEncoder().encode(plain);
    expect(toBase64Url(bytes)).toBe(encoded);
    expect(fromBase64Url(encoded)).toEqual(bytes);
  });

  it("nutzt - und _ statt + und /, ohne =", () => {
    const bytes = new Uint8Array([0xfb, 0xff, 0xfe]);
    expect(toBase64Url(bytes)).toBe("-__-");
  });

  it("lehnt Auffüllung, falsche Zeichen, falsche Länge und Zusatzbits ab", () => {
    for (const bad of ["Zg==", "Zm9v+", "Z", "Zm9vY", "a b", "Zh"]) {
      expect(() => fromBase64Url(bad)).toThrow();
      try {
        fromBase64Url(bad);
      } catch (error) {
        expect(isCryptoError(error, "format_ungueltig")).toBe(true);
      }
    }
  });
});

describe("Hex", () => {
  it("läuft hin und zurück, klein geschrieben", () => {
    const bytes = new Uint8Array([0, 15, 16, 255]);
    expect(toHex(bytes)).toBe("000f10ff");
    expect(fromHex("000f10ff")).toEqual(bytes);
  });

  it("lehnt Großbuchstaben, ungerade Länge und fremde Zeichen ab", () => {
    for (const bad of ["FF", "abc", "zz"]) {
      expect(() => fromHex(bad)).toThrow();
    }
  });
});

describe("safeEqual", () => {
  it("vergleicht Texte", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("", "")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(safeEqual("abcd", "abc")).toBe(false);
    expect(safeEqual("ä", "ä")).toBe(true);
  });
});
