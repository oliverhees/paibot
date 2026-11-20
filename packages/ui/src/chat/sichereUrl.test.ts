/**
 * PaiBot – Tests der Prüfung von Link-Adressen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { describe, expect, it } from "vitest";
import { sichereUrl } from "./sichereUrl";

describe("sichere Links", () => {
  it("lässt http und https durch", () => {
    expect(sichereUrl("https://paibot.de/doku")).toBe("https://paibot.de/doku");
    expect(sichereUrl("http://example.org")).toBe("http://example.org/");
    expect(sichereUrl("  https://example.org/a  ")).toBe("https://example.org/a");
  });

  it("weist gefährliche und unklare Adressen ab", () => {
    for (const adresse of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "data:text/html,<b>x</b>",
      "vbscript:x",
      "file:///etc/passwd",
      "mailto:max@example.org",
      "/belege",
      "//example.org",
      "java\tscript:alert(1)",
      "https://example.org\u0000",
      "https://nutzer:geheim@example.org",
      "",
    ]) {
      expect(sichereUrl(adresse), adresse).toBeNull();
    }
    expect(sichereUrl(undefined)).toBeNull();
    expect(sichereUrl(null)).toBeNull();
  });
});
