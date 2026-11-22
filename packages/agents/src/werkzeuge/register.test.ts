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
  it("ist in dieser Fassung leer und enthält kein test_*", async () => {
    expect(builtinTools()).toEqual([]);
    const shipped = await createShippedRegistry();
    expect(shipped.tools).toEqual([]);
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
