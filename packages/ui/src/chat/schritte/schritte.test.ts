/**
 * PaiBot – Tests der Schritte im Chat: Text bereinigen, Stile ohne Farbwerte, Texte der Oberfläche.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SCHRITT_MAX, schrittText } from "./text";

describe("schrittText", () => {
  it("lässt Markup und Markdown als Zeichen stehen, entfernt aber unsichtbare und Richtungszeichen", () => {
    const roh = "<script>alert(1)</script> ![x](https://example.org/a.png) \u202e\u200bText\u2066";
    const text = schrittText(roh, "vorlaeufig");
    expect(text).toContain("<script>alert(1)</script>");
    expect(text).toContain("![x](https://example.org/a.png)");
    expect(text).not.toMatch(/[\u202e\u200b\u2066]/u);
  });

  it("kürzt nach Art und setzt „…“", () => {
    const lang = "a".repeat(SCHRITT_MAX.name + 50);
    const text = schrittText(lang, "name");
    expect(Array.from(text).length).toBe(SCHRITT_MAX.name);
    expect(text.endsWith("…")).toBe(true);
  });

  it("Namen, Fragen und Quellen sind einzeilig, lange Texte behalten Zeilen", () => {
    expect(schrittText("a\nb", "eingabe")).toBe("a b");
    expect(schrittText("a\nb", "vorlaeufig")).toBe("a\nb");
    expect(schrittText(42, "name")).toBe("");
  });
});

describe("Stile", () => {
  const css = readFileSync(new URL("./Schritte.module.css", import.meta.url), "utf-8").replace(
    /\/\*[\s\S]*?\*\//g,
    "",
  );
  const antwortZeile = readFileSync(
    new URL("../AntwortZeile.module.css", import.meta.url),
    "utf-8",
  ).replace(/\/\*[\s\S]*?\*\//g, "");

  it("enthalten keine Farbwerte, nur Tokens", () => {
    for (const quelle of [css, antwortZeile]) {
      expect(quelle.match(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/g)).toBeNull();
    }
  });

  it("beachten „weniger Bewegung“", () => {
    expect(css).toContain("prefers-reduced-motion: reduce");
  });
});

describe("Texte der Schritte", () => {
  const quelle = readFileSync(
    new URL("../../../../shared/src/i18n/de.ts", import.meta.url),
    "utf-8",
  );
  const ab = quelle.slice(quelle.indexOf("// Schritte im Chat"));
  // Der Block reicht bis zum nächsten Kommentar; was danach folgt, gehört anderen Zweigen.
  const ende = ab.indexOf("\n  // ", 10);
  const block = ende < 0 ? ab : ab.slice(0, ende);
  const danach = ende < 0 ? "" : ab.slice(ende);
  const zeilen = [...block.matchAll(/"schritte\.[a-z_.]+":\s*\n?\s*"([^"]*)"/g)].map((m) => m[1]);

  it("der Block ist da und geschlossen: danach folgt kein Text der Schritte", () => {
    expect(zeilen.length).toBeGreaterThan(40);
    expect(danach).not.toMatch(/"schritte\./);
  });

  it("kein „Open Source“, „DSGVO“, „EU“, „sicher“", () => {
    expect(block.match(/Open Source|DSGVO|\bEU\b|sicher/i)).toBeNull();
  });

  it("„geprüft“ steht nie ohne „nicht“ davor", () => {
    for (const z of zeilen) {
      for (const m of (z ?? "").matchAll(/geprüft/g)) {
        const davor = (z ?? "").slice(Math.max(0, (m.index ?? 0) - 8), m.index);
        expect(davor, z).toMatch(/nicht $/);
      }
    }
  });
});
