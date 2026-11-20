/**
 * PaiBot – Tests: Rate-Limits beim Anmelden und in der Einrichtung, Verbindungstest der Einrichtung.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { describe, expect, it } from "vitest";
import { PASSWORD_HASH_CONCURRENCY, RATE_LIMIT_KEYS, RATE_LIMITS } from "./constants";
import { setupConnectionTestInput } from "./inputs";

describe("Rate-Limits", () => {
  it("jedes Limit hat einen Schlüssel und umgekehrt", () => {
    expect(Object.keys(RATE_LIMITS).sort()).toEqual(Object.keys(RATE_LIMIT_KEYS).sort());
  });

  it("das Gesamt-Limit beim Anmelden verzögert nur, das Limit je Adresse sperrt", () => {
    expect(RATE_LIMITS.anmeldenGesamt.effect).toBe("verzoegern");
    expect(RATE_LIMITS.anmeldenGesamt.delayMs).toBeGreaterThan(0);
    expect(RATE_LIMITS.anmeldenIp.effect).toBe("sperren");
    for (const [name, limit] of Object.entries(RATE_LIMITS)) {
      if (name !== "anmeldenGesamt") expect(limit.effect, name).toBe("sperren");
    }
    expect(PASSWORD_HASH_CONCURRENCY).toBe(2);
  });

  it("der Verbindungstest der Einrichtung hat ein Limit je Adresse", () => {
    expect(RATE_LIMIT_KEYS.verbindungstestIp("203.0.113.7")).toBe("verbindungstest:ip:203.0.113.7");
    expect(RATE_LIMITS.verbindungstestIp).toMatchObject({ effect: "sperren" });
  });
});

describe("Verbindungstest der Einrichtung", () => {
  it("verlangt Einrichtungs-Code und neuen Schlüssel, nimmt keinen Anbieter an", () => {
    expect(
      setupConnectionTestInput.parse({ setupCode: "k7qd9m2fxw4h", apiKey: "sk-test" }),
    ).toEqual({ setupCode: "K7QD-9M2F-XW4H", apiKey: "sk-test" });
    expect(setupConnectionTestInput.safeParse({ apiKey: "sk-test" }).success).toBe(false);
    expect(setupConnectionTestInput.safeParse({ setupCode: "K7QD-9M2F-XW4H" }).success).toBe(false);
    expect(
      setupConnectionTestInput.safeParse({
        setupCode: "K7QD-9M2F-XW4H",
        apiKey: "sk-test",
        providerId: "anb_06f8k2m9qz3w7x1c4b5n8p0r2t",
      }).success,
    ).toBe(false);
  });
});
