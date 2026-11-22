/**
 * PaiBot – Tests des Registers der Werkzeuge: Prüfung beim Aufbau, Abdruck einmal, eingefroren,
 * Auslieferung.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { toolDefinitionDigest } from "@paibot/gate";
import type { JsonValue } from "@paibot/shared/motor";
import type { ToolDefinition } from "@paibot/shared/werkzeug";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { testDokuIndex } from "../testing/doku-index";
import { createTestTools } from "../testing/werkzeuge";
import { builtinTools } from "./eingebaut";
import {
  createShippedRegistry,
  createToolRegistry,
  PLACEHOLDER_TOOL_KEY,
  ToolRegistryError,
} from "./register";

const lesen = () => createTestTools().byName("test_lesen");
const mit = (change: Partial<ToolDefinition<JsonValue, JsonValue>>) =>
  ({ ...lesen(), ...change }) as ToolDefinition<JsonValue, JsonValue>;

describe("Register der Werkzeuge", () => {
  // Gegenprobe je Fall: die Prüfung in `check` entfernen → Aufbau gelingt, Test rot.
  it("wirft bei doppeltem key oder modelName", async () => {
    await expect(createToolRegistry([lesen(), mit({ modelName: "zweites" })])).rejects.toThrow(
      ToolRegistryError,
    );
    await expect(createToolRegistry([lesen(), mit({ key: "eingebaut/zweites" })])).rejects.toThrow(
      ToolRegistryError,
    );
  });

  it("wirft bei modelName gegen TOOL_NAME_PATTERN oder mit „__“", async () => {
    for (const modelName of ["a.b", "", "n".repeat(65), "ü", "a__b"]) {
      await expect(createToolRegistry([mit({ modelName })])).rejects.toThrow(ToolRegistryError);
    }
  });

  it("wirft bei Beschreibung über 1 000 Zeichen oder mit Steuerzeichen", async () => {
    await expect(createToolRegistry([mit({ description: "x".repeat(1001) })])).rejects.toThrow();
    await expect(createToolRegistry([mit({ description: "a\u202eb" })])).rejects.toThrow();
    await expect(createToolRegistry([mit({ description: "a\u0007b" })])).rejects.toThrow();
    // auch die Zeichen, die Unicode als „standardmäßig unsichtbar“ führt (dieselbe Liste wie beim Bereinigen)
    for (const zeichen of ["\u180b", "\u{e0000}", "\u17b4", "\u2065"]) {
      await expect(createToolRegistry([mit({ description: `a${zeichen}b` })])).rejects.toThrow();
    }
  });

  it("wirft bei gateAction außerhalb von TOOL_GATE_ACTIONS und bei Eingabe, die kein strictObject ist", async () => {
    await expect(
      createToolRegistry([mit({ gateAction: "modell.anfragen" as never })]),
    ).rejects.toThrow(ToolRegistryError);
    await expect(
      createToolRegistry([mit({ input: z.object({ q: z.string() }) as never })]),
    ).rejects.toThrow(ToolRegistryError);
    await expect(createToolRegistry([mit({ input: z.string() as never })])).rejects.toThrow();
  });

  // Gegenprobe: `hasPrototypeField` in `check` entfernen → Aufbau gelingt, Test rot.
  it("wirft bei einem Feld in Eingabe oder Ausgabe, das wie ein Name aus Object.prototype heißt", async () => {
    const namen = Object.getOwnPropertyNames(Object.prototype);
    expect(namen).toEqual(expect.arrayContaining(["constructor", "toString", "__proto__"]));
    for (const name of namen) {
      // `__proto__` als Schlüssel nur als eigene Eigenschaft; sonst würde es den Prototyp setzen.
      const shape: Record<string, z.ZodType> = {};
      Object.defineProperty(shape, name, {
        value: z.unknown(),
        enumerable: true,
        configurable: true,
        writable: true,
      });
      await expect(
        createToolRegistry([mit({ input: z.strictObject(shape) as never })]),
        `Eingabe ${name}`,
      ).rejects.toThrow(ToolRegistryError);
      await expect(
        createToolRegistry([mit({ output: z.strictObject(shape) as never })]),
        `Ausgabe ${name}`,
      ).rejects.toThrow(ToolRegistryError);
    }
    // Ähnliche, aber andere Namen sind in Ordnung.
    await expect(
      createToolRegistry([
        mit({
          input: z.strictObject({
            constructors: z.string(),
            tief: z.object({ valuesOf: z.string() }),
          }) as never,
        }),
      ]),
    ).resolves.toBeDefined();
  });

  it("wirft für ein echtes Werkzeug mit der Platzhalter-Kennung eingebaut/unbekannt", async () => {
    await expect(createToolRegistry([mit({ key: PLACEHOLDER_TOOL_KEY })])).rejects.toThrow(
      ToolRegistryError,
    );
  });

  it("Abdruck einmal beim Aufbau; Beschreibung eingefroren (Ändern wirft)", async () => {
    const original = lesen();
    const registry = await createToolRegistry([original]);
    const tool = registry.byModelName("test_lesen");
    expect(tool).toBeDefined();
    const expected = await toolDefinitionDigest({
      description: original.description,
      foreignContent: original.foreignContent,
      inputSchema: z.toJSONSchema(original.input) as JsonValue,
      key: original.key,
      kind: original.kind,
      modelName: original.modelName,
      reach: original.reach,
      source: original.source,
      version: original.version,
    });
    expect(tool?.toolDigest).toBe(expected);
    expect(() => {
      (tool?.definition as { description: string }).description = "anders";
    }).toThrow(TypeError);
    expect(() => {
      (tool?.spec as { description: string }).description = "anders";
    }).toThrow(TypeError);
    expect(() => {
      (tool?.spec.inputSchema as Record<string, unknown>).extra = 1;
    }).toThrow(TypeError);
    // Die Vorlage zu ändern, ändert das Register nicht.
    (original as { description: string }).description = "nachträglich anders";
    expect(registry.byModelName("test_lesen")?.definition.description).not.toBe(
      "nachträglich anders",
    );
    expect(registry.byModelName("test_lesen")?.toolDigest).toBe(expected);
  });

  it("Platzhalter: toolKey eingebaut/unbekannt mit festem Abdruck, streng angenommen", async () => {
    const a = await createToolRegistry([]);
    const b = await createToolRegistry(createTestTools().tools);
    expect(a.placeholder).toEqual(b.placeholder);
    expect(a.placeholder).toMatchObject({
      toolKey: "eingebaut/unbekannt",
      source: "eingebaut",
      kind: "schreiben",
      reach: "nach_aussen",
      foreignContent: true,
    });
    expect(a.placeholder.toolDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("die Test-Werkzeuge lassen sich registrieren; Reihenfolge bleibt", async () => {
    const registry = await createToolRegistry(createTestTools().tools);
    expect(registry.tools.map((tool) => tool.spec.name)).toEqual(
      createTestTools().tools.map((tool) => tool.modelName),
    );
    expect(registry.byModelName("gibt_es_nicht")).toBeUndefined();
  });
});

describe("Register der Auslieferung", () => {
  // Gegenprobe: Sperre in `createShippedRegistry` entfernen → Test rot.
  it("enthält mit Index genau das Nachschlagen in der Doku und kein test_*; ohne Index wirft der Aufbau", async () => {
    expect(() => builtinTools()).toThrow("Doku-Index fehlt");
    await expect(createShippedRegistry()).rejects.toThrow("Doku-Index fehlt");
    const shipped = await createShippedRegistry(builtinTools({ dokuIndex: testDokuIndex() }));
    expect(shipped.tools.map((tool) => tool.spec.name)).toEqual(["doku_nachschlagen"]);
    expect(shipped.tools.some((tool) => tool.spec.name.startsWith("test_"))).toBe(false);
  });

  it("wirft beim Aufbau für ein Werkzeug mit foreignContent true oder Quelle außer eingebaut", async () => {
    const fremd = createTestTools().byName("test_fremd");
    await expect(createShippedRegistry([fremd])).rejects.toThrow(ToolRegistryError);
    await expect(createShippedRegistry([mit({ source: "mcp" })])).rejects.toThrow(
      ToolRegistryError,
    );
    await expect(createShippedRegistry([lesen()])).resolves.toBeDefined();
  });
});

// Gegenprobe: In `hasPrototypeField` nur die oberste Ebene lesen → die verschachtelten Fälle werden rot.
describe("Feldnamen aus Object.prototype auch verschachtelt", () => {
  const FAELLE: [string, z.ZodType][] = [
    ["verschachteltes Objekt", z.object({ constructor: z.unknown() })],
    ["optional", z.object({ valueOf: z.unknown() }).optional()],
    ["nullable", z.object({ toString: z.unknown() }).nullable()],
    ["mit Vorgabe", z.object({ hasOwnProperty: z.unknown() }).default({} as never)],
    ["Liste", z.array(z.object({ hasOwnProperty: z.unknown() }))],
    ["Vereinigung", z.union([z.string(), z.object({ valueOf: z.unknown() })])],
    [
      "Schnitt",
      z.intersection(z.object({ a: z.string() }), z.object({ constructor: z.unknown() })),
    ],
    ["lazy", z.lazy(() => z.object({ toString: z.unknown() }))],
    ["Tupel", z.tuple([z.string(), z.object({ valueOf: z.unknown() })])],
    ["Schlüssel-Wert-Liste", z.record(z.string(), z.object({ constructor: z.unknown() }))],
    ["Umhüllung mit Prüfung", z.object({ constructor: z.unknown() }).refine(() => true)],
    [
      "tief verschachtelt",
      z.object({ a: z.object({ b: z.array(z.object({ valueOf: z.unknown() })) }) }),
    ],
  ];
  for (const [name, schema] of FAELLE) {
    it(`${name}: Eingabe und Ausgabe werden abgewiesen`, async () => {
      await expect(
        createToolRegistry([mit({ input: z.strictObject({ a: schema }) as never })]),
        "Eingabe",
      ).rejects.toThrow(ToolRegistryError);
      await expect(
        createToolRegistry([mit({ output: z.strictObject({ a: schema }) as never })]),
        "Ausgabe",
      ).rejects.toThrow(ToolRegistryError);
    });
  }

  it("ein Schema, das sich selbst enthält (lazy), hängt nicht und wird nicht fälschlich abgewiesen", async () => {
    type Baum = { kind?: Baum };
    const baum: z.ZodType<Baum> = z.lazy(() => z.object({ kind: baum.optional() }));
    await expect(
      createToolRegistry([mit({ input: z.strictObject({ a: baum }) as never })]),
    ).resolves.toBeDefined();
  });
});

// Gegenprobe: den Fang je Werkzeug entfernen → das Schnitt-Schema wirft einen rohen `TypeError`,
// und das fehlerfreie Werkzeug daneben fällt mit aus.
describe("Fehler je Werkzeug beim Aufbau", () => {
  /** Dieses Schema macht den Abdruck der Beschreibung kaputt: Eine Vorgabe `NaN` ist kein JSON. */
  const kaputt = () =>
    mit({
      key: "eingebaut/kaputt" as never,
      modelName: "kaputt",
      input: z.strictObject({ a: z.number().default(Number.NaN) }) as never,
    });

  it("ohne Ausschluss wirft der Aufbau einen ToolRegistryError, nie einen rohen TypeError", async () => {
    await expect(createToolRegistry([lesen(), kaputt()])).rejects.toThrow(ToolRegistryError);
    await expect(createToolRegistry([lesen(), kaputt()])).rejects.not.toThrow(TypeError);
  });

  it("mit Ausschluss bleibt das fehlerfreie Werkzeug, das kaputte wird mit Grund gemeldet", async () => {
    const registry = await createToolRegistry([kaputt(), lesen()], { ausschliessen: true });
    expect(registry.tools.map((t) => t.definition.modelName)).toEqual(["test_lesen"]);
    expect(registry.byModelName("kaputt")).toBeUndefined();
    expect(registry.ausgeschlossen).toHaveLength(1);
    expect(registry.ausgeschlossen[0]?.key).toBe("eingebaut/kaputt");
    expect(registry.ausgeschlossen[0]?.fehler).toBeInstanceOf(ToolRegistryError);
  });

  it("mit Ausschluss gilt das auch für jede andere ungültige Beschreibung", async () => {
    const registry = await createToolRegistry(
      [
        mit({ description: "" }),
        lesen(),
        mit({ key: "eingebaut/zweites" as never, modelName: "x__y" }),
      ],
      { ausschliessen: true },
    );
    expect(registry.tools.map((t) => t.definition.modelName)).toEqual(["test_lesen"]);
    expect(registry.ausgeschlossen).toHaveLength(2);
  });

  it("ein doppelter Name schließt nur den zweiten aus; der erste bleibt", async () => {
    const registry = await createToolRegistry(
      [lesen(), mit({ key: "eingebaut/zweites" as never })],
      { ausschliessen: true },
    );
    expect(registry.tools).toHaveLength(1);
    expect(registry.ausgeschlossen).toHaveLength(1);
  });

  it("ohne Fehler ist die Liste der Ausgeschlossenen leer und eingefroren", async () => {
    const registry = await createToolRegistry([lesen()]);
    expect(registry.ausgeschlossen).toEqual([]);
    expect(Object.isFrozen(registry.ausgeschlossen)).toBe(true);
  });
});

