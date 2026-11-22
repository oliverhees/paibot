/**
 * PaiBot – Test: Eingabe-Schema fremder Werkzeuge (Positivliste, Bereinigung, Prüf-Schema, Abweisung).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { describe, expect, it } from "vitest";
import { poisonedSchema } from "../../../tools/test-mcp-server/src/presets";
import { STANDARD_GRENZEN } from "./grenzen";
import { MODELL_STICHWORTE, verarbeiteSchema } from "./schema";

const GRENZEN = { ...STANDARD_GRENZEN };

/** Das Schema muss angenommen werden. */
function gut(schema: unknown) {
  const ergebnis = verarbeiteSchema(schema, GRENZEN);
  if (!ergebnis.ok) throw new Error(`abgewiesen: ${ergebnis.problem}`);
  return ergebnis;
}

function problem(schema: unknown) {
  const ergebnis = verarbeiteSchema(schema, GRENZEN);
  return ergebnis.ok ? null : ergebnis.problem;
}

const EINFACH = {
  type: "object",
  properties: {
    frage: { type: "string", description: "Die Frage", minLength: 1, maxLength: 50 },
    anzahl: { type: "integer", minimum: 1, maximum: 10 },
    art: { type: "string", enum: ["kurz", "lang"] },
    tags: { type: "array", items: { type: "string" }, maxItems: 3 },
  },
  required: ["frage"],
  additionalProperties: false,
};

/** Alle Schlüssel eines Werts auf allen Ebenen, ohne Rekursion. */
function alleSchluessel(wert: unknown): Set<string> {
  const schluessel = new Set<string>();
  const stapel: unknown[] = [wert];
  while (stapel.length > 0) {
    const aktuell = stapel.pop();
    if (Array.isArray(aktuell)) stapel.push(...aktuell);
    else if (typeof aktuell === "object" && aktuell !== null) {
      for (const [name, kind] of Object.entries(aktuell)) {
        schluessel.add(name);
        stapel.push(kind);
      }
    }
  }
  return schluessel;
}

describe("Schema für das Modell", () => {
  it("behält die Positivliste und nimmt nichts anderes mit", () => {
    const ergebnis = gut(EINFACH);
    expect(ergebnis.modell).toEqual(EINFACH);
  });

  it("lässt title, examples, default, $comment, $schema, format und unbekannte Schlüssel in _meta fallen", () => {
    const ergebnis = gut({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      $comment: "Anweisung",
      title: "Titel",
      type: "object",
      properties: {
        frage: {
          type: "string",
          title: "T",
          default: "x",
          examples: ["y"],
          format: "email",
          description: "Text",
        },
      },
    });
    expect(ergebnis.modell).toEqual({
      type: "object",
      properties: { frage: { type: "string", description: "Text" } },
      additionalProperties: false,
    });
    const erlaubt = new Set([...MODELL_STICHWORTE, "frage"]);
    for (const schluessel of alleSchluessel(ergebnis.modell))
      expect(erlaubt.has(schluessel)).toBe(true);
  });

  it("bereinigt jeden Text im Schema und kürzt ihn", () => {
    const ergebnis = gut({
      type: "object",
      properties: {
        frage: {
          type: "string",
          description: `Die​ Frage‮ ![x](https://example.invalid/p.png) ${"z".repeat(500)}`,
        },
      },
    });
    const beschreibung =
      (ergebnis.modell.properties as Record<string, { description: string }>).frage?.description ??
      "";
    expect(beschreibung).not.toMatch(/[​‮]/u);
    expect(beschreibung).not.toContain("![");
    expect(beschreibung.length).toBeLessThanOrEqual(STANDARD_GRENZEN.maxFeldTextZeichen);
    expect(ergebnis.textZeichen).toBeGreaterThan(0);
  });

  it("verarbeitet das vergiftete Schema des Test-Servers: nichts Verstecktes und gleich bei jedem Lauf", () => {
    const roh = poisonedSchema().tools?.[0]?.inputSchema;
    const eins = gut(roh);
    const zwei = gut(roh);
    expect(JSON.stringify(eins.modell)).toBe(JSON.stringify(zwei.modell));
    const text = JSON.stringify(eins.modell);
    expect(text).not.toContain("examples");
    expect(text).not.toContain("default");
    expect(text).not.toContain('"title"');
  });

  it("weist einen Feld-Namen ab, der sich bei der Bereinigung ändern würde, und zu lange Namen", () => {
    expect(problem({ type: "object", properties: { "a​b": { type: "string" } } })).toBe(
      "text_nicht_bereinigbar",
    );
    expect(
      problem({ type: "object", properties: { [`n${"x".repeat(64)}`]: { type: "string" } } }),
    ).toBe("text_nicht_bereinigbar");
    expect(problem({ type: "object", properties: { "": { type: "string" } } })).toBe(
      "text_nicht_bereinigbar",
    );
    expect(problem({ type: "object", properties: { a: { type: "string", enum: ["x​y"] } } })).toBe(
      "text_nicht_bereinigbar",
    );
    expect(problem({ type: "object", required: ["a‮b"] })).toBe("text_nicht_bereinigbar");
  });
});

