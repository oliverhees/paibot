/**
 * PaiBot – Tests der Textbereinigung für Bot-Text im Faden.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { describe, expect, it } from "vitest";
import { ersteZeile, hatLink, kuerze, NAME_MAX, reinerText, sauberName } from "./text";

describe("reinerText", () => {
  it("entfernt Richtungs-, unsichtbare und Steuerzeichen", () => {
    expect(reinerText("a\u202eb\u200bc\u2066d\u0007e\ufeff")).toBe("abcde");
  });
  it("macht aus fremden Zeilentrennern \\n", () => {
    expect(reinerText("a\r\nb\u2028c\u2029d\re")).toBe("a\nb\nc\nd\ne");
  });
  it("lässt HTML als Text stehen (es wird später nie als HTML eingesetzt)", () => {
    expect(reinerText('<img src="x" onerror="x()"> <script>x</script>')).toBe(
      '<img src="x" onerror="x()"> <script>x</script>',
    );
  });
  it("kürzt auf die Höchstlänge mit „…“; Gegenprobe: kurzer Text bleibt ganz", () => {
    expect(Array.from(reinerText("x".repeat(5000))).length).toBe(4000);
    expect(reinerText("kurz")).toBe("kurz");
    expect(kuerze("abc", 3)).toBe("abc");
    expect(kuerze("abcd", 3)).toBe("ab…");
  });
  it("Nicht-Text ergibt leeren Text", () => {
    expect(reinerText(undefined)).toBe("");
    expect(reinerText(42)).toBe("");
  });
});

describe("sauberName und ersteZeile", () => {
  it("Name: eine Zeile, begrenzt, nie leer", () => {
    expect(sauberName("Ben\nBösewicht\u202e")).toBe("Ben Bösewicht");
    expect(Array.from(sauberName("N".repeat(300))).length).toBe(NAME_MAX);
    expect(sauberName("   ")).toBe("?");
    expect(sauberName(null)).toBe("?");
  });
  it("erste Zeile überspringt leere Zeilen", () => {
    expect(ersteZeile("\n\n  Titel  \nRest")).toBe("Titel");
  });
});

describe("hatLink", () => {
  it("erkennt Adressen", () => {
    expect(hatLink("https://beispiel.invalid")).toBe(true);
    expect(hatLink("www.beispiel.invalid")).toBe(true);
    expect(hatLink("javascript:alert(1)")).toBe(true);
    expect(hatLink("data:text/html,x")).toBe(true);
    expect(hatLink("Nur Text mit Doppelpunkt: so")).toBe(false);
  });
});
