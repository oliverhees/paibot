/**
 * PaiBot – Tests für die gemeinsamen Funktionen, z. B. die Sprachauswahl.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-07
 */

import { describe, expect, it } from "vitest";
import pkg from "../package.json";
import { resolveLocale } from "./index";

describe("resolveLocale", () => {
  it("erkennt unterstützte Sprachen", () => {
    expect(resolveLocale("en-US")).toBe("en");
    expect(resolveLocale("de_DE")).toBe("de");
  });

  it("fällt auf Deutsch zurück", () => {
    expect(resolveLocale("fr")).toBe("de");
    expect(resolveLocale(undefined)).toBe("de");
  });
});

describe("Paket-Exporte", () => {
  it("jeder Unterpfad lässt sich laden, einzige Abhängigkeit ist zod", async () => {
    expect(Object.keys(pkg.dependencies)).toEqual(["zod"]);
    for (const target of Object.values(pkg.exports)) {
      const module: object = await import(`../${target.slice(2)}`);
      expect(Object.keys(module).length).toBeGreaterThan(0);
    }
  });

  it("die bisherigen Exporte bleiben erhalten", async () => {
    const shared = await import("./index");
    expect(shared.APP_NAME).toBe("PaiBot");
    expect(shared.DEFAULT_LOCALE).toBe("de");
    expect(shared.SUPPORTED_LOCALES).toEqual(["de", "en"]);
  });
});
