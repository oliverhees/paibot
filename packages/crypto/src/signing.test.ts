/**
 * PaiBot – Tests für Ed25519: Schlüsselpaar, Signatur, Prüfung und Kurzform.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { describe, expect, it } from "vitest";
import {
  fingerprint,
  fromBase64Url,
  fromHex,
  generateSigningKey,
  isCryptoError,
  publicKeyOf,
  sign,
  toBase64Url,
  verify,
} from "./index";

const utf8 = (text: string) => new TextEncoder().encode(text);
const b64 = (hex: string) => toBase64Url(fromHex(hex));

describe("generateSigningKey", () => {
  it("liefert zwei Schlüssel zu je 43 Zeichen, neu bei jedem Aufruf", () => {
    const a = generateSigningKey();
    const b = generateSigningKey();
    for (const key of [a.publicKey, a.privateKey]) expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a.publicKey).not.toBe(b.publicKey);
    expect(a.privateKey).not.toBe(b.privateKey);
    expect(fromBase64Url(a.privateKey).length).toBe(32);
  });

  it("publicKeyOf findet den öffentlichen Schlüssel wieder", () => {
    const pair = generateSigningKey();
    expect(publicKeyOf(pair.privateKey)).toBe(pair.publicKey);
  });
});

describe("sign und verify", () => {
  it("läuft hin und zurück; die Signatur hat 86 Zeichen", () => {
    const pair = generateSigningKey();
    const data = utf8("Beleg 1");
    const signature = sign(pair.privateKey, data);
    expect(signature).toMatch(/^[A-Za-z0-9_-]{86}$/);
    expect(verify(pair.publicKey, data, signature)).toBe(true);
    expect(sign(pair.privateKey, data)).toBe(signature); // Ed25519 ist deterministisch
  });

  it("weist veränderte Daten, veränderte Signatur und fremde Schlüssel ab", () => {
    const pair = generateSigningKey();
    const other = generateSigningKey();
    const data = utf8("Beleg 1");
    const signature = sign(pair.privateKey, data);
    expect(verify(pair.publicKey, utf8("Beleg 2"), signature)).toBe(false);
    expect(verify(pair.publicKey, new Uint8Array(), signature)).toBe(false);
    expect(verify(other.publicKey, data, signature)).toBe(false);
    const tampered = `${signature.startsWith("A") ? "B" : "A"}${signature.slice(1)}`;
    expect(verify(pair.publicKey, data, tampered)).toBe(false);
    expect(verify(pair.publicKey, data, sign(other.privateKey, data))).toBe(false);
  });

  it("gibt bei Schlüssel oder Signatur im falschen Format false zurück, ohne zu werfen", () => {
    const pair = generateSigningKey();
    const data = utf8("x");
    const signature = sign(pair.privateKey, data);
    for (const badKey of ["", "kurz", `${pair.publicKey}=`, `${pair.publicKey}A`, "!".repeat(43)]) {
      expect(verify(badKey, data, signature)).toBe(false);
    }
    for (const badSig of [
      "",
      "kurz",
      `${signature}A`,
      signature.slice(1),
      `${signature}==`,
      "!".repeat(86),
    ]) {
      expect(verify(pair.publicKey, data, badSig)).toBe(false);
    }
  });

  it("meldet einen ungültigen privaten Schlüssel", () => {
    for (const bad of ["", "kurz", "!".repeat(43), `${generateSigningKey().privateKey}A`]) {
      for (const fn of [() => sign(bad, utf8("x")), () => publicKeyOf(bad)]) {
        let caught: unknown;
        try {
          fn();
        } catch (error) {
          caught = error;
        }
        expect(isCryptoError(caught, "format_ungueltig")).toBe(true);
      }
    }
  });

  // Quelle: RFC 8032, Abschnitt 7.1 (Testvektoren für Ed25519), TEST 1 und TEST 2.
  const vectors = [
    {
      name: "TEST 1 (leere Nachricht)",
      secret: "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60",
      pub: "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a",
      message: "",
      signature:
        "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b",
    },
    {
      name: "TEST 2 (ein Byte)",
      secret: "4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb",
      pub: "3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c",
      message: "72",
      signature:
        "92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00",
    },
  ];

  it.each(vectors)("RFC 8032 $name", ({ secret, pub, message, signature }) => {
    expect(publicKeyOf(b64(secret))).toBe(b64(pub));
    expect(sign(b64(secret), fromHex(message))).toBe(b64(signature));
    expect(verify(b64(pub), fromHex(message), b64(signature))).toBe(true);
    expect(verify(b64(pub), fromHex(`${message}00`), b64(signature))).toBe(false);
  });
});

describe("fingerprint", () => {
  it("liefert vier Vierergruppen aus Hex klein", () => {
    const { publicKey } = generateSigningKey();
    expect(fingerprint(publicKey)).toMatch(/^[0-9a-f]{4}(-[0-9a-f]{4}){3}$/);
    expect(fingerprint(publicKey)).toBe(fingerprint(publicKey));
    expect(fingerprint(publicKey)).not.toBe(fingerprint(generateSigningKey().publicKey));
  });

  it("nimmt die ersten 8 Byte von SHA-256 über die 32 Rohbyte", () => {
    // SHA-256 über 32 Nullbytes (bekannter Wert): 66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925
    expect(fingerprint(toBase64Url(new Uint8Array(32)))).toBe("6668-7aad-f862-bd77");
  });

  it("meldet einen Schlüssel im falschen Format", () => {
    for (const bad of ["", "kurz", `${generateSigningKey().publicKey}A`]) {
      let caught: unknown;
      try {
        fingerprint(bad);
      } catch (error) {
        caught = error;
      }
      expect(isCryptoError(caught, "format_ungueltig")).toBe(true);
    }
  });
});