// Gegenprobe: In `hasPrototypeField` bei `record` nur Schlüssel- und Wert-Schema lesen, nicht die
// festen Namen aus `enum` und `literal` → die Fälle werden rot. zod legt für `z.record(z.enum([...]))`
// jeden festen Namen als eigenes Feld an, auch `constructor`.
describe("Feste Schlüsselnamen in Schlüssel-Wert-Listen", () => {
  const FAELLE: [string, z.ZodType][] = [
    ["enum", z.record(z.enum(["constructor"]), z.unknown())],
    ["enum mit mehreren Namen", z.record(z.enum(["a", "valueOf", "b"]), z.string())],
    ["literal", z.record(z.literal("toString"), z.unknown())],
    [
      "Vereinigung aus literal",
      z.record(z.union([z.literal("a"), z.literal("hasOwnProperty")]), z.unknown()),
    ],
    ["verschachtelt", z.object({ x: z.array(z.record(z.enum(["constructor"]), z.unknown())) })],
  ];
  for (const [name, schema] of FAELLE) {
    it(`${name}: Eingabe und Ausgabe werden abgewiesen`, async () => {
      await expect(
        createToolRegistry([mit({ input: z.strictObject({ a: schema }) as never })]),
        "Eingabe",
      ).rejects.toThrow(ToolRegistryError);
      await expect(
        createToolRegistry([mit({ output: z.strictObject({ a: schema }) as never })]),
        "Ausgabe",
      ).rejects.toThrow(ToolRegistryError);
    });
  }

  it("feste Namen ohne Namen aus Object.prototype und freie Schlüssel bleiben erlaubt", async () => {
    for (const schema of [
      z.record(z.enum(["a", "b"]), z.string()),
      z.record(z.literal("name"), z.string()),
      z.record(z.string(), z.string()),
    ]) {
      await expect(
        createToolRegistry([mit({ input: z.strictObject({ a: schema }) as never })]),
      ).resolves.toBeDefined();
    }
  });
});

