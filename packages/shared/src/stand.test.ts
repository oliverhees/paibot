/**
 * PaiBot – Tests für Version und Stand der Software.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { describe, expect, it } from "vitest";
import projekt from "../../../package.json";
import { softwareStandSchema } from "./receipts";
import { PAIBOT_VERSION, readStand, STAND_ENV, versionOf } from "./stand";

describe("Stand der Software", () => {
  it("liest die Version aus dem package.json im Projektstamm", () => {
    expect(PAIBOT_VERSION).toBe(projekt.version);
    expect(PAIBOT_VERSION).toMatch(/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/);
  });

  it("nimmt PAIBOT_BUILD, sonst <version>+dev", () => {
    expect(STAND_ENV).toBe("PAIBOT_BUILD");
    expect(readStand({ PAIBOT_BUILD: "0.3.0+20261205.3f9c2ab" })).toBe("0.3.0+20261205.3f9c2ab");
    expect(readStand({})).toBe(`${PAIBOT_VERSION}+dev`);
    expect(readStand({ PAIBOT_BUILD: " " })).toBe(`${PAIBOT_VERSION}+dev`);
    expect(softwareStandSchema.safeParse(readStand({})).success).toBe(true);
  });

  it("versionOf lässt den Teil ab + weg", () => {
    expect(versionOf("0.3.0+20261205.3f9c2ab")).toBe("0.3.0");
    expect(versionOf("0.3.0-dev+dev")).toBe("0.3.0-dev");
    expect(versionOf("0.3.0")).toBe("0.3.0");
  });
});
