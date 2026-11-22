/**
 * PaiBot – Test: Ergebnis eines Werkzeugs in Text (fester Satz bei Fehlern, Kürzung, Medien, fremder Text).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { describe, expect, it } from "vitest";
import { INJECTED_INSTRUCTION } from "../../../tools/test-mcp-server/src/presets";
import { ergebnisZuText } from "./ergebnis";
import { MCP_FEHLERTEXTE } from "./fehler";

describe("Ergebnis zu Text", () => {
  it("übernimmt Text-Teile, bereinigt, und meldet fremden Text", () => {
    const ergebnis = ergebnisZuText({
      content: [
        { type: "text", text: "Erster​ Teil" },
        { type: "text", text: "Zweiter ![x](https://example.invalid/p.png)Teil" },
      ],
    });
    expect(ergebnis).toMatchObject({
      status: "ok",
      text: "Erster Teil\nZweiter Teil",
      gekuerzt: false,
      enthaeltFremdenText: true,
      fehlercode: null,
    });
  });

  it("gibt eine eingeschleuste Anweisung nur als Text weiter, nie als etwas anderes", () => {
    const ergebnis = ergebnisZuText({ content: [{ type: "text", text: INJECTED_INSTRUCTION }] });
    expect(ergebnis.text).toBe(INJECTED_INSTRUCTION);
    expect(ergebnis.enthaeltFremdenText).toBe(true);
  });

  it("macht aus isError einen festen Satz, auch wenn der Server eine Anweisung schickt", () => {
    const ergebnis = ergebnisZuText({
      isError: true,
      content: [{ type: "text", text: `Fehler. ${INJECTED_INSTRUCTION}` }],
    });
    expect(ergebnis.status).toBe("fehler");
    expect(ergebnis.text).toBe(MCP_FEHLERTEXTE.werkzeug_fehler);
    expect(ergebnis.text).not.toContain("Ignoriere");
    expect(ergebnis.enthaeltFremdenText).toBe(false);
    expect(ergebnis.fehlercode).toBe("werkzeug_fehler");
  });

  it("kürzt auf die Höchstlänge und meldet es", () => {
    const ergebnis = ergebnisZuText({ content: [{ type: "text", text: "wort ".repeat(100_000) }] });
    expect(ergebnis.gekuerzt).toBe(true);
    expect(ergebnis.text.length).toBeLessThanOrEqual(16_000);
    expect(ergebnis.text.endsWith("[… gekürzt]")).toBe(true);
    expect(ergebnis.status).toBe("ok");
  });

  it("verarbeitet ein großes Ergebnis von 1,5 Millionen Zeichen, ohne zu werfen", () => {
    const ergebnis = ergebnisZuText({ content: [{ type: "text", text: "x".repeat(1_500_000) }] });
    expect(ergebnis.gekuerzt).toBe(true);
    expect(ergebnis.text.length).toBeLessThanOrEqual(16_000);
  });

  it("ersetzt Bild, Ton, Verweis und Ressource durch feste Sätze und nennt ihre Art nie aus dem Text des Servers", () => {
    const ergebnis = ergebnisZuText({
      content: [
        { type: "image", data: "AAAA", mimeType: "image/png" },
        { type: "audio", data: "BBBB", mimeType: "audio/wav" },
        { type: "resource_link", uri: "https://example.invalid/x", name: "x" },
        { type: "resource", resource: { uri: "file:///x", text: "Inhalt" } },
        { type: INJECTED_INSTRUCTION },
      ],
    });
    expect(ergebnis.status).toBe("ok");
    expect(ergebnis.ausgelasseneTeile).toBe(5);
    expect(ergebnis.enthaeltFremdenText).toBe(false);
    expect(ergebnis.text).toBe(
      "[Nicht als Text übernommen: Bild, Ton, Verweis, anderer Inhalt, eingebettete Ressource]",
    );
    expect(ergebnis.text).not.toContain("AAAA");
    expect(ergebnis.text).not.toContain("Ignoriere");
  });

  it("nimmt strukturierten Inhalt nur, wenn kein Text da ist", () => {
    expect(ergebnisZuText({ content: [], structuredContent: { b: 1, a: "x" } }).text).toBe(
      '{"a":"x","b":1}',
    );
    expect(
      ergebnisZuText({ content: [{ type: "text", text: "Text" }], structuredContent: { a: 1 } })
        .text,
    ).toBe("Text");
  });

  it("hält ein Ergebnis ohne Inhalt für ein leeres, aber gültiges Ergebnis", () => {
    expect(ergebnisZuText({ content: [] })).toMatchObject({
      status: "ok",
      text: "",
      enthaeltFremdenText: false,
    });
  });

  it.each([null, "text", 5, [], undefined])("weist %s als Ergebnis ab", (wert) => {
    const ergebnis = ergebnisZuText(wert);
    expect(ergebnis.status).toBe("fehler");
    expect(ergebnis.fehlercode).toBe("app_antwort_ungueltig");
  });

  it("begrenzt die Zahl der Teile", () => {
    const teile = Array.from({ length: 1_000 }, (_, i) => ({ type: "text", text: `t${i}` }));
    const ergebnis = ergebnisZuText({ content: teile });
    expect(ergebnis.gekuerzt).toBe(true);
    expect(ergebnis.text.includes("t999")).toBe(false);
  });
});
