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