// Gegenprobe: im Ausschluss-Zweig `String(key)` aufrufen → ein werfendes `toString` bricht den
// Aufbau mit einem rohen `TypeError`; die Kennung unbereinigt eintragen → Bidi-Zeichen bleiben.
describe("Kennung im Ausschluss-Zweig", () => {
  it("eine Kennung mit werfendem toString bricht den Aufbau trotz Ausschluss nicht", async () => {
    const gift = {
      toString() {
        throw new Error("fremder Text");
      },
    };
    const registry = await createToolRegistry([mit({ key: gift as never }), lesen()], {
      ausschliessen: true,
    });
    expect(registry.tools.map((t) => t.definition.modelName)).toEqual(["test_lesen"]);
    expect(registry.ausgeschlossen).toHaveLength(1);
    const eintrag = registry.ausgeschlossen[0];
    expect(typeof eintrag?.key).toBe("string");
    expect(eintrag?.key).not.toContain("fremder Text");
    expect(eintrag?.fehler).toBeInstanceOf(ToolRegistryError);
  });

  it("eine Kennung, die kein Text ist, bekommt einen festen Ersatz", async () => {
    for (const key of [undefined, null, 5, {}, [], Symbol("s")]) {
      const registry = await createToolRegistry([mit({ key: key as never }), lesen()], {
        ausschliessen: true,
      });
      expect(registry.ausgeschlossen[0]?.key, String(typeof key)).toBe("(ohne Kennung)");
    }
  });

  it("Steuer-, Bidi- und unsichtbare Zeichen und Länge: die gemeldete Kennung ist bereinigt und höchstens 128 Zeichen lang", async () => {
    const registry = await createToolRegistry(
      [
        mit({ key: "eingebaut/a\u202eb\u0007c\u200bd\u2066" as never }),
        mit({ key: `eingebaut/${"x".repeat(500)}` as never, modelName: "lang__x" }),
        lesen(),
      ],
      { ausschliessen: true },
    );
    const [a, b] = registry.ausgeschlossen;
    expect(a?.key).toBe("eingebaut/abcd");
    expect(b?.key.length).toBeLessThanOrEqual(128);
  });
});

