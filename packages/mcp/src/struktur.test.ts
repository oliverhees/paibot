/**
 * PaiBot – Test: Prüfung fremder Werte ohne Rekursion (Tiefe, Breite, Kreis, Typen, verbotene Schlüssel).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { describe, expect, it } from "vitest";
import { abdruckVonWert, kanonischeForm } from "./abdruck";
import { ergebnisZuText } from "./ergebnis";
import { STANDARD_GRENZEN } from "./grenzen";
import { verarbeiteSchema } from "./schema";
import { OBJEKT_NAMEN, pruefeStruktur } from "./struktur";
import { bereiteWerkzeugeAuf } from "./werkzeug";

const GRENZEN = { maxTiefe: 64, maxKnoten: 20_000 };

/** Baut `ebenen` Ebenen tief, ohne Rekursion. */
function tief(ebenen: number, art: "liste" | "objekt"): unknown {
  let wert: unknown = "blatt";
  for (let i = 0; i < ebenen; i++) wert = art === "liste" ? [wert] : { k: wert };
  return wert;
}

function breit(schluessel: number): Record<string, number> {
  const objekt: Record<string, number> = {};
  for (let i = 0; i < schluessel; i++) objekt[`k${i}`] = i;
  return objekt;
}

function kreis(): Record<string, unknown> {
  const a: Record<string, unknown> = { name: "a" };
  a.selbst = a;
  return a;
}

describe("pruefeStruktur", () => {
  it("nimmt gewöhnliche JSON-Werte an und meldet Tiefe und Knoten", () => {
    const ergebnis = pruefeStruktur({ a: [1, "zwei", { b: null, c: true }] }, GRENZEN);
    expect(ergebnis).toMatchObject({ ok: true, tiefe: 4 });
  });

  it.each(["liste", "objekt"] as const)("weist %s mit 10 000 Ebenen ab, ohne zu werfen", (art) => {
    const wert = tief(10_000, art);
    expect(pruefeStruktur(wert, GRENZEN)).toEqual({ ok: false, problem: "zu_tief" });
  });

  it("weist ein Objekt mit einer Million Schlüsseln ab, ohne zu werfen", () => {
    expect(pruefeStruktur(breit(1_000_000), GRENZEN)).toEqual({
      ok: false,
      problem: "zu_viele_knoten",
    });
  });

  it("weist eine Liste mit einer Million Einträgen ab, ohne zu werfen", () => {
    expect(pruefeStruktur(new Array(1_000_000).fill(0), GRENZEN)).toEqual({
      ok: false,
      problem: "zu_viele_knoten",
    });
  });

  it("erkennt einen Kreis, auch über eine Liste", () => {
    expect(pruefeStruktur(kreis(), GRENZEN)).toEqual({ ok: false, problem: "kreis" });
    const liste: unknown[] = [];
    liste.push({ zurueck: liste });
    expect(pruefeStruktur(liste, GRENZEN)).toEqual({ ok: false, problem: "kreis" });
  });

  it("hält denselben Wert an zwei Stellen für keinen Kreis", () => {
    const geteilt = { x: 1 };
    expect(pruefeStruktur({ a: geteilt, b: geteilt }, GRENZEN).ok).toBe(true);
  });

  it("begrenzt auch einen Wert, der sich vielfach selbst teilt (keine Explosion)", () => {
    let wert: unknown = { blatt: true };
    for (let i = 0; i < 40; i++) wert = { links: wert, rechts: wert };
    expect(pruefeStruktur(wert, { maxTiefe: 100, maxKnoten: 10_000 })).toEqual({
      ok: false,
      problem: "zu_viele_knoten",
    });
  });

  it("weist Typen ab, die kein JSON sind", () => {
    for (const wert of [undefined, () => 1, 10n, Symbol("x"), Number.NaN, new Date(), new Map()]) {
      expect(pruefeStruktur({ x: wert }, GRENZEN)).toEqual({
        ok: false,
        problem: "typ_unzulaessig",
      });
    }
  });

  it("begrenzt die Zeichen aller Texte", () => {
    expect(
      pruefeStruktur(["a".repeat(100), "b".repeat(100)], { ...GRENZEN, maxZeichen: 150 }),
    ).toEqual({
      ok: false,
      problem: "zu_viele_zeichen",
    });
  });

  it("weist Schlüssel mit Namen aus Object.prototype auf jeder Ebene ab", () => {
    for (const name of ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"]) {
      expect(OBJEKT_NAMEN.has(name)).toBe(true);
      const wert = JSON.parse(`{"a":{"b":[{"${name}":1}]}}`);
      expect(pruefeStruktur(wert, { ...GRENZEN, verboteneSchluessel: OBJEKT_NAMEN })).toEqual({
        ok: false,
        problem: "schluessel_verboten",
      });
    }
  });
});

