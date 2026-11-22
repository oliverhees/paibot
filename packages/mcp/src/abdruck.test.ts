/**
 * PaiBot – Test: Abdruck der Rohform (stabil, empfindlich, ohne Rekursion).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { describe, expect, it } from "vitest";
import { abdruckVonText, abdruckVonWert, kanonischeForm } from "./abdruck";
import { bereiteWerkzeugeAuf } from "./werkzeug";

const WERKZEUG = {
  name: "suchen",
  title: "Suchen",
  description: "Sucht Einträge.",
  inputSchema: { type: "object", properties: { frage: { type: "string" } }, required: ["frage"] },
  annotations: { readOnlyHint: true },
};

describe("kanonische Form", () => {
  it("sortiert Schlüssel auf jeder Ebene und schreibt ohne Leerzeichen", () => {
    expect(kanonischeForm({ b: [1, { z: 1, a: null }], a: "x" })).toBe(
      '{"a":"x","b":[1,{"a":null,"z":1}]}',
    );
  });

  it("schreibt Zahlen, Texte und Leeres wie JSON", () => {
    expect(kanonischeForm([-0, 1.5, "ä\n\u0001", true, false, null, [], {}])).toBe(
      '[0,1.5,"ä\\n\\u0001",true,false,null,[],{}]',
    );
  });
});

describe("Abdruck eines Werkzeugs", () => {
  it("ist stabil: gleiche Werte in anderer Reihenfolge der Schlüssel ergeben denselben Abdruck", () => {
    const umgestellt = {
      annotations: { readOnlyHint: true },
      inputSchema: {
        required: ["frage"],
        properties: { frage: { type: "string" } },
        type: "object",
      },
      description: "Sucht Einträge.",
      title: "Suchen",
      name: "suchen",
    };
    expect(abdruckVonWert(umgestellt)).toBe(abdruckVonWert(WERKZEUG));
    const [a] = bereiteWerkzeugeAuf([WERKZEUG], { appKurzname: "app" });
    const [b] = bereiteWerkzeugeAuf([umgestellt], { appKurzname: "app" });
    expect(a?.abdruck).toBe(b?.abdruck);
  });

  it("ändert sich schon bei einem einzigen unsichtbaren Zeichen in der Beschreibung", () => {
    const [vorher] = bereiteWerkzeugeAuf([WERKZEUG], { appKurzname: "app" });
    const [nachher] = bereiteWerkzeugeAuf([{ ...WERKZEUG, description: "Sucht Einträge.​" }], {
      appKurzname: "app",
    });
    // Die bereinigte Beschreibung ist gleich, der Abdruck der Rohform nicht.
    expect(nachher?.beschreibung).toBe(vorher?.beschreibung);
    expect(nachher?.abdruck).not.toBe(vorher?.abdruck);
    expect(nachher?.textVeraendert).toBe(true);
  });

  it.each([
    ["ein unbekannter Schlüssel", { ...WERKZEUG, extra: 1 }],
    ["_meta", { ...WERKZEUG, _meta: { a: 1 } }],
    ["ein Hinweis", { ...WERKZEUG, annotations: { readOnlyHint: false } }],
    [
      "ein Detail im Schema",
      {
        ...WERKZEUG,
        inputSchema: {
          ...WERKZEUG.inputSchema,
          properties: { frage: { type: "string", maxLength: 5 } },
        },
      },
    ],
    ["der Titel", { ...WERKZEUG, title: "Suchen!" }],
    ["das Ausgabe-Schema", { ...WERKZEUG, outputSchema: { type: "object" } }],
  ])("ändert sich bei %s", (_name, geaendert) => {
    expect(abdruckVonWert(geaendert)).not.toBe(abdruckVonWert(WERKZEUG));
  });

  it("hat die Form sha256 und 64 Hex-Zeichen und hängt vom Vorsatz ab", () => {
    expect(abdruckVonText("x")).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(abdruckVonText("x")).not.toBe(abdruckVonText("y"));
  });
});
