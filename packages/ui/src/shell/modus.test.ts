/**
 * PaiBot – Tests der Darstellung je Breite.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { describe, expect, it } from "vitest";
import { flaecheModal, flaecheUeberlagert, navAlsMenue, shellModus } from "./modus";

describe("Darstellung der AppShell", () => {
  it("wählt den Modus nach der Breite", () => {
    expect(shellModus(390)).toBe("handy");
    expect(shellModus(719)).toBe("handy");
    expect(shellModus(720)).toBe("schmal");
    expect(shellModus(768)).toBe("schmal");
    expect(shellModus(1024)).toBe("mittel");
    expect(shellModus(1179)).toBe("mittel");
    expect(shellModus(1180)).toBe("breit");
    expect(shellModus(1440)).toBe("breit");
  });

  it("legt Menü, Überlagerung und Blatt passend fest", () => {
    expect(navAlsMenue("handy")).toBe(true);
    expect(navAlsMenue("schmal")).toBe(true);
    expect(navAlsMenue("mittel")).toBe(false);
    expect(flaecheUeberlagert("breit")).toBe(false);
    expect(flaecheUeberlagert("mittel")).toBe(true);
    expect(flaecheModal("handy")).toBe(true);
    expect(flaecheModal("schmal")).toBe(false);
  });
});