describe("Was PaiBot nicht sicher prüfen kann, wird abgewiesen", () => {
  it.each([
    [
      "$ref",
      {
        type: "object",
        properties: { a: { $ref: "#/$defs/x" } },
        $defs: { x: { type: "string" } },
      },
    ],
    ["pattern", { type: "object", properties: { a: { type: "string", pattern: "(a+)+$" } } }],
    ["oneOf", { type: "object", properties: { a: { oneOf: [{ type: "string" }] } } }],
    ["allOf", { type: "object", properties: { a: { allOf: [{ type: "string" }] } } }],
    ["not", { type: "object", properties: { a: { not: { type: "string" } } } }],
    ["if/then", JSON.parse('{"type":"object","if":{"properties":{}},"then":{}}')],
    ["patternProperties", { type: "object", patternProperties: { "^a": { type: "string" } } }],
    [
      "additionalProperties als Schema",
      { type: "object", additionalProperties: { type: "string" } },
    ],
    ["unbekanntes Stichwort", { type: "object", "x-fremd": 1 }],
    ["unevaluatedProperties", { type: "object", unevaluatedProperties: false }],
  ])("%s", (_name, schema) => {
    expect(problem(schema)).toBe("stichwort_nicht_pruefbar");
  });

  it.each([
    ["Wurzel kein Objekt", { type: "string" }, "wurzel_kein_objekt"],
    ["Wurzel ohne Typ", { properties: {} }, "wurzel_kein_objekt"],
    ["Liste statt Schema", [], "wurzel_kein_objekt"],
    ["type falsch", { type: "object", properties: { a: { type: "kaese" } } }, "form_ungueltig"],
    ["required kein Text", { type: "object", required: [1] }, "form_ungueltig"],
    [
      "items als Liste",
      { type: "object", properties: { a: { type: "array", items: [{ type: "string" }] } } },
      "form_ungueltig",
    ],
    [
      "minLength negativ",
      { type: "object", properties: { a: { type: "string", minLength: -1 } } },
      "form_ungueltig",
    ],
    ["enum leer", { type: "object", properties: { a: { enum: [] } } }, "form_ungueltig"],
    ["enum mit Objekt", { type: "object", properties: { a: { enum: [{}] } } }, "form_ungueltig"],
  ])("%s", (_name, schema, erwartet) => {
    expect(problem(schema)).toBe(erwartet);
  });

  it("weist ein Schema über 16 KB und eines über 8 Ebenen ab", () => {
    const gross = {
      type: "object",
      properties: { a: { type: "string", description: "x".repeat(20_000) } },
    };
    expect(problem(gross)).toBe("zu_gross");
    let tief: Record<string, unknown> = { type: "string" };
    for (let i = 0; i < 8; i++) tief = { type: "object", properties: { n: tief } };
    expect(problem(tief)).toBe("zu_tief");
    let flach: Record<string, unknown> = { type: "string" };
    for (let i = 0; i < 6; i++) flach = { type: "object", properties: { n: flach } };
    expect(problem(flach)).toBeNull();
  });
});

