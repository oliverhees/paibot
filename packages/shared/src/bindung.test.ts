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
  normalizedBaseUrl,
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
  it("binden den Anbieter-Schlüssel an Tabelle, Datensatz, Zweck und die ganze Basis-URL", () => {
    const aad = secretAad(providerSecretBinding(providerId, "https://api.eurouter.ai/v1"));
    expect(aad).toBe(
      `${SECRET_AAD_PREFIX}\nproviders\n${providerId}\napi_key\nhttps://api.eurouter.ai/v1`,
    );
  });

  it("ändern sich mit Host, Port, Schema und Pfad", () => {
    const a = secretAad(providerSecretBinding(providerId, "https://api.eurouter.ai/v1"));
    const others = [
      "https://api.eurouter.ai/v2",
      "https://api.eurouter.ai/fremder-mandant/v1",
      "https://api.eurouter.ai",
      "https://api.eurouter.ai:8443/v1",
      "http://api.eurouter.ai/v1",
      "https://anderer-host.example/v1",
      "https://api.eurouter.ai/V1",
    ];
    for (const url of others) {
      expect(secretAad(providerSecretBinding(providerId, url)), url).not.toBe(a);
    }
    const d = secretAad(providerSecretBinding(newId("provider"), "https://api.eurouter.ai/v1"));
    expect(a).not.toBe(d);
  });

  it("gleiche Adresse in anderer Schreibweise ergibt dieselbe Bindung", () => {
    const a = secretAad(providerSecretBinding(providerId, "https://api.eurouter.ai/v1"));
    for (const url of [
      "https://api.eurouter.ai/v1/",
      "https://api.eurouter.ai/v1//",
      "HTTPS://API.EuRouter.AI/v1",
      "https://api.eurouter.ai:443/v1",
      "https://api.eurouter.ai/x/../v1",
    ]) {
      expect(secretAad(providerSecretBinding(providerId, url)), url).toBe(a);
    }
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

describe("Normalisierte Basis-URL", () => {
  it("Schema, Host, Port und Pfad ohne Schrägstrich am Ende", () => {
    expect(normalizedBaseUrl("https://api.eurouter.ai/v1/")).toBe("https://api.eurouter.ai/v1");
    expect(normalizedBaseUrl("https://api.eurouter.ai/")).toBe("https://api.eurouter.ai");
    expect(normalizedBaseUrl("http://127.0.0.1:8080/v1")).toBe("http://127.0.0.1:8080/v1");
    expect(normalizedBaseUrl("https://bücher.example/v1")).toBe("https://xn--bcher-kva.example/v1");
  });

  it("lehnt Abfrage, Anker, Zugangsdaten und andere Schemata ab, auch leer", () => {
    for (const url of [
      "https://api.eurouter.ai/v1?mandant=x",
      "https://api.eurouter.ai/v1?",
      "https://api.eurouter.ai/v1#x",
      "https://api.eurouter.ai/v1#",
      "https://nutzer:pw@api.eurouter.ai/v1",
      "ftp://api.eurouter.ai/v1",
      "keine url",
      "",
    ]) {
      expect(() => normalizedBaseUrl(url), url).toThrow(TypeError);
      expect(() => providerSecretBinding(providerId, url), url).toThrow(TypeError);
      expect(() => targetDigestInput(providerId, url), url).toThrow(TypeError);
    }
  });
});

describe("Ziel einer Modell-Anfrage", () => {
  it("Abdruck-Text ist kanonisches JSON mit festem Präfix", () => {
    expect(targetDigestInput(providerId, "https://api.eurouter.ai/v1")).toBe(
      `pb-ziel/v1\n{"baseUrl":"https://api.eurouter.ai/v1","providerId":"${providerId}"}`,
    );
    expect(targetDigestInput(providerId, "https://API.eurouter.ai:443/v1/")).toBe(
      targetDigestInput(providerId, "https://api.eurouter.ai/v1"),
    );
    expect(targetDigestInput(providerId, "https://api.eurouter.ai/anderer/v1")).not.toBe(
      targetDigestInput(providerId, "https://api.eurouter.ai/v1"),
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
