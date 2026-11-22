/**
 * PaiBot – Test: Bereinigung fremden Texts (unsichtbare Zeichen, Bilder, Länge, Zeit).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { describe, expect, it } from "vitest";
import { bereinigeText, entferneMarkdownBilder } from "./bereinigen";

const BESCHREIBUNG = { maxZeichen: 1_000, zeilenumbrueche: true };
const NAME = { maxZeichen: 128, zeilenumbrueche: false };

describe("bereinigeText", () => {
  it("entfernt Zeichen ohne Breite, Umkehr-Zeichen, Tags und Variationsauswahl", () => {
    const roh = `Hallo​ ‮Welt‬⁦!﻿\u{e0041}\u{e0100}­⁠`;
    const ergebnis = bereinigeText(roh, NAME);
    expect(ergebnis.text).toBe("Hallo Welt!");
    expect(ergebnis.veraendert).toBe(true);
  });

  it("entfernt Steuerzeichen, behält aber den Zeilenumbruch einer Beschreibung", () => {
    const ergebnis = bereinigeText("Zeile 1\u0000\u0007\r\nZeile 2\u009f Zeile 3", BESCHREIBUNG);
    expect(ergebnis.text).toBe("Zeile 1\nZeile 2\nZeile 3");
  });

  it("macht in Namen und Feldern aus Zeilenumbrüchen und Tabs ein Leerzeichen", () => {
    expect(bereinigeText("a\n\n b\tc d", NAME).text).toBe("a b c d");
  });

  it("entfernt einzelne Ersatz-Hälften, behält aber Emoji", () => {
    expect(bereinigeText("a\ud800b😀c\udc00", NAME).text).toBe("ab😀c");
  });

  it("entfernt Markdown-Bilder, auch mit Verweis-Namen", () => {
    expect(bereinigeText("vorher ![x](https://example.invalid/p.png) nachher", NAME).text).toBe(
      "vorher nachher",
    );
    expect(bereinigeText("a ![alt][ref] b", NAME).text).toBe("a b");
    expect(bereinigeText("kein ![bild ohne ende", NAME).text).toBe("kein ![bild ohne ende");
  });

  it("kürzt auf die Höchstlänge, mit Marke, und schneidet kein Emoji entzwei", () => {
    const ergebnis = bereinigeText("😀".repeat(50), {
      maxZeichen: 11,
      zeilenumbrueche: false,
      kuerzungsMarke: "…",
    });
    expect(ergebnis.gekuerzt).toBe(true);
    expect(ergebnis.text.length).toBeLessThanOrEqual(11);
    expect(/[\ud800-\udbff](?![\udc00-\udfff])/.test(ergebnis.text)).toBe(false);
    expect(ergebnis.text.endsWith("…")).toBe(true);
  });

  it("lässt gewöhnlichen Text unverändert", () => {
    const ergebnis = bereinigeText("Gibt den Text zurück, schnell & sicher (äöü ß).", NAME);
    expect(ergebnis).toEqual({
      text: "Gibt den Text zurück, schnell & sicher (äöü ß).",
      veraendert: false,
      gekuerzt: false,
    });
  });

  it("bleibt bei sehr langen und verwinkelten Eingaben schnell und werft nie", () => {
    const eingaben = [
      "![".repeat(2_000_000),
      "![a](".repeat(500_000),
      `![${"x".repeat(1_000_000)}`,
      "​".repeat(3_000_000),
      "a".repeat(5_000_000),
    ];
    for (const eingabe of eingaben) {
      const ergebnis = bereinigeText(eingabe, BESCHREIBUNG);
      expect(ergebnis.text.length).toBeLessThanOrEqual(1_000);
    }
  });
});

describe("entferneMarkdownBilder", () => {
  it("entfernt mehrere Bilder hintereinander und lässt Links stehen", () => {
    const ergebnis = entferneMarkdownBilder("![a](x)[Link](y)![b](z)!");
    expect(ergebnis).toEqual({ text: "[Link](y)!", entfernt: true });
  });

  it("verändert Text ohne Bilder nicht", () => {
    expect(entferneMarkdownBilder("Hallo! [x](y)")).toEqual({
      text: "Hallo! [x](y)",
      entfernt: false,
    });
  });
});
