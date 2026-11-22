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
  jsonHasKeyClash,
  jsonHasNonInteger,
  jsonHasProtoKey,
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

describe("Schlüssel __proto__ und doppelte Schlüssel", () => {
  /** Ein Schlüssel, der erst durch das Bereinigen zu `__proto__` wird (unsichtbares Zeichen mittendrin). */
  const GETARNT = "__pro\u200bto__";

  // Gegenprobe: Prüfung auf `__proto__` aus `jsonHasUnwanted` entfernen → die ersten drei Fälle rot.
  it("eine Eingabe mit dem Schlüssel __proto__ gilt als unerwünscht, auch verschachtelt und getarnt", () => {
    expect(jsonHasUnwanted(JSON.parse('{"__proto__":{"frage":"x"}}'))).toBe(true);
    expect(jsonHasUnwanted(JSON.parse('{"a":{"__proto__":1}}'))).toBe(true);
    expect(jsonHasUnwanted(JSON.parse('{"a":[{"b":{"__proto__":null}}]}'))).toBe(true);
    expect(jsonHasUnwanted(JSON.parse(`{"${GETARNT}":1}`))).toBe(true);
    expect(jsonHasProtoKey(JSON.parse(`{"a":{"${GETARNT}":1}}`))).toBe(true);
    expect(jsonHasUnwanted({ frage: "x" })).toBe(false);
    // Schlüssel, die nur ähnlich heißen, bleiben erlaubt (als eigene Eigenschaft ohne Wirkung).
    expect(jsonHasUnwanted({ constructor: "x", prototype: "y", proto: "z", __proto: 1 })).toBe(
      false,
    );
  });

  // Gegenprobe: Prüfung auf doppelte Schlüssel aus `jsonHasUnwanted` entfernen → rot.
  it("zwei Schlüssel, die bereinigt gleich sind, machen die Eingabe unerwünscht (kein stilles Überschreiben)", () => {
    const zerlegt = JSON.parse('{"e\u0301":1,"\u00e9":2}');
    expect(Object.keys(zerlegt)).toHaveLength(2);
    expect(jsonHasKeyClash(zerlegt)).toBe(true);
    expect(jsonHasUnwanted(zerlegt)).toBe(true);
    expect(jsonHasKeyClash({ a: { "k\u200b": 1, k: 2 } })).toBe(true);
    expect(jsonHasKeyClash([{ a: 1 }, { b: 2 }])).toBe(false);
    expect(jsonHasUnwanted({ a: 1, b: 2, é: 3 })).toBe(false);
  });

  // Gegenprobe: in `cleanJson` wieder `out[cleanText(key)] = …` schreiben → rot.
  it.each([
    ["roh", '{"__proto__":{"x":"gefahr"},"y":"ok"}'],
    ["getarnt", `{"${GETARNT}":{"x":"gefahr"},"y":"ok"}`],
  ])(
    "cleanJson (%s): __proto__ bleibt eigene Eigenschaft, der Prototyp bleibt Object.prototype",
    (_name, text) => {
      const ergebnis = cleanJson(JSON.parse(text)) as Record<string, unknown>;
      expect(Object.hasOwn(ergebnis, "__proto__")).toBe(true);
      expect(Object.getPrototypeOf(ergebnis)).toBe(Object.prototype);
      expect(ergebnis.x).toBeUndefined();
      expect(Object.keys(ergebnis).sort()).toEqual(["__proto__", "y"]);
      expect(JSON.stringify(ergebnis)).toContain('"__proto__":{"x":"gefahr"}');
      expect(({} as Record<string, unknown>).x).toBeUndefined();
    },
  );
});

describe("Alle standardmäßig unsichtbaren Zeichen", () => {
  // Gegenprobe: die Liste der ersten Fassung (ohne `Default_Ignorable_Code_Point`) → jede Zeile rot.
  it.each([
    ["U+17B4", "\u{17b4}"],
    ["U+17B5", "\u{17b5}"],
    ["U+180B", "\u{180b}"],
    ["U+180C", "\u{180c}"],
    ["U+180D", "\u{180d}"],
    ["U+180F", "\u{180f}"],
    ["U+2065", "\u{2065}"],
    ["U+FFF0", "\u{fff0}"],
    ["U+FFF1", "\u{fff1}"],
    ["U+FFF2", "\u{fff2}"],
    ["U+FFF3", "\u{fff3}"],
    ["U+FFF4", "\u{fff4}"],
    ["U+FFF5", "\u{fff5}"],
    ["U+FFF6", "\u{fff6}"],
    ["U+FFF7", "\u{fff7}"],
    ["U+FFF8", "\u{fff8}"],
    ["U+E0000", "\u{e0000}"],
    ["U+E0002", "\u{e0002}"],
    ["U+E0080", "\u{e0080}"],
    ["U+E01F0", "\u{e01f0}"],
    ["U+E0FFF", "\u{e0fff}"],
  ])("%s wird erkannt und entfernt, auch in Schlüsseln und im rohen Namen", (_name, zeichen) => {
    expect(hasUnwanted(`a${zeichen}b`)).toBe(true);
    expect(cleanText(`a${zeichen}b`)).toBe("ab");
    expect(jsonHasUnwanted({ q: `a${zeichen}b` })).toBe(true);
    expect(jsonHasUnwanted({ [`k${zeichen}`]: 1 })).toBe(true);
    expect(cleanJson({ [`k${zeichen}`]: [`a${zeichen}b`] })).toEqual({ k: ["ab"] });
    expect(rawToolName(zeichen.repeat(64))).toBeUndefined();
    expect(rawToolName(`x${zeichen}y`)).toBe("xy");
  });

  // Gegenprobe: `\p{Co}` bzw. U+2800 aus `rawToolName` entfernen → die jeweilige Zeile rot.
  it.each([
    ["U+2800 (leeres Braille-Muster)", "\u2800"],
    ["U+E000 (privater Gebrauch)", "\ue000"],
    ["U+F0000 (privater Gebrauch, Ebene 15)", "\u{f0000}"],
  ])("roher Name: %s entfällt, im Text bleibt es stehen", (_name, zeichen) => {
    expect(rawToolName(zeichen.repeat(64))).toBeUndefined();
    expect(rawToolName(`x${zeichen}y`)).toBe("xy");
    expect(cleanText(`a${zeichen}b`)).toBe(`a${zeichen}b`);
    expect(hasUnwanted(`a${zeichen}b`)).toBe(false);
  });

  // Gegenprobe: `\p{Lo}` in die Liste aufnehmen → rot.
  it("sichtbare Zeichen bleiben: Buchstaben ohne Wähler, Khmer, Hindi, Braille-Punkte", () => {
    const sichtbar = [
      "\u1820\u1821\u1822\u1823", // mongolische Buchstaben ohne Variationswähler
      "\u1780\u1781\u1782\u17b6", // Khmer-Buchstaben und -Vokal
      "\u0939\u093f\u0928\u094d\u0926\u0940", // Hindi ohne Verbinder
      "\u2801\u2803\u2809", // Braille-Punkte (nicht U+2800)
    ];
    for (const text of sichtbar) {
      expect(cleanText(text), text).toBe(text.normalize("NFC"));
      expect(hasUnwanted(text), text).toBe(false);
      expect(rawToolName(text), text).toBe(text.normalize("NFC"));
    }
  });
});
