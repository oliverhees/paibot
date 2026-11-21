/**
 * PaiBot – Tests der Rate-Limits: Schlüssel, sperren, verzögern, unbekannte Adresse.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { createTestDb } from "@paibot/db/testing";
import { RATE_LIMITS } from "@paibot/shared/konstanten";
import { describe, expect, it } from "vitest";
import { UNBEKANNTE_ADRESSE } from "./kopfzeilen";
import { limitSchluessel, wirkung, zaehleLimits } from "./rate-limit";

const now = new Date("2026-11-20T10:00:00.000Z");

describe("Rate-Limits", () => {
  it("Schlüssel laut Vorgabe", () => {
    const b = { adresse: "203.0.113.7", ownerId: "bes_06f8k2m9qz3w7x1c4b5n8p0r2t" as never };
    expect(limitSchluessel("anmeldenIp", b)).toBe("anmelden:ip:203.0.113.7");
    expect(limitSchluessel("anmeldenGesamt", b)).toBe("anmelden:gesamt");
    expect(limitSchluessel("einrichtungIp", b)).toBe("einrichtung:ip:203.0.113.7");
    expect(limitSchluessel("verbindungstestIp", b)).toBe("verbindungstest:ip:203.0.113.7");
    expect(limitSchluessel("nachricht", b)).toBe("nachricht:bes_06f8k2m9qz3w7x1c4b5n8p0r2t");
  });

  it("sperrt über dem Limit mit Retry-After; das Gesamt-Limit bremst auf einen Versuch je Takt", async () => {
    const { db } = await createTestDb();
    const gewartet: number[] = [];
    const opt = { now, warten: async (ms: number) => void gewartet.push(ms) };
    for (let i = 0; i < 5; i += 1) await zaehleLimits(db, ["anmeldenIp"], { adresse: "a" }, opt);
    await expect(zaehleLimits(db, ["anmeldenIp"], { adresse: "a" }, opt)).rejects.toMatchObject({
      code: "zu_viele_versuche",
      retryAfterSeconds: expect.any(Number),
    });
    for (let i = 0; i < RATE_LIMITS.anmeldenGesamt.max; i += 1) {
      await zaehleLimits(db, ["anmeldenGesamt"], { adresse: `x${i}` }, opt);
    }
    // Über der Schwelle: der erste Versuch im Takt kommt durch, der nächste nicht.
    await zaehleLimits(db, ["anmeldenGesamt"], { adresse: "y1" }, opt);
    await expect(
      zaehleLimits(db, ["anmeldenGesamt"], { adresse: "y2" }, opt),
    ).rejects.toMatchObject({ code: "zu_viele_versuche", retryAfterSeconds: expect.any(Number) });
    const spaeter = { ...opt, now: new Date(now.getTime() + 2000) };
    await zaehleLimits(db, ["anmeldenGesamt"], { adresse: "y3" }, spaeter);
    expect(gewartet).toEqual([]);
  });

  it("bei unbekannter Adresse sperren die Limits je Adresse nie, sie verzögern nur", async () => {
    const { db } = await createTestDb();
    const gewartet: number[] = [];
    const bezug = { adresse: UNBEKANNTE_ADRESSE };
    for (let i = 0; i < 12; i += 1) {
      await zaehleLimits(db, ["anmeldenIp", "einrichtungIp", "verbindungstestIp"], bezug, {
        now,
        warten: async (ms) => void gewartet.push(ms),
      });
    }
    expect(gewartet.length).toBeGreaterThan(0);
    expect(wirkung("anmeldenIp", RATE_LIMITS.anmeldenIp, bezug)).toBe("verzoegern");
    expect(wirkung("anmeldenIp", RATE_LIMITS.anmeldenIp, { adresse: "1.2.3.4" })).toBe("sperren");
    expect(wirkung("nachricht", RATE_LIMITS.nachricht, bezug)).toBe("sperren");
  });
});
