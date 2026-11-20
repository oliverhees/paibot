/**
 * PaiBot – Tests: Zusatzdaten für Geheimnisse, Abdruck des Ziels und Formate verschlüsselter Werte.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { describe, expect, it } from "vitest";
import { ACTIONS } from "./actions";
import {
  providerSecretBinding,
  SECRET_AAD_PREFIX,
  secretAad,
  signingKeySecretBinding,
  targetDigestInput,
  targetOrigin,
} from "./bindung";
import { encryptedSecretSchema, PATTERN_SOURCES } from "./grundtypen";
import { type KeyId, newId, type ProviderId } from "./id";

const providerId = "anb_06f8k2m9qz3w7x1c4b5n8p0r2t" as ProviderId;
const keyId = "sch_06f8k2m9qz3w7x1c4b5n8p0r2t" as KeyId;
const IV = "A".repeat(16);
const TAG = "B".repeat(22);

describe("Zusatzdaten verschlüsselter Werte", () => {
  it("binden den Anbieter-Schlüssel an Tabelle, Datensatz, Zweck und Host", () => {
    const aad = secretAad(providerSecretBinding(providerId, "https://api.eurouter.ai/v1"));
    expect(aad).toBe(
      `${SECRET_AAD_PREFIX}\nproviders\n${providerId}\napi_key\nhttps://api.eurouter.ai`,
    );
  });

  it("ändern sich mit dem Host, nicht mit dem Pfad", () => {
    const a = secretAad(providerSecretBinding(providerId, "https://api.eurouter.ai/v1"));
    const b = secretAad(providerSecretBinding(providerId, "https://api.eurouter.ai/v2"));
    const c = secretAad(providerSecretBinding(providerId, "https://anderer-host.example/v1"));
    const d = secretAad(providerSecretBinding(newId("provider"), "https://api.eurouter.ai/v1"));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toBe(d);
  });

  it("binden den Signaturschlüssel an seinen öffentlichen Teil", () => {
    const publicKey = `${"x".repeat(42)}A`;
    expect(secretAad(signingKeySecretBinding(keyId, publicKey))).toBe(
      `${SECRET_AAD_PREFIX}\ninstallation_keys\n${keyId}\nprivate_key\n${publicKey}`,
    );
  });

  it("lehnen leere Teile und Zeilenumbrüche ab", () => {
    expect(() =>
      secretAad({ table: "providers", id: providerId, purpose: "api_key", extra: "" }),
    ).toThrow(TypeError);
    expect(() =>
      secretAad({ table: "providers", id: providerId, purpose: "api_key", extra: "a\nb" }),
    ).toThrow(TypeError);
  });
});

describe("Format verschlüsselter Werte", () => {
  it("nimmt v1 und v2 an, v2 mit festen Längen für IV und Tag", () => {
    expect(encryptedSecretSchema.safeParse("v1:aa:bb:cc").success).toBe(true);
    expect(encryptedSecretSchema.safeParse(`v2:${IV}:${TAG}:cc`).success).toBe(true);
    expect(encryptedSecretSchema.safeParse(`v2:${IV}x:${TAG}:cc`).success).toBe(false);
    expect(encryptedSecretSchema.safeParse(`v2:${IV}:${TAG}:`).success).toBe(false);
    expect(encryptedSecretSchema.safeParse(`v3:${IV}:${TAG}:cc`).success).toBe(false);
    expect(encryptedSecretSchema.safeParse("klartext").success).toBe(false);
    expect(new RegExp(PATTERN_SOURCES.encryptedV2).test(`v2:${IV}:${TAG}:cc`)).toBe(true);
  });
});

describe("Ziel einer Modell-Anfrage", () => {
  it("Abdruck-Text ist kanonisches JSON mit festem Präfix", () => {
    expect(targetDigestInput(providerId, "https://api.eurouter.ai/v1")).toBe(
      `pb-ziel/v1\n{"baseUrl":"https://api.eurouter.ai/v1","providerId":"${providerId}"}`,
    );
    expect(targetOrigin("https://api.eurouter.ai/v1?x=1")).toBe("https://api.eurouter.ai");
  });

  it("Fakten von modell.anfragen nehmen Ziel und Abdruck an, aber keine URL mit Pfad", () => {
    const facts = ACTIONS["modell.anfragen"].facts;
    const shape = facts.shape;
    expect(shape.targetOrigin.safeParse("https://api.eurouter.ai").success).toBe(true);
    expect(shape.targetOrigin.safeParse("https://api.eurouter.ai/v1").success).toBe(false);
    expect(shape.targetOrigin.safeParse("https://a@b.example").success).toBe(false);
    expect(shape.targetDigest.safeParse(`sha256:${"0".repeat(64)}`).success).toBe(true);
  });
});