describe("Verarbeiter nehmen nur Geprüftes an und werfen nie", () => {
  const tiefesSchema = { type: "object", properties: tief(10_000, "objekt") };
  const breitesSchema = { type: "object", properties: breit(1_000_000) };
  const kreisSchema = { type: "object", properties: {} as Record<string, unknown> };
  kreisSchema.properties.x = kreisSchema;

  it.each([
    ["10 000 Ebenen", tiefesSchema],
    ["1 Mio. Schlüssel", breitesSchema],
    ["Kreis", kreisSchema],
  ])("Schema mit %s wird abgewiesen", (_name, schema) => {
    const ergebnis = verarbeiteSchema(schema, { ...STANDARD_GRENZEN });
    expect(ergebnis.ok).toBe(false);
  });

  it.each([
    [
      "10 000 Ebenen",
      () => ({ name: "x", inputSchema: { type: "object" }, _meta: tief(10_000, "objekt") }),
    ],
    [
      "1 Mio. Schlüssel",
      () => ({ name: "x", inputSchema: { type: "object" }, _meta: breit(1_000_000) }),
    ],
    ["Kreis", () => ({ name: "x", inputSchema: { type: "object" }, _meta: kreis() })],
  ])("rohes Werkzeug mit %s wird gesperrt und bekommt trotzdem einen Abdruck", (_name, bau) => {
    const [werkzeug] = bereiteWerkzeugeAuf([bau()], {
      appKurzname: "app",
      bekannteNamen: new Map(),
    });
    expect(werkzeug?.bestaetigbar).toBe(false);
    expect(werkzeug?.problem).toBe("werkzeug_zu_gross");
    expect(werkzeug?.abdruck).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it.each([
    [
      "10 000 Ebenen",
      () => ({ content: [{ type: "text", text: "x" }], structuredContent: tief(10_000, "objekt") }),
    ],
    ["1 Mio. Schlüssel", () => ({ content: [], structuredContent: breit(1_000_000) })],
    ["Kreis", () => ({ content: [], structuredContent: kreis() })],
  ])("Ergebnis mit %s wird ersetzt durch einen festen Satz", (_name, bau) => {
    const ergebnis = ergebnisZuText(bau());
    expect(ergebnis.status).toBe("fehler");
    expect(ergebnis.enthaeltFremdenText).toBe(false);
    expect(ergebnis.text).toMatch(/^[A-ZÄÖÜ][^\n]{5,80}\.$/);
  });

  it("Argumente mit 10 000 Ebenen, 1 Mio. Schlüsseln und Kreis werden abgewiesen", () => {
    const schema = verarbeiteSchema(
      { type: "object", properties: { a: { type: "string" } } },
      { ...STANDARD_GRENZEN },
    );
    if (!schema.ok) throw new Error("Schema sollte gehen");
    for (const argumente of [tief(10_000, "objekt"), breit(1_000_000), kreis()]) {
      expect(schema.pruefer(argumente).ok).toBe(false);
    }
  });

  it("die kanonische Form läuft auch bei 10 000 Ebenen ohne Fehler (eigener Stapel)", () => {
    const text = kanonischeForm(tief(10_000, "objekt"));
    expect(text.startsWith('{"k":{"k":')).toBe(true);
    expect(abdruckVonWert(tief(10_000, "liste"))).toMatch(/^sha256:/);
  });
});
