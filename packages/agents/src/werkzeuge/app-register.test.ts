/**
 * PaiBot – Test: Werkzeuge aus Apps im Register eines Laufs
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { type AppId, type AppToolId, newId } from "@paibot/shared/ids";
import type { JsonValue } from "@paibot/shared/motor";
import { describe, expect, it } from "vitest";
import { createTestTools } from "../testing/werkzeuge";
import { type AppWerkzeugEintrag, erweitereRegister } from "./app-register";
import { createToolRegistry } from "./register";

const APP = newId("app") as AppId;
const DIGEST = `sha256:${"a".repeat(64)}` as const;

function eintrag(aenderung: Partial<AppWerkzeugEintrag> = {}): AppWerkzeugEintrag {
  return {
    appId: APP,
    appToolId: newId("tool") as AppToolId,
    originalName: "suche",
    kurzname: "wiki",
    toolKey: "mcp/wiki/suche",
    modelName: "wiki__suche",
    version: 1,
    toolDigest: DIGEST,
    description: "Sucht im Wiki.",
    inputSchema: {
      type: "object",
      properties: { q: { type: "string" } },
      additionalProperties: false,
    },
    pruefeArgumente: (a) => typeof a === "object" && a !== null && "q" in a,
    rufeAuf: async () => ({ status: "ok", text: "Treffer", gekuerzt: false, fehlercode: null }),
    ...aenderung,
  };
}

async function basis() {
  return createToolRegistry([createTestTools().byName("test_lesen")]);
}

describe("erweitereRegister (Werkzeuge aus Apps)", () => {
  it("nimmt ein gültiges Werkzeug auf: Quelle mcp, fremder Inhalt fest, Abdruck aus der Datenbank", async () => {
    const { registry, ausgeschlossen } = await erweitereRegister(await basis(), [eintrag()]);
    expect(ausgeschlossen).toEqual([]);
    const tool = registry.byModelName("wiki__suche");
    expect(tool?.definition.source).toBe("mcp");
    expect(tool?.definition.foreignContent).toBe(true);
    expect(tool?.definition.reach).toBe("nach_aussen");
    expect(tool?.toolDigest).toBe(DIGEST);
    expect(tool?.app?.appId).toBe(APP);
    expect(tool?.spec.inputSchema).toEqual(eintrag().inputSchema);
    // die eingebauten Werkzeuge bleiben, in fester Reihenfolge davor
    expect(registry.tools[0]?.definition.modelName).toBe("test_lesen");
    expect(registry.tools).toHaveLength(2);
    expect(registry.placeholder.toolKey).toBe("eingebaut/unbekannt");
  });

  it("prüft Argumente mit dem Prüfer der App (Eingabe-Schema der Registerzeile)", async () => {
    const { registry } = await erweitereRegister(await basis(), [eintrag()]);
    const schema = registry.byModelName("wiki__suche")?.definition.input;
    expect(schema?.safeParse({ q: "x" }).success).toBe(true);
    expect(schema?.safeParse({ z: "x" }).success).toBe(false);
  });

  // Gegenprobe je Fall: die Prüfung in `erweitereRegister` entfernen → Werkzeug im Register, rot.
  it.each<[string, Partial<AppWerkzeugEintrag>]>([
    ["Name ohne „__“", { modelName: "wikisuche" }],
    ["Name gegen das Muster", { modelName: "wiki__su.che" }],
    ["Name eines eingebauten Werkzeugs", { modelName: "test_lesen" }],
    ["Kennung ohne mcp/<kurzname>/", { toolKey: "eingebaut/suche" }],
    ["Kennung des Platzhalters", { toolKey: "eingebaut/unbekannt" }],
    ["leere Beschreibung", { description: "" }],
    ["Beschreibung über 1 000 Zeichen", { description: "x".repeat(1001) }],
    ["Beschreibung mit Bidi-Zeichen", { description: "a‮b" }],
    ["Abdruck ungültig", { toolDigest: "kaputt" as never }],
    ["Fassung 0", { version: 0 }],
    ["Schema ist kein Objekt", { inputSchema: [] as unknown as Record<string, JsonValue> }],
  ])("schließt aus: %s", async (_name, aenderung) => {
    const { registry, ausgeschlossen } = await erweitereRegister(await basis(), [
      eintrag(aenderung),
    ]);
    expect(registry.tools).toHaveLength(1);
    expect(ausgeschlossen).toHaveLength(1);
    // Der Grund ist ein fester Text, nie Text aus der App.
    expect(ausgeschlossen[0]?.fehler.message).toMatch(/^Werkzeug-Register: /);
  });

  it("schließt ein zu tiefes oder zu großes Schema aus, bevor etwas damit gerechnet wird", async () => {
    let tief: Record<string, JsonValue> = {};
    const wurzel = tief;
    for (let i = 0; i < 5000; i++) {
      const naechstes: Record<string, JsonValue> = {};
      tief.k = naechstes;
      tief = naechstes;
    }
    const gross = {
      type: "object",
      properties: Object.fromEntries(
        Array.from({ length: 200_000 }, (_, i) => [`f${i}`, { type: "string" }]),
      ),
    };
    for (const inputSchema of [wurzel, gross]) {
      const { ausgeschlossen } = await erweitereRegister(await basis(), [eintrag({ inputSchema })]);
      expect(ausgeschlossen).toHaveLength(1);
    }
  });

  it("zwei Werkzeuge mit gleichem Namen oder gleicher Kennung: das zweite fällt heraus, das erste bleibt", async () => {
    const { registry, ausgeschlossen } = await erweitereRegister(await basis(), [
      eintrag(),
      eintrag({ appToolId: newId("tool") as AppToolId }),
    ]);
    expect(registry.tools.filter((t) => t.definition.source === "mcp")).toHaveLength(1);
    expect(ausgeschlossen).toHaveLength(1);
  });

  it("höchstens 32 Werkzeuge aus Apps je Lauf; die übrigen werden ausgeschlossen, die ersten bleiben", async () => {
    const viele = Array.from({ length: 40 }, (_, i) =>
      eintrag({
        toolKey: `mcp/wiki/t${i}` as never,
        modelName: `wiki__t${i}`,
        originalName: `t${i}`,
      }),
    );
    const { registry, ausgeschlossen } = await erweitereRegister(await basis(), viele);
    expect(registry.tools.filter((t) => t.definition.source === "mcp")).toHaveLength(32);
    expect(registry.byModelName("wiki__t0")).toBeDefined();
    expect(registry.byModelName("wiki__t32")).toBeUndefined();
    expect(ausgeschlossen).toHaveLength(8);
    expect(ausgeschlossen.every((a) => a.appId === APP)).toBe(true);
  });

  it("die Kennung in der Meldung ist bereinigt und höchstens 128 Zeichen lang", async () => {
    const { ausgeschlossen } = await erweitereRegister(await basis(), [
      eintrag({ toolKey: `mcp/wiki/‮${"x".repeat(300)}` as never, modelName: "kaputt" }),
    ]);
    expect(ausgeschlossen[0]?.key).not.toContain("‮");
    expect(Array.from(ausgeschlossen[0]?.key ?? "").length).toBeLessThanOrEqual(128);
  });

  it("die Eingabe-Prüfung wirft nie nach außen, auch wenn der Prüfer wirft", async () => {
    const { registry } = await erweitereRegister(await basis(), [
      eintrag({
        pruefeArgumente: () => {
          throw new Error("GEHEIM");
        },
      }),
    ]);
    expect(registry.byModelName("wiki__suche")?.definition.input.safeParse({ q: 1 }).success).toBe(
      false,
    );
  });
});
