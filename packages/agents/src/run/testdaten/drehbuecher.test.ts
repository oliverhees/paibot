/**
 * PaiBot – Test: Die festen Drehbücher für Läufe mit Werkzeugen haben die Form, die der
 * Test-Anbieter annimmt, und enthalten genau die Ränder, die die Lauf-Tests brauchen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { checkScript, type FakeScript } from "@paibot/fake-provider";
import { TOOL_NAME_PATTERN } from "@paibot/shared/objekte";
import { describe, expect, it } from "vitest";
import { longInput, SCRIPTS } from "./drehbuecher";

describe("Drehbücher für Läufe mit Werkzeugen", () => {
  it.each(Object.entries(SCRIPTS))(
    "%s hat die Form, die der Test-Anbieter annimmt",
    (_, script) => {
      expect(checkScript(JSON.parse(JSON.stringify(script)))).toEqual(
        JSON.parse(JSON.stringify(script)),
      );
    },
  );

  it("jedes Drehbuch passt zum Typ des Test-Anbieters", () => {
    const scripts: Record<string, FakeScript> = SCRIPTS;
    expect(Object.keys(scripts).length).toBeGreaterThan(0);
  });

  it("Aufruf-Zahlen: 3, 9, 17 und 500 in einem Schritt", () => {
    expect(SCRIPTS.dreiAufrufe.steps[0]?.toolCalls).toHaveLength(3);
    expect(SCRIPTS.neunAufrufe.steps[0]?.toolCalls).toHaveLength(9);
    expect(SCRIPTS.siebzehnAufrufe.steps[0]?.toolCalls).toHaveLength(17);
    expect(SCRIPTS.fuenfhundertAufrufe.steps[0]?.toolCalls).toHaveLength(500);
  });

  it("die ungültigen Namen verletzen das Namensmuster wirklich", () => {
    for (const script of [
      SCRIPTS.nameMitPunkt,
      SCRIPTS.nameLeer,
      SCRIPTS.name65,
      SCRIPTS.name300,
    ]) {
      const name = script.steps[0]?.toolCalls?.[0]?.name ?? "";
      expect(TOOL_NAME_PATTERN.test(name)).toBe(false);
    }
    expect(SCRIPTS.name65.steps[0]?.toolCalls?.[0]?.name).toHaveLength(65);
    expect(SCRIPTS.name300.steps[0]?.toolCalls?.[0]?.name).toHaveLength(300);
    expect(TOOL_NAME_PATTERN.test("gibt_es_nicht")).toBe(true);
  });

  it("Kennungen: leer, 201 Zeichen, doppelt", () => {
    expect(SCRIPTS.callIdLeer.steps[0]?.toolCalls?.[0]?.id).toBe("");
    expect(SCRIPTS.callId201.steps[0]?.toolCalls?.[0]?.id).toHaveLength(201);
    const [a, b] = SCRIPTS.callIdDoppelt.steps[0]?.toolCalls ?? [];
    expect(a?.id).toBe(b?.id);
  });

  it("gültiges JSON als Text ist eine JSON-Zeichenkette, deren Inhalt selbst JSON ist", () => {
    const args = SCRIPTS.jsonAlsText.steps[0]?.toolCalls?.[0]?.arguments;
    expect(typeof args).toBe("string");
    const decoded: unknown = JSON.parse(args as string);
    expect(typeof decoded).toBe("string");
    expect(JSON.parse(decoded as string)).toEqual({ q: 1 });
  });

  it("lange Eingaben: über 2 000 Zeichen, gleich bis Zeichen 2 000, danach verschieden", () => {
    const a = JSON.stringify(longInput("A"));
    const b = JSON.stringify(longInput("B"));
    expect(a.length).toBeGreaterThan(2000);
    expect(a.slice(0, 2000)).toBe(b.slice(0, 2000));
    expect(a).not.toBe(b);
  });

  it("ohne Verbrauchsangabe und endlos wiederholt", () => {
    expect(SCRIPTS.ohneVerbrauch.steps[0]?.usage).toBe(false);
    expect(SCRIPTS.ohneVerbrauch.after).toBe("letzten-wiederholen");
    expect(SCRIPTS.endlos.after).toBe("letzten-wiederholen");
  });
});
