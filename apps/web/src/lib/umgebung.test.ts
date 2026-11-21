/**
 * PaiBot – Tests: Anbieter der Einrichtung aus der Umgebung, mit Anzeigename statt Host und Port.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { describe, expect, it } from "vitest";
import { einrichtungsAnbieter } from "./umgebung";

describe("Anbieter der Einrichtung", () => {
  it("ohne Angabe EUrouter mit festem Namen und Region EU", () => {
    expect(einrichtungsAnbieter({})).toMatchObject({ templateKey: "eurouter", region: "eu" });
    expect(einrichtungsAnbieter({}).name).toMatch(/EUrouter/);
  });

  it("ein Dienst im eigenen Netz heißt „Lokaler Anbieter“ und hat die Region lokal", () => {
    const a = einrichtungsAnbieter({
      PAIBOT_EINRICHTUNG_ANBIETER_URL: "http://127.0.0.1:18080/v1/",
    });
    expect(a).toEqual({
      templateKey: "eigener",
      name: "Lokaler Anbieter",
      baseUrl: "http://127.0.0.1:18080/v1",
      region: "local",
    });
    expect(a.name).not.toContain("127.0.0.1");
  });

  it("ein eigener Dienst im Netz heißt „Eigener Anbieter“, nie nach seinem Host", () => {
    const a = einrichtungsAnbieter({
      PAIBOT_EINRICHTUNG_ANBIETER_URL: "https://modelle.example.org/v1",
    });
    expect(a.name).toBe("Eigener Anbieter");
    expect(a.name).not.toContain("example");
  });

  it("eine ungültige Angabe fällt auf EUrouter zurück", () => {
    expect(einrichtungsAnbieter({ PAIBOT_EINRICHTUNG_ANBIETER_URL: "kein url" }).templateKey).toBe(
      "eurouter",
    );
  });
});
