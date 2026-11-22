/**
 * PaiBot – Tests der Bereinigung von Namen, Eingaben und Ergebnissen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { BOUNDED_JSON_LIMITS, boundedJsonSchema } from "@paibot/shared/belege";
import { describe, expect, it } from "vitest";
import { TEST_FOREIGN_CLEAN, TEST_FOREIGN_TEXT } from "../testing/werkzeuge";
import {
  cleanJson,
  cleanText,
  ERGEBNIS_PRUEFUNG_GRENZEN,
  hasUnwanted,
  JSON_PRUEFUNG_GRENZEN,
  jsonHasKeyClash,
  jsonHasNonInteger,
  jsonHasNonJson,
  jsonHasProtoKey,
  jsonHasUnwanted,
  jsonUeberGrenzen,
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

// Diese Fälle belegen den Absatz „Sichtbare Folgen des Entfernens“ in `docs/entwickler/werkzeug-kern.md`.
describe("Sichtbare Folgen des Entfernens", () => {
  it("ZWNJ und ZWJ fallen weg; Emoji-Folgen zerfallen in ihre Teile", () => {
    expect(cleanText("\u0645\u06cc\u200c\u062e\u0648\u0627\u0647\u0645")).toBe(
      "\u0645\u06cc\u062e\u0648\u0627\u0647\u0645",
    );
    // Familie: Mann, Frau, Mädchen mit Verbindern → drei Personen
    expect(cleanText("\u{1f468}\u200d\u{1f469}\u200d\u{1f467}")).toBe(
      "\u{1f468}\u{1f469}\u{1f467}",
    );
    // Regenbogenflagge: Flagge, Wähler, Verbinder, Regenbogen → Flagge und Regenbogen
    expect(cleanText("\u{1f3f3}\ufe0f\u200d\u{1f308}")).toBe("\u{1f3f3}\u{1f308}");
    // Flagge aus Tag-Zeichen (England) → schwarze Flagge
    expect(cleanText("\u{1f3f4}\u{e0067}\u{e0062}\u{e0065}\u{e006e}\u{e0067}\u{e007f}")).toBe(
      "\u{1f3f4}",
    );
  });

  it("die sichtbaren Format-Zeichen U+0600 und U+06DD verschwinden", () => {
    expect(cleanText("a\u0600\u06ddb")).toBe("ab");
  });

  it("Umlaute, ß, €, Pfeile, Häkchen und Emoji mit Hautton bleiben", () => {
    const sichtbar = "\u00e4\u00f6\u00fc\u00df \u20ac \u2192\u2190 \u2713\u2714 \u{1f44d}\u{1f3fd}";
    expect(cleanText(sichtbar)).toBe(sichtbar);
    expect(hasUnwanted(sichtbar)).toBe(false);
  });
});

/** `{ a: { a: … 1 } }` mit genau `levels` ineinander liegenden Objekten (ohne Rekursion gebaut). */
function nested(levels: number): unknown {
  let value: unknown = 1;
  for (let i = 0; i < levels; i++) value = { a: value };
  return value;
}