describe("Namen aus Object.prototype in fremden Schemas (auf jeder Ebene)", () => {
  const NAMEN = [
    "constructor",
    "toString",
    "__proto__",
    "hasOwnProperty",
    "valueOf",
    "isPrototypeOf",
    "__defineGetter__",
  ];

  it.each(NAMEN)("%s als Feld im Wurzel-Objekt", (name) => {
    const schema = JSON.parse(`{"type":"object","properties":{"${name}":{"type":"string"}}}`);
    expect(problem(schema)).toBe("schluessel_verboten");
  });

  it.each(NAMEN)("%s als Feld tief in einem Teil-Schema (items, anyOf, verschachtelt)", (name) => {
    const tief = JSON.parse(
      `{"type":"object","properties":{"a":{"type":"array","items":{"type":"object","properties":{"${name}":{"type":"string"}}}}}}`,
    );
    expect(problem(tief)).toBe("schluessel_verboten");
    const anyOf = JSON.parse(
      `{"type":"object","properties":{"a":{"anyOf":[{"type":"object","properties":{"${name}":{"type":"string"}}}]}}}`,
    );
    expect(problem(anyOf)).toBe("schluessel_verboten");
  });

  it.each(NAMEN)("%s als Eintrag von required", (name) => {
    const schema = JSON.parse(`{"type":"object","required":["${name}"]}`);
    expect(problem(schema)).toBe("schluessel_verboten");
  });

  it("ein gewöhnlicher Name wie `constructor_name` bleibt erlaubt", () => {
    expect(
      problem({ type: "object", properties: { constructor_name: { type: "string" } } }),
    ).toBeNull();
  });
});

describe("Prüf-Schema für Argumente", () => {
  const pruefer = gut(EINFACH).pruefer;

  it("lässt Gültiges durch und gibt eine Kopie zurück", () => {
    const eingabe = { frage: "Was?", anzahl: 3, art: "kurz", tags: ["a"] };
    const ergebnis = pruefer(eingabe);
    expect(ergebnis).toEqual({ ok: true, wert: eingabe });
  });

  it.each([
    ["fehlendes Pflichtfeld", {}],
    ["falscher Typ", { frage: 5 }],
    ["Zahl zu klein", { frage: "x", anzahl: 0 }],
    ["Zahl zu groß", { frage: "x", anzahl: 11 }],
    ["Wert nicht in enum", { frage: "x", art: "mittel" }],
    ["zu viele Listen-Einträge", { frage: "x", tags: ["a", "b", "c", "d"] }],
    ["Text zu lang", { frage: "x".repeat(51) }],
    ["zusätzliches Feld trotz additionalProperties false", { frage: "x", mehr: 1 }],
  ])("weist ab: %s", (_name, eingabe) => {
    expect(pruefer(eingabe)).toEqual({ ok: false, problem: "passt_nicht" });
  });

  it("weist Argumente über 8 KB, Nicht-Objekte und Namen aus Object.prototype ab", () => {
    expect(pruefer({ frage: "x".repeat(9_000) })).toEqual({ ok: false, problem: "zu_gross" });
    expect(pruefer("text")).toEqual({ ok: false, problem: "unzulaessig" });
    expect(pruefer(null)).toEqual({ ok: false, problem: "unzulaessig" });
    expect(pruefer([])).toEqual({ ok: false, problem: "unzulaessig" });
    expect(pruefer(JSON.parse('{"frage":"x","__proto__":{"a":1}}'))).toEqual({
      ok: false,
      problem: "unzulaessig",
    });
    expect(pruefer({ frage: "x", constructor: 1 })).toEqual({ ok: false, problem: "unzulaessig" });
  });

  it("wendet keine Vorgabewerte des Servers an (default wird ignoriert)", () => {
    const mitVorgabe = gut({
      type: "object",
      properties: { a: { type: "string", default: "heimlich" } },
    });
    expect(mitVorgabe.pruefer({})).toEqual({ ok: true, wert: {} });
  });

  it("prüft const und exklusive Grenzen, obwohl sie nicht ans Modell gehen", () => {
    const schema = gut({
      type: "object",
      properties: {
        b: { const: "fest" },
        c: { type: "integer", exclusiveMinimum: 0 },
      },
    });
    expect(schema.modell).toEqual({
      type: "object",
      properties: { b: {}, c: { type: "integer" } },
      additionalProperties: false,
    });
    expect(schema.pruefer({ b: "fest", c: 1 }).ok).toBe(true);
    expect(schema.pruefer({ b: "anders" }).ok).toBe(false);
    expect(schema.pruefer({ c: 0 }).ok).toBe(false);
  });

  it("nimmt Typ-Listen wie [string, null]", () => {
    const schema = gut({ type: "object", properties: { a: { type: ["string", "null"] } } });
    expect(schema.pruefer({ a: null }).ok).toBe(true);
    expect(schema.pruefer({ a: 1 }).ok).toBe(false);
  });
});

