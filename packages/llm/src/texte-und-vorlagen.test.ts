/**
 * PaiBot – Tests: jeder Grund der Anbieter-Schicht und des Krypto-Pakets hat einen Text, und die
 * Vorlagen passen zur Liste der Vorlagen-Schlüssel.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { CRYPTO_ERROR_REASONS } from "@paibot/crypto";
import { PROVIDER_TEMPLATE_KEYS } from "@paibot/shared/objekte";
import { isTextKey, TEXT_KEYS } from "@paibot/shared/texte";
import { describe, expect, it } from "vitest";
import { BASE_URL_PROBLEMS, baseUrlProblemKey, checkProviderBaseUrl } from "./egress";
import { CUSTOM_PROVIDER_TEMPLATE, PROVIDER_TEMPLATES } from "./templates";

describe("Texte zu den Gründen", () => {
  it("jedes Problem einer Basis-URL hat einen Text, und es gibt keine übrigen", () => {
    for (const problem of BASE_URL_PROBLEMS) {
      expect(isTextKey(baseUrlProblemKey(problem)), problem).toBe(true);
    }
    const known = new Set<string>(BASE_URL_PROBLEMS.map(baseUrlProblemKey));
    for (const key of TEXT_KEYS.filter((k) => k.startsWith("anbieter.url."))) {
      expect(known.has(key), key).toBe(true);
    }
  });

  it("das Problem „port“ entsteht und hat seinen eigenen Text", () => {
    const check = checkProviderBaseUrl("https://api.eurouter.ai:5432/v1", "eu");
    expect(check).toEqual({ ok: false, problem: "port" });
    expect(isTextKey("anbieter.url.port")).toBe(true);
  });

  it("jeder Grund des Krypto-Pakets hat einen Text, und es gibt keine übrigen", () => {
    for (const reason of CRYPTO_ERROR_REASONS) {
      expect(isTextKey(`krypto.${reason}`), reason).toBe(true);
    }
    const known = new Set<string>(CRYPTO_ERROR_REASONS.map((reason) => `krypto.${reason}`));
    for (const key of TEXT_KEYS.filter((k) => k.startsWith("krypto."))) {
      expect(known.has(key), key).toBe(true);
    }
  });
});

describe("Vorlagen", () => {
  it("Vorlagen und eigener Anbieter ergeben genau die Liste der Vorlagen-Schlüssel", () => {
    const keys = [...Object.keys(PROVIDER_TEMPLATES), CUSTOM_PROVIDER_TEMPLATE.key];
    expect(keys.sort()).toEqual([...PROVIDER_TEMPLATE_KEYS].sort());
  });
});