// Gegenprobe: `jsonUeberGrenzen` immer `false` zurückgeben → die Fälle „zu tief“, „zu groß“ und
// „Kreis“ werden rot.
describe("Vorprüfung ohne Rekursion (Tiefe, Größe, Kreise)", () => {
  it("Tiefe: genau an der festen Grenze erlaubt, eine Ebene darüber abgelehnt (wie boundedJsonSchema)", () => {
    const depth = JSON_PRUEFUNG_GRENZEN.depth;
    expect(jsonUeberGrenzen(nested(depth))).toBe(false);
    expect(jsonUeberGrenzen(nested(depth + 1))).toBe(true);
    // Dieselbe Grenze wie in der Hülle.
    expect(boundedJsonSchema.safeParse(nested(depth)).success).toBe(true);
    expect(boundedJsonSchema.safeParse(nested(depth + 1)).success).toBe(false);
    // Listen zählen als Ebene wie Objekte.
    let list: unknown = 1;
    for (let i = 0; i < depth + 1; i++) list = [list];
    expect(jsonUeberGrenzen(list)).toBe(true);
  });

  it("10 000 Ebenen: abgelehnt, ohne zu werfen", () => {
    const deep = nested(10_000);
    expect(() => jsonUeberGrenzen(deep)).not.toThrow();
    expect(jsonUeberGrenzen(deep)).toBe(true);
  });

  it("Knoten: eine Liste genau an der Grenze erlaubt, einer mehr abgelehnt; Riesenlisten sofort", () => {
    const { nodes } = JSON_PRUEFUNG_GRENZEN;
    expect(jsonUeberGrenzen(new Array<number>(nodes - 1).fill(1))).toBe(false);
    expect(jsonUeberGrenzen(new Array<number>(nodes).fill(1))).toBe(true);
    // Eine Liste mit riesiger Länge (nur Lücken) wird nicht Eintrag für Eintrag durchlaufen.
    expect(jsonUeberGrenzen(new Array<number>(2 ** 31))).toBe(true);
  });

  it("1 Million Schlüssel: abgelehnt", () => {
    const wide: Record<string, number> = {};
    for (let i = 0; i < 1_000_000; i++) wide[`k${i}`] = i;
    expect(jsonUeberGrenzen(wide)).toBe(true);
  });

  it("Zeichen: genau an der Grenze erlaubt, eines mehr abgelehnt (Zeichenketten und Schlüssel zählen)", () => {
    const { chars } = JSON_PRUEFUNG_GRENZEN;
    expect(jsonUeberGrenzen("x".repeat(chars))).toBe(false);
    expect(jsonUeberGrenzen("x".repeat(chars + 1))).toBe(true);
    expect(jsonUeberGrenzen({ ["k".repeat(chars)]: 1 })).toBe(false);
    expect(jsonUeberGrenzen({ ["k".repeat(chars)]: "v" })).toBe(true);
  });

  it("Kreise enden an der Grenze, statt zu hängen: Objekt, Liste und gegenseitig", () => {
    const self: Record<string, unknown> = {};
    self.self = self;
    expect(jsonUeberGrenzen(self)).toBe(true);
    const list: unknown[] = [];
    list.push(list, list);
    expect(jsonUeberGrenzen(list)).toBe(true);
    const a: Record<string, unknown> = {};
    const b: Record<string, unknown> = { a };
    a.b = b;
    expect(jsonUeberGrenzen(a)).toBe(true);
  });

  it("gültige Werte bleiben gültig: einfache Werte, Umlaute, flache und verschachtelte Formen", () => {
    for (const value of [
      null,
      true,
      0,
      "text",
      "",
      { q: "Käse" },
      [],
      {},
      { a: [1, { b: [null] }] },
    ]) {
      expect(jsonUeberGrenzen(value)).toBe(false);
    }
  });
});

