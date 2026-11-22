/**
 * PaiBot – Tests der Bereinigung von Namen, Eingaben und Ergebnissen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { describe, expect, it } from "vitest";
import { TEST_FOREIGN_CLEAN, TEST_FOREIGN_TEXT } from "../testing/werkzeuge";
import {
  cleanJson,
  cleanText,
  hasUnwanted,
  jsonHasNonInteger,
  jsonHasUnwanted,
  RAW_NAME_MAX_CHARS,
  rawToolName,
} from "./bereinigen";

// Gegenprobe je Fall: Bereinigung aus (Text unverändert zurückgeben) → rot.
describe("Bereinigen", () => {
  it("entfernt Steuerzeichen außer Zeilenumbruch und Tabulator", () => {
    expect(cleanText("a\u0000b\u0007c\u001bd\u007fe\u0085f")).toBe("abcdef");
    expect(cleanText("Zeile\nzwei\tTab")).toBe("Zeile\nzwei\tTab");
  });

  it("entfernt Bidi-Zeichen U+202A–U+202E, U+2066–U+2069, U+200E, U+200F, U+061C", () => {
    const bidi = "\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069\u200e\u200f\u061c";
    expect(cleanText(`x${bidi}y`)).toBe("xy");
  });

  it("entfernt unsichtbare Zeichen U+200B–U+200D, U+2060, U+FEFF und normalisiert auf NFC", () => {
    expect(cleanText("a\u200bb\u200cc\u200dd\u2060e\ufefff")).toBe("abcdef");
    expect(cleanText("é")).toBe("é");
    expect(cleanText(TEST_FOREIGN_TEXT)).toBe(TEST_FOREIGN_CLEAN);
  });

  it("roher Name: bereinigt, höchstens 64 Zeichen, leer → weggelassen; `<script>` bleibt Text", () => {
    const name = `\u0007\u202e\u200b<script>${"x".repeat(300)}`;
    const raw = rawToolName(name) ?? "";
    expect(raw.startsWith("<script>")).toBe(true);
    expect(Array.from(raw)).toHaveLength(RAW_NAME_MAX_CHARS);
    expect(hasUnwanted(raw)).toBe(false);
    expect(rawToolName("\u200b\u202e")).toBeUndefined();
    expect(rawToolName("")).toBeUndefined();
    // nie mitten in einem Zeichen gekürzt
    expect(Array.from(rawToolName("😀".repeat(70)) ?? "")).toHaveLength(64);
  });

  it("erkennt Steuer-, Bidi- und unsichtbare Zeichen in einer Eingabe (auch in Schlüsseln)", () => {
    expect(jsonHasUnwanted({ q: "a\u202eb" })).toBe(true);
    expect(jsonHasUnwanted({ "k\u200b": 1 })).toBe(true);
    expect(jsonHasUnwanted({ q: ["ok", { r: "\u0001" }] })).toBe(true);
    expect(jsonHasUnwanted({ q: "ok\n" })).toBe(false);
    expect(cleanJson({ "k\u200b": ["a\u202eb"] })).toEqual({ k: ["ab"] });
  });

  // Gegenprobe: die Liste aus der ersten Fassung (nur Steuer-, Bidi- und wenige unsichtbare
  // Zeichen) → jede dieser Zeilen rot.
  it.each([
    ["Tag-Zeichen U+E0001, U+E0020–U+E007F", "\u{e0001}\u{e0020}\u{e0041}\u{e0062}\u{e007f}"],
    ["weiches Trennzeichen U+00AD", "\u00ad"],
    ["unsichtbare Operatoren U+2061–U+2064", "\u2061\u2062\u2063\u2064"],
    ["veraltete Format-Zeichen U+206A–U+206F", "\u206a\u206b\u206c\u206d\u206e\u206f"],
    ["Anmerkungs-Zeichen U+FFF9–U+FFFB", "\ufff9\ufffa\ufffb"],
    ["Variationswähler U+FE00–U+FE0F", "\ufe00\ufe01\ufe0e\ufe0f"],
    ["Variationswähler U+E0100–U+E01EF", "\u{e0100}\u{e0150}\u{e01ef}"],
    ["Mongolischer Vokal-Trenner U+180E", "\u180e"],
    ["Füllzeichen U+115F, U+1160, U+3164, U+FFA0", "\u115f\u1160\u3164\uffa0"],
    ["Zeilen- und Absatztrenner U+2028, U+2029", "\u2028\u2029"],
    ["unsichtbarer Verbinder U+034F", "\u034f"],
  ])("entfernt und erkennt: %s", (_name, zeichen) => {
    expect(hasUnwanted(`a${zeichen}b`)).toBe(true);
    expect(cleanText(`a${zeichen}b`)).toBe("ab");
    expect(jsonHasUnwanted({ q: `a${zeichen}b` })).toBe(true);
    expect(cleanJson({ [`k${zeichen}`]: [`a${zeichen}b`] })).toEqual({ k: ["ab"] });
    expect(rawToolName(zeichen.repeat(64))).toBeUndefined();
  });

  // Gegenprobe: `\p{L}` oder `\p{So}` in die Liste aufnehmen → rot.
  it("sichtbare Zeichen bleiben: Umlaute, Emoji, chinesische, japanische und koreanische Schrift", () => {
    const sichtbar = [
      "Grüße aus Köln, Maß und Fuß",
      "😀 👍🏽 🎉 € → ✓",
      "中文文本",
      "日本語のテキスト",
      "한국어",
      "مرحبا",
      "Zeile\nzwei\tTab",
    ];
    for (const text of sichtbar) {
      expect(cleanText(text), text).toBe(text.normalize("NFC"));
      expect(hasUnwanted(text), text).toBe(false);
    }
    // U+FE0F ändert nur die Darstellung: Das Herz bleibt, nur als Schrift statt als Bild.
    expect(cleanText("\u2764\ufe0f")).toBe("\u2764");
  });

  it("erkennt Zahlen, die keine sicheren Ganzzahlen sind", () => {
    expect(jsonHasNonInteger({ zahl: 1.5 })).toBe(true);
    expect(jsonHasNonInteger([1, [2, { a: 2 ** 60 }]])).toBe(true);
    expect(jsonHasNonInteger({ a: 1, b: [2, 3] })).toBe(false);
  });
});
