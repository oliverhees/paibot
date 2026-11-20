/**
 * PaiBot – Tests der kanonischen JSON-Form.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { describe, expect, it } from "vitest";
import { CanonicalizeError, type CanonicalValue, canonicalize } from "./canonical";

function problemOf(value: unknown): { problem: string; path: string } {
  try {
    canonicalize(value as CanonicalValue);
  } catch (error) {
    if (error instanceof CanonicalizeError) return { problem: error.problem, path: error.path };
    throw error;
  }
  throw new Error("canonicalize hätte werfen müssen.");
}

describe("canonicalize", () => {
  it("sortiert Schlüssel und lässt Leerzeichen weg", () => {
    expect(canonicalize({ b: 1, a: [true, false, null], c: { z: "x", y: -3 } })).toBe(
      '{"a":[true,false,null],"b":1,"c":{"y":-3,"z":"x"}}',
    );
  });

  it("ist stabil gegen die Reihenfolge der Schlüssel", () => {
    const eins = { seq: 7, facts: { inputChars: 812, route: "schleuse" }, type: "decision" };
    const zwei = { type: "decision", facts: { route: "schleuse", inputChars: 812 }, seq: 7 };
    expect(canonicalize(eins)).toBe(canonicalize(zwei));
  });

  it("sortiert nach UTF-16-Code-Units, nicht nach Code-Points", () => {
    // U+1F600 (Ersatzpaar D83D DE00) steht vor U+FB33, obwohl sein Code-Point größer ist.
    const value: Record<string, number> = {
      "€": 1,
      "\r": 2,
      דּ: 3,
      "1": 4,
      "😀": 5,
      "\u0080": 6,
      ö: 7,
    };
    const keys = Object.keys(JSON.parse(canonicalize(value)) as object);
    expect(keys).toEqual(["1", "\r", "\u0080", "ö", "€", "😀", "דּ"]);
    // JSON.parse ordnet Ganzzahl-Schlüssel vor; die Reihenfolge im Text selbst prüfen:
    const text = canonicalize(value);
    const order = ["\\r", '"1"', "\u0080", "ö", "€", "😀", "דּ"].map((k) => text.indexOf(k));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("schreibt Unicode unverändert und maskiert nur, was RFC 8785 verlangt", () => {
    expect(canonicalize("Grüße 😀 €")).toBe('"Grüße 😀 €"');
    expect(canonicalize('a"b\\c')).toBe('"a\\"b\\\\c"');
    expect(canonicalize("\b\f\n\r\t")).toBe('"\\b\\f\\n\\r\\t"');
    expect(canonicalize("\u0001\u001f\u007f")).toBe('"\\u0001\\u001f\u007f"');
    expect(canonicalize(" ")).toBe('" "');
  });

  it("normalisiert Unicode nicht: zusammengesetzt und zerlegt bleiben verschieden", () => {
    const nfc = "Café";
    const nfd = "Café";
    expect(canonicalize({ name: nfc })).not.toBe(canonicalize({ name: nfd }));
    expect(canonicalize({ name: nfc })).toBe(canonicalize({ name: nfd.normalize("NFC") }));
  });

  it("schreibt Ganzzahlen ohne Exponent und -0 als 0", () => {
    expect(canonicalize([0, -0, 1, -1, Number.MAX_SAFE_INTEGER, Number.MIN_SAFE_INTEGER])).toBe(
      "[0,0,1,-1,9007199254740991,-9007199254740991]",
    );
  });

  it("erlaubt geteilte, aber nicht zyklische Teile", () => {
    const shared = { a: 1 };
    expect(canonicalize({ x: shared, y: [shared] })).toBe('{"x":{"a":1},"y":[{"a":1}]}');
  });

  it("weist Gleitkommazahlen mit Pfad ab", () => {
    expect(problemOf({ facts: { inputChars: 1.5 } })).toEqual({
      problem: "gleitkommazahl",
      path: "facts.inputChars",
    });
  });

  it("weist übrige ungültige Werte ab", () => {
    expect(problemOf({ a: 2 ** 53 })).toEqual({ problem: "zahl_zu_gross", path: "a" });
    expect(problemOf({ a: Number.NaN })).toEqual({ problem: "nicht_endlich", path: "a" });
    expect(problemOf([1, Number.POSITIVE_INFINITY])).toEqual({
      problem: "nicht_endlich",
      path: "[1]",
    });
    expect(problemOf({ a: undefined })).toEqual({ problem: "undefiniert", path: "a" });
    expect(problemOf([undefined])).toEqual({ problem: "undefiniert", path: "[0]" });
    expect(problemOf(undefined)).toEqual({ problem: "undefiniert", path: "" });
    expect(problemOf({ a: () => 1 })).toEqual({ problem: "typ_unbekannt", path: "a" });
    expect(problemOf({ a: Symbol("x") })).toEqual({ problem: "typ_unbekannt", path: "a" });
    expect(problemOf({ a: 1n })).toEqual({ problem: "typ_unbekannt", path: "a" });
    expect(problemOf({ a: new Date(0) })).toEqual({ problem: "typ_unbekannt", path: "a" });
    expect(problemOf({ a: new Map() })).toEqual({ problem: "typ_unbekannt", path: "a" });
  });

  it("erkennt Zyklen", () => {
    const loop: Record<string, unknown> = { a: { b: [] } };
    ((loop.a as { b: unknown[] }).b as unknown[]).push(loop);
    expect(problemOf(loop)).toEqual({ problem: "zyklus", path: "a.b[0]" });
  });

  it("die Fehlermeldung nennt die Wurzel lesbar", () => {
    expect(() => canonicalize(1.5)).toThrow("gleitkommazahl bei (Wurzel)");
  });
});