// Gegenprobe: In `jsonUeberGrenzen` die Zeile `if (++nodes > limits.nodes) return true;`
// durch `++nodes;` ersetzen → der Fall „Gesamtzahl“ wird rot. Vorher blieben alle Tests grün,
// weil jeder Behälter für sich klein war und die Prüfung je Behälter nie ansprach.
describe("Vorprüfung: Gesamtzahl der Knoten über mehrere Behälter", () => {
  it("jeder Behälter für sich klein, zusammen über der Grenze: abgelehnt", () => {
    const { nodes } = JSON_PRUEFUNG_GRENZEN;
    const haelfte = Math.ceil(nodes / 2) + 10;
    // Die Wurzel prüft nur ihre eigenen Einträge, der innere Behälter nur seine; erst die Summe
    // liegt über der Grenze.
    const form = [...new Array<number>(haelfte).fill(1), new Array<number>(haelfte).fill(1)];
    expect(1 + form.length).toBeLessThanOrEqual(nodes);
    expect(1 + haelfte).toBeLessThanOrEqual(nodes);
    expect(jsonUeberGrenzen(form)).toBe(true);
    // Gegenprobe: dieselbe Form mit einem kleineren inneren Behälter bleibt unter der Grenze.
    const klein = [...new Array<number>(haelfte).fill(1), new Array<number>(10).fill(1)];
    expect(jsonUeberGrenzen(klein)).toBe(false);
  });

  it("acht Ebenen mit je 64 Schlüsseln, über geteilte Einträge zu riesiger Gesamtzahl: abgelehnt, ohne zu hängen", () => {
    let ebene: Record<string, unknown> = { ende: 1 };
    for (let i = 0; i < 7; i++) {
      const neu: Record<string, unknown> = {};
      for (let k = 0; k < 64; k++) neu[`k${k}`] = ebene;
      ebene = neu;
    }
    const start = performance.now();
    expect(jsonUeberGrenzen(ebene)).toBe(true);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});

// Gegenprobe: Die Grenzen für Ergebnisse auf die der Eingaben zurücksetzen → rot.
describe("Vorprüfung für Ergebnisse", () => {
  it("Schlüssel je Objekt höchstens so viele wie in der Hülle (64), Gesamtknoten deutlich weniger als bei Eingaben", () => {
    expect(ERGEBNIS_PRUEFUNG_GRENZEN.keys).toBe(boundedKeys());
    expect(ERGEBNIS_PRUEFUNG_GRENZEN.nodes).toBeLessThan(JSON_PRUEFUNG_GRENZEN.nodes / 2);
    const mit = (n: number) =>
      Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, 1]));
    expect(jsonUeberGrenzen(mit(64), ERGEBNIS_PRUEFUNG_GRENZEN)).toBe(false);
    expect(jsonUeberGrenzen(mit(65), ERGEBNIS_PRUEFUNG_GRENZEN)).toBe(true);
    // Für Eingaben ändert sich nichts.
    expect(jsonUeberGrenzen(mit(65))).toBe(false);
  });

  it("die breite Form aus der Prüfung (256 Objekte × 64 Schlüssel × 6 Texte) ist zu groß und wird sofort abgelehnt", () => {
    const form = Array.from({ length: 256 }, () =>
      Object.fromEntries(Array.from({ length: 64 }, (_, k) => [`k${k}`, Array(6).fill("x")])),
    );
    expect(jsonUeberGrenzen(form)).toBe(false);
    const start = performance.now();
    expect(jsonUeberGrenzen(form, ERGEBNIS_PRUEFUNG_GRENZEN)).toBe(true);
    expect(performance.now() - start).toBeLessThan(100);
  });

  it("Knoten: eine Liste genau an der Grenze erlaubt, einer mehr abgelehnt", () => {
    const { nodes } = ERGEBNIS_PRUEFUNG_GRENZEN;
    expect(jsonUeberGrenzen(new Array<number>(nodes - 1).fill(1), ERGEBNIS_PRUEFUNG_GRENZEN)).toBe(
      false,
    );
    expect(jsonUeberGrenzen(new Array<number>(nodes).fill(1), ERGEBNIS_PRUEFUNG_GRENZEN)).toBe(
      true,
    );
  });
});

function boundedKeys(): number {
  return BOUNDED_JSON_LIMITS.keys;
}

// Gegenprobe: `jsonHasNonJson` immer `false` zurückgeben → rot.
describe("Werte, die kein JSON sind", () => {
  it("erkennt Funktionen, Symbole, BigInt und Prototypen auf jeder Ebene", () => {
    const f = () => 1;
    for (const wert of [
      f,
      { a: f },
      { a: { b: [1, f] } },
      [Symbol("x")],
      { a: 1n },
      { a: Object.prototype },
      { a: Array.prototype },
      { a: { toString: Object.prototype.toString } },
      { a: new Date() },
      { a: new Map() },
      { a: Object.create({ geerbt: 1 }) },
    ]) {
      expect(jsonHasNonJson(wert)).toBe(true);
    }
  });

  it("lässt reines JSON durch, auch Objekte mit eigenen Schlüsseln wie constructor und __proto__", () => {
    const eigen = JSON.parse('{"constructor":1,"__proto__":{"x":2},"toString":"t"}') as unknown;
    for (const wert of [
      null,
      true,
      0,
      "text",
      [],
      {},
      { a: [1, { b: null }] },
      Object.create(null),
      eigen,
    ]) {
      expect(jsonHasNonJson(wert)).toBe(false);
    }
  });

  it("endet bei einem Kreis, statt zu hängen", () => {
    const kreis: Record<string, unknown> = {};
    kreis.q = kreis;
    expect(() => jsonHasNonJson(kreis)).not.toThrow();
  });
});
