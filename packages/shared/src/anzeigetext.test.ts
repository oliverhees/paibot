/**
 * PaiBot – Tests: Namen fremder Herkunft werden vor Speichern und Anzeige bereinigt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { describe, expect, it } from "vitest";
import { anzeigeText, istAnzeigeText } from "./anzeigetext";

describe("anzeigeText", () => {
  it("entfernt Steuer-, Format- und Schreibrichtungs-Zeichen und fasst Leerraum zusammen", () => {
    expect(anzeigeText("  Mein‮  lokaler Dienst\u0007\n​ ", 100)).toBe("Mein lokaler Dienst");
    expect(anzeigeText("a b c؜d", 100)).toBe("abcd");
  });

  it("begrenzt die Länge in Zeichen und lässt HTML als Text stehen", () => {
    expect(anzeigeText("ä".repeat(150), 100)).toBe("ä".repeat(100));
    expect(anzeigeText("<b>x</b>", 100)).toBe("<b>x</b>");
  });

  it("nichts Sichtbares oder kein Text: undefined", () => {
    expect(anzeigeText("‎‏ \t", 10)).toBeUndefined();
    expect(anzeigeText(42, 10)).toBeUndefined();
    expect(istAnzeigeText("Mistral AI", 100)).toBe(true);
    expect(istAnzeigeText("Mistral  AI", 100)).toBe(false);
  });
});
