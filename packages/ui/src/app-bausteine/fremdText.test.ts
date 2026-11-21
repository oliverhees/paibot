/**
 * PaiBot – Tests der Bereinigung von fremdem Text.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { describe, expect, it } from "vitest";
import { bereinigeFremdText, FREMD_MAX } from "./fremdText";

describe("fremder Text", () => {
  it("entfernt Null-Breite-, Leserichtungs- und Steuerzeichen", () => {
    const roh = "a​b‮c\u0007d﻿e\u{E0041}f";
    expect(bereinigeFremdText(roh, "name").text).toBe("abcdef");
  });

  it("lässt Markup und Markdown unverändert als Zeichen stehen (gezeigt wird es nur als Text)", () => {
    const roh = '<script>alert(1)</script> [Link](https://x.example) <img src="x">';
    expect(bereinigeFremdText(roh, "beschreibung").text).toBe(roh);
  });

  it("macht Namen einzeilig, Beschreibungen mit höchstens einer Leerzeile", () => {
    expect(bereinigeFremdText("a\nb\r\nc", "name").text).toBe("a b c");
    expect(bereinigeFremdText("a\n\n\n\nb", "beschreibung").text).toBe("a\n\nb");
  });

  it("kürzt mit „…“ auf die Höchstlänge und meldet es", () => {
    const e = bereinigeFremdText("x".repeat(FREMD_MAX.name + 50), "name");
    expect(Array.from(e.text)).toHaveLength(FREMD_MAX.name);
    expect(e.text.endsWith("…")).toBe(true);
    expect(e.gekuerzt).toBe(true);
    expect(bereinigeFremdText("kurz", "name").gekuerzt).toBe(false);
  });

  it("zerschneidet keine Zeichen aus zwei Code-Einheiten beim Kürzen", () => {
    const e = bereinigeFremdText("😀".repeat(FREMD_MAX.name + 5), "name");
    expect(Array.from(e.text)).toHaveLength(FREMD_MAX.name);
    expect(e.text).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
  });

  it("nimmt Nicht-Text als leer", () => {
    expect(bereinigeFremdText(undefined, "name").text).toBe("");
    expect(bereinigeFremdText(42, "name").text).toBe("");
  });
});
