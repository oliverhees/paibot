/**
 * PaiBot – Test: Werkzeuge aufbereiten (Bereinigung, Modell-Form, Namen, Hinweise, Abgleich).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { describe, expect, it } from "vitest";
import {
  changingList,
  collision,
  INJECTED_INSTRUCTION,
  injectedDescription,
  LONG_TOOL_NAME,
  readOnlyLie,
  schemaDetailChange,
} from "../../../tools/test-mcp-server/src/presets";
import {
  bereiteWerkzeugeAuf,
  type McpWerkzeugRoh,
  modellDefinition,
  vergleicheWerkzeuge,
} from "./werkzeug";

const OPT = { appKurzname: "app" };

const ECHO: McpWerkzeugRoh = {
  name: "echo",
  description: "Gibt Text zurück.",
  inputSchema: { type: "object", properties: { text: { type: "string" } } },
};

function roh(
  verhalten: { tools?: unknown[]; laterTools?: unknown[] },
  wahl: "tools" | "laterTools" = "tools",
): McpWerkzeugRoh[] {
  // So meldet der Test-Server die Werkzeuge: ohne eigenes Schema mit einem leeren Objekt-Schema.
  return ((verhalten[wahl] ?? []) as McpWerkzeugRoh[]).map((werkzeug) => ({
    inputSchema: { type: "object", properties: {} },
    ...werkzeug,
  }));
}

describe("Beschreibung (bereinigt, ans Modell gleich dem Gespeicherten)", () => {
  it("entfernt Null-Breite, Umkehr-Zeichen und das Markdown-Bild aus der Beschreibung des Test-Servers", () => {
    const [werkzeug] = bereiteWerkzeugeAuf(roh(injectedDescription()), OPT);
    for (const zeichen of ["\u200b", "\u200d", "\u202e", "\u202c"]) {
      expect(werkzeug?.beschreibung.includes(zeichen)).toBe(false);
    }
    expect(werkzeug?.beschreibung).not.toContain("![");
    expect(werkzeug?.beschreibung).toContain("Gibt Text zurück.");
    expect(werkzeug?.textVeraendert).toBe(true);
  });

  it("ist die Text-Form, die das Modell bekommt: modellDefinition liefert genau sie", () => {
    const [werkzeug] = bereiteWerkzeugeAuf(roh(injectedDescription()), OPT);
    const definition = werkzeug ? modellDefinition(werkzeug) : null;
    expect(definition?.description).toBe(werkzeug?.beschreibung);
    expect(definition?.name).toBe("app__echo");
    expect(definition?.inputSchema).toBe(werkzeug?.schemaFuerModell);
  });

  it("kürzt auf 1 000 Zeichen", () => {
    const [werkzeug] = bereiteWerkzeugeAuf([{ ...ECHO, description: "a".repeat(5_000) }], OPT);
    expect(werkzeug?.beschreibung.length).toBeLessThanOrEqual(1_000);
    expect(werkzeug?.beschreibung.endsWith("…")).toBe(true);
  });

  it("macht aus einer fehlenden Beschreibung einen leeren Text", () => {
    const [werkzeug] = bereiteWerkzeugeAuf([{ name: "x", inputSchema: { type: "object" } }], OPT);
    expect(werkzeug?.beschreibung).toBe("");
    expect(werkzeug?.bestaetigbar).toBe(true);
  });

  it("zählt Beschreibung und Schema-Texte zusammen", () => {
    const [werkzeug] = bereiteWerkzeugeAuf(
      [
        {
          name: "x",
          description: "12345",
          inputSchema: {
            type: "object",
            properties: { ab: { type: "string", description: "123" } },
          },
        },
      ],
      OPT,
    );
    expect(werkzeug?.modellTextZeichen).toBe(5 + 2 + 3);
  });
});

describe("Hinweise des Servers sind nur Anzeige", () => {
  it("zeigt readOnlyHint als „laut App“, macht das Werkzeug aber nicht zu einem lesenden", () => {
    const [werkzeug] = bereiteWerkzeugeAuf(roh(readOnlyLie()), OPT);
    expect(werkzeug?.hinweise).toEqual({
      nurLesend: true,
      destruktiv: false,
      wiederholbar: true,
      offeneWelt: null,
    });
    // Das Ergebnis hat keine Angabe „liest/schreibt“: das entscheidet allein der Besitzer.
    expect(Object.keys(werkzeug ?? {}).sort()).toEqual(
      [
        "abdruck",
        "anzeigeName",
        "beschreibung",
        "bestaetigbar",
        "hinweise",
        "modellName",
        "modellTextZeichen",
        "originalName",
        "problem",
        "pruefer",
        "schemaFuerModell",
        "textVeraendert",
        "titel",
      ].sort(),
    );
    const definition = werkzeug ? modellDefinition(werkzeug) : null;
    expect(JSON.stringify(definition)).not.toContain("readOnly");
  });

  it("nimmt nur Wahrheitswerte als Hinweis", () => {
    const [werkzeug] = bereiteWerkzeugeAuf(
      [{ ...ECHO, annotations: { readOnlyHint: "ja", destructiveHint: 1 } }],
      OPT,
    );
    expect(werkzeug?.hinweise.nurLesend).toBeNull();
    expect(werkzeug?.hinweise.destruktiv).toBeNull();
  });
});

describe("Namen", () => {
  it("vergibt drei verschiedene Modell-Namen für zwei Apps mit `search` und das eingebaute `doku_nachschlagen`", () => {
    const erste = bereiteWerkzeugeAuf(roh(collision("eins")), { appKurzname: "eins" });
    const zweite = bereiteWerkzeugeAuf(roh(collision("zwei")), {
      appKurzname: "zwei",
      bereitsVergeben: new Set(erste.map((w) => w.modellName)),
    });
    const namen = [...erste, ...zweite].map((w) => w.modellName);
    expect(new Set(namen).size).toBe(namen.length);
    expect(namen).not.toContain("doku_nachschlagen");
    expect(namen.every((n) => n.includes("__"))).toBe(true);
  });

  it("gibt dem langen Namen mit Punkt einen gültigen Modell-Namen, der Original-Name geht unverändert an den Server", () => {
    const [werkzeug] = bereiteWerkzeugeAuf([{ ...ECHO, name: LONG_TOOL_NAME }], OPT);
    expect(werkzeug?.modellName.length).toBeLessThanOrEqual(64);
    expect(werkzeug?.modellName).toMatch(/^[A-Za-z0-9_-]{1,64}$/);
    expect(werkzeug?.originalName).toBe(LONG_TOOL_NAME);
    expect(werkzeug?.anzeigeName.length).toBeLessThanOrEqual(128);
  });

  it("sperrt zwei Werkzeuge mit gleichem Namen (das zweite)", () => {
    const liste = bereiteWerkzeugeAuf([ECHO, { ...ECHO, description: "anders" }], OPT);
    expect(liste[0]?.bestaetigbar).toBe(true);
    expect(liste[1]?.problem).toBe("name_doppelt");
    expect(liste[1]?.modellName).toBe("");
  });

  it("sperrt leere und übergroße Namen sowie Einträge, die kein Werkzeug sind", () => {
    const liste = bereiteWerkzeugeAuf(
      [
        { ...ECHO, name: "" },
        { ...ECHO, name: "n".repeat(300) },
        "text",
        null,
        { inputSchema: {} },
      ],
      OPT,
    );
    expect(liste.map((w) => w.problem)).toEqual([
      "name_ungueltig",
      "name_ungueltig",
      "werkzeug_ungueltig",
      "werkzeug_ungueltig",
      "werkzeug_ungueltig",
    ]);
    expect(
      liste.every((w) => !w.bestaetigbar && w.pruefer === null && modellDefinition(w) === null),
    ).toBe(true);
  });

  it("macht aus einem nicht prüfbaren Schema ein gesperrtes Werkzeug mit Grund, ohne zu werfen", () => {
    const [werkzeug] = bereiteWerkzeugeAuf(
      [{ ...ECHO, inputSchema: { type: "object", properties: { a: { $ref: "#/x" } } } }],
      OPT,
    );
    expect(werkzeug?.bestaetigbar).toBe(false);
    expect(werkzeug?.problem).toBe("schema_stichwort_nicht_pruefbar");
    expect(werkzeug?.schemaFuerModell).toBeNull();
  });
});

describe("Abgleich der Liste (neu, geändert, unverändert, entfernt)", () => {
  const speichere = (liste: McpWerkzeugRoh[]) =>
    bereiteWerkzeugeAuf(liste, OPT).map((w) => ({
      originalName: w.originalName,
      abdruck: w.abdruck,
    }));

  it("erkennt eine still geänderte Beschreibung und ein neues Werkzeug", () => {
    const vorher = speichere(roh(changingList()));
    const jetzt = bereiteWerkzeugeAuf(roh(changingList(), "laterTools"), OPT);
    const abgleich = vergleicheWerkzeuge(vorher, jetzt);
    expect(abgleich.geaendert.map((w) => w.originalName)).toEqual(["echo"]);
    expect(abgleich.neu.map((w) => w.originalName)).toEqual(["neues_werkzeug"]);
    expect(abgleich.unveraendert).toEqual([]);
    expect(abgleich.geaendert[0]?.beschreibung).toContain(INJECTED_INSTRUCTION);
  });

  it("erkennt eine Änderung nur im Detail des Schemas (gleicher Name und Text)", () => {
    const verhalten = schemaDetailChange();
    const vorher = speichere(roh(verhalten));
    const abgleich = vergleicheWerkzeuge(
      vorher,
      bereiteWerkzeugeAuf(roh(verhalten, "laterTools"), OPT),
    );
    expect(abgleich.geaendert.map((w) => w.originalName)).toEqual(["senden"]);
  });

  it("meldet entfernte Werkzeuge und lässt Unveränderte stehen", () => {
    const vorher = speichere([ECHO, { ...ECHO, name: "weg" }]);
    const abgleich = vergleicheWerkzeuge(vorher, bereiteWerkzeugeAuf([ECHO], OPT));
    expect(abgleich.unveraendert.map((w) => w.originalName)).toEqual(["echo"]);
    expect(abgleich.entfernt.map((w) => w.originalName)).toEqual(["weg"]);
    expect(abgleich.neu).toEqual([]);
    expect(abgleich.geaendert).toEqual([]);
  });

  it("erkennt auch eine Änderung nur durch ein unsichtbares Zeichen", () => {
    const vorher = speichere([ECHO]);
    const abgleich = vergleicheWerkzeuge(
      vorher,
      bereiteWerkzeugeAuf([{ ...ECHO, description: "Gibt Text zurück.​" }], OPT),
    );
    expect(abgleich.geaendert.map((w) => w.originalName)).toEqual(["echo"]);
  });
});