describe("Das Prüf-Schema ist nie lockerer als die Rohform", () => {
  const A = { type: "string" };

  it.each([
    [
      "anyOf neben additionalProperties false",
      {
        type: "object",
        properties: { a: A },
        additionalProperties: false,
        anyOf: [{ type: "object" }],
      },
    ],
    [
      "anyOf mit required-Zweigen",
      {
        type: "object",
        properties: { a: A, b: A },
        anyOf: [{ required: ["a"] }, { required: ["b"] }],
      },
    ],
    [
      "anyOf in einer Eigenschaft",
      { type: "object", properties: { a: { anyOf: [{ type: "string" }, { type: "null" }] } } },
    ],
    [
      "anyOf in items",
      { type: "object", properties: { a: { type: "array", items: { anyOf: [A] } } } },
    ],
  ])("weist %s ab (nicht bestätigbar)", (_name, schema) => {
    expect(problem(schema)).toBe("stichwort_nicht_pruefbar");
  });

  it.each([
    [
      "required nennt einen Namen ohne Eigenschaft",
      { type: "object", properties: { a: A }, required: ["b"] },
    ],
    ["required ohne properties", { type: "object", required: ["a"] }],
    [
      "required teils außerhalb",
      { type: "object", properties: { a: A }, required: ["a", "zusatz"] },
    ],
    [
      "required in einer Eigenschaft",
      {
        type: "object",
        properties: { o: { type: "object", properties: { a: A }, required: ["b"] } },
      },
    ],
  ])("weist %s ab (nicht bestätigbar)", (_name, schema) => {
    expect(problem(schema)).toBe("form_ungueltig");
  });

  it("nimmt required mit Namen aus properties an", () => {
    const schema = gut({ type: "object", properties: { a: A, b: A }, required: ["a"] });
    expect(schema.pruefer({}).ok).toBe(false);
    expect(schema.pruefer({ a: "x" }).ok).toBe(true);
  });

  it.each([
    ["ohne additionalProperties", { type: "object", properties: { a: A } }],
    [
      "mit additionalProperties false",
      { type: "object", properties: { a: A }, additionalProperties: false },
    ],
    ["Objekt ohne properties", { type: "object" }],
  ])("weist zusätzliche Felder ab: Wurzel %s", (_name, schema) => {
    const geprueft = gut(schema);
    expect(geprueft.pruefer({ a: "x", geheim: "1" }).ok).toBe(false);
    expect(geprueft.pruefer({ geheim: "1" }).ok).toBe(false);
    expect((geprueft.modell as { additionalProperties?: unknown }).additionalProperties).toBe(
      false,
    );
  });

  it("weist zusätzliche Felder auch in verschachtelten Objekten und in Listen ab", () => {
    const geprueft = gut({
      type: "object",
      properties: {
        o: { type: "object", properties: { x: A } },
        liste: { type: "array", items: { type: "object", properties: { y: A } } },
      },
    });
    expect(geprueft.pruefer({ o: { x: "1" }, liste: [{ y: "1" }] }).ok).toBe(true);
    expect(geprueft.pruefer({ o: { x: "1", geheim: "1" } }).ok).toBe(false);
    expect(geprueft.pruefer({ liste: [{ y: "1", geheim: "1" }] }).ok).toBe(false);
  });

  it("lässt zusätzliche Felder nur bei ausdrücklichem additionalProperties true zu (wie die Rohform)", () => {
    const geprueft = gut({ type: "object", properties: { a: A }, additionalProperties: true });
    expect(geprueft.pruefer({ a: "x", mehr: 1 }).ok).toBe(true);
    expect((geprueft.modell as { additionalProperties?: unknown }).additionalProperties).toBe(true);
  });

  it("das Schema, das das Modell sieht, nennt additionalProperties false: gezeigte und geprüfte Form gleichen sich", () => {
    const geprueft = gut({
      type: "object",
      properties: { a: { type: "object", properties: { x: A } } },
    });
    expect(geprueft.modell).toEqual({
      type: "object",
      properties: { a: { type: "object", properties: { x: A }, additionalProperties: false } },
      additionalProperties: false,
    });
  });
});
