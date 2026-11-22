/**
 * PaiBot – Test: Doku-Check, Index-Bau (`scripts/doku-index/hilfen.mjs`) und der Lader des Index
 * (`bereinigen.ts#hasUnwanted`) erkennen genau dieselben unsichtbaren Zeichen. Zwei Fassungen
 * derselben Liste lassen sich nicht vermeiden (die Skripte sind reines Node ohne Build, der Lader
 * ist TypeScript im Paket); dieser Test vergleicht sie für jeden Codepunkt von U+0000 bis
 * U+10FFFF und wird rot, sobald eine abweicht.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { hasUnwanted } from "../../run/bereinigen";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const hilfen = (await import(
  pathToFileURL(path.join(ROOT, "scripts", "doku-index", "hilfen.mjs")).href
)) as {
  istUnsichtbar: (zeichen: string) => boolean;
  findeUnsichtbares: (text: string) => { zeile: number; code: string }[];
  entferneUnsichtbares: (text: string) => string;
};

const cp = (n: number) => String.fromCodePoint(n);

/** Je Klasse ein Zeichen, das der Doku-Check ablehnen muss (Schreibweise nur als Codepunkt). */
const KLASSEN: [string, number][] = [
  ["Steuerzeichen U+0007", 0x07],
  ["Steuerzeichen U+0000", 0x00],
  ["Rückschritt-Steuerzeichen U+007F", 0x7f],
  ["Steuerzeichen U+0085", 0x85],
  ["weiches Trennzeichen U+00AD", 0xad],
  ["Verbinder U+034F", 0x34f],
  ["Arabisches Zeichen U+061C", 0x61c],
  ["Füllzeichen U+115F", 0x115f],
  ["Füllzeichen U+1160", 0x1160],
  ["mongolischer Variationswähler U+180B", 0x180b],
  ["mongolisches Trennzeichen U+180E", 0x180e],
  ["Nullbreite U+200B", 0x200b],
  ["Bidi U+200E", 0x200e],
  ["Bidi U+202E", 0x202e],
  ["Zeilentrenner U+2028", 0x2028],
  ["Absatztrenner U+2029", 0x2029],
  ["Wortverbinder U+2060", 0x2060],
  ["nicht vergebene Stelle U+2065", 0x2065],
  ["Bidi U+2066", 0x2066],
  ["Füllzeichen U+3164", 0x3164],
  ["Variationswähler U+FE00", 0xfe00],
  ["Variationswähler U+FE0F", 0xfe0f],
  ["Byte-Order-Zeichen U+FEFF", 0xfeff],
  ["Füllzeichen U+FFA0", 0xffa0],
  ["Tag-Zeichen U+E0001", 0xe0001],
  ["Tag-Zeichen U+E0041", 0xe0041],
  ["Tag-Zeichen U+E007F", 0xe007f],
  ["Variationswähler U+E0100", 0xe0100],
  ["Variationswähler U+E01EF", 0xe01ef],
];

/** Sichtbare Zeichen, die bleiben müssen. */
const SICHTBAR: number[] = [
  0x09, 0x0a, 0x20, 0x41, 0xe4, 0xdf, 0x20ac, 0x2800, 0x4e2d, 0x3042, 0x1f600, 0x2764, 0xe000,
  0xf0000,
];

describe("Doku-Check, Index-Bau und Lader erkennen dieselben unsichtbaren Zeichen", () => {
  it.each(KLASSEN)("%s: Skripte und Lader lehnen es ab", (_name, n) => {
    expect(hilfen.istUnsichtbar(cp(n))).toBe(true);
    expect(hasUnwanted(cp(n))).toBe(true);
  });

  it("sichtbare Zeichen (Umlaute, Euro, Emoji, CJK, Zeilenumbruch, Tabulator) bleiben erlaubt", () => {
    for (const n of SICHTBAR) {
      expect(hilfen.istUnsichtbar(cp(n)), `U+${n.toString(16)}`).toBe(false);
      expect(hasUnwanted(cp(n)), `U+${n.toString(16)}`).toBe(false);
    }
  });

  // Gegenprobe: die Liste in `hilfen.mjs` auf die alte, schmale Menge zurücksetzen (C0/C1,
  // U+200B–U+200F, U+202A–U+202E, U+2066–U+2069, U+FEFF) → rot, mit den abweichenden Codepunkten.
  it("für jeden Codepunkt U+0000 bis U+10FFFF liefern beide dasselbe", () => {
    const abweichend: string[] = [];
    for (let n = 0; n <= 0x10ffff; n += 1) {
      const zeichen = cp(n);
      if (hilfen.istUnsichtbar(zeichen) !== hasUnwanted(zeichen)) {
        abweichend.push(`U+${n.toString(16).toUpperCase().padStart(4, "0")}`);
        if (abweichend.length >= 10) break;
      }
    }
    expect(abweichend).toEqual([]);
  });

  it("findeUnsichtbares nennt Zeile und Zeichen als U+XXXX; entferneUnsichtbares lässt Zeilenumbruch und Tabulator", () => {
    const text = `eins\n\tzwei${cp(0xe0041)}\ndrei${cp(0xad)}`;
    expect(hilfen.findeUnsichtbares(text)).toEqual([
      { zeile: 2, code: "U+E0041" },
      { zeile: 3, code: "U+00AD" },
    ]);
    expect(hilfen.entferneUnsichtbares(text)).toBe("eins\n\tzwei\ndrei");
  });
});
