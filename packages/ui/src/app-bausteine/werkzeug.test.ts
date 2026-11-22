/**
 * PaiBot – Tests der Einstufungs-Regeln und der Texte der App-Bausteine.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BEISPIEL_WERKZEUGE } from "./beispiele";
import { werkzeugSumme, wirdAngeboten, wirksameArt } from "./werkzeug";

describe("Einstufung", () => {
  it("Standard ist „schreibt“: ohne Bestätigung nie „liest“, auch wenn art „liest“ sagt", () => {
    expect(wirksameArt("neu", undefined)).toBe("schreibt");
    expect(wirksameArt("neu", "liest")).toBe("schreibt");
    expect(wirdAngeboten("neu", "liest")).toBe(false);
  });

  it("nur eine bestätigte Fassung mit „liest“ geht an Bots", () => {
    expect(wirdAngeboten("bestaetigt", "liest")).toBe(true);
    expect(wirdAngeboten("bestaetigt", "schreibt")).toBe(false);
    expect(wirdAngeboten("bestaetigt", "gesperrt")).toBe(false);
    expect(wirdAngeboten("bestaetigt", undefined)).toBe(false);
  });

  it("ein geändertes oder entferntes Werkzeug ist gesperrt, auch mit früherem „liest“", () => {
    expect(wirksameArt("geaendert", "liest")).toBe("gesperrt");
    expect(wirdAngeboten("geaendert", "liest")).toBe(false);
    expect(wirksameArt("entfernt", "liest")).toBe("gesperrt");
    expect(wirdAngeboten("entfernt", "liest")).toBe(false);
  });

  it("zählt die Beispiel-Werkzeuge richtig", () => {
    expect(werkzeugSumme(BEISPIEL_WERKZEUGE)).toEqual({
      gesamt: 7,
      lesen: 2,
      schreiben: 1,
      gesperrt: 1,
      offen: 2,
      geaendert: 1,
    });
  });
});

describe("Texte der App-Bausteine", () => {
  const quelle = readFileSync(new URL("../../../shared/src/i18n/de.ts", import.meta.url), "utf-8");
  const block = quelle.slice(quelle.indexOf("// Apps (MCP-Server)"));

  it("der Block ist da und nicht klein", () => {
    expect(block.match(/"apps\./g)?.length ?? 0).toBeGreaterThan(80);
  });

  it("enthält weder „EU“ noch „sicher“ (keine Kennzeichnung ohne Beleg)", () => {
    expect(block.match(/\bEU\b|sicher/i)).toBeNull();
  });
});