// Gegenprobe: dieselbe Meldung für zu tiefe oder nicht lesbare Schemas wie für einen Feldnamen →
// der Grund ist irreführend.
describe("Grund bei einem Schema, das das Register nicht lesen kann", () => {
  const grund = async (schema: z.ZodType) => {
    try {
      await createToolRegistry([mit({ input: z.strictObject({ a: schema }) as never })]);
    } catch (fehler) {
      return (fehler as Error).message;
    }
    return "kein Fehler";
  };

  it("zu tief: fester Text „Schema nicht lesbar“, nicht „Feldname aus Object.prototype“", async () => {
    let tief: z.ZodType = z.string();
    for (let i = 0; i < 40; i += 1) tief = z.array(tief);
    const text = await grund(tief);
    expect(text).toContain("Schema nicht lesbar");
    expect(text).not.toContain("Object.prototype");
  });

  it("ein lazy, das wirft: derselbe feste Text", async () => {
    const text = await grund(
      z.lazy(() => {
        throw new Error("fremder Text");
      }),
    );
    expect(text).toContain("Schema nicht lesbar");
    expect(text).not.toContain("fremder Text");
    expect(text).not.toContain("Object.prototype");
  });

  it("ein echter Feldname meldet weiter den Feldnamen", async () => {
    expect(await grund(z.object({ constructor: z.unknown() }))).toContain("Object.prototype");
  });
});
