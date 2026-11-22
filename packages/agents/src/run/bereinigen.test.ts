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

  it("erkennt Zahlen, die keine sicheren Ganzzahlen sind", () => {
    expect(jsonHasNonInteger({ zahl: 1.5 })).toBe(true);
    expect(jsonHasNonInteger([1, [2, { a: 2 ** 60 }]])).toBe(true);
    expect(jsonHasNonInteger({ a: 1, b: [2, 3] })).toBe(false);
  });
});
