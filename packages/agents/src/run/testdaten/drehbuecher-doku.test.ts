/**
 * PaiBot – Test: Die Drehbücher für Läufe mit dem Nachschlagen in der Doku haben die Form, die der
 * Test-Anbieter annimmt, und ihre Eingaben liegen wirklich an den Rändern der Grenzen.
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
import { DOKU_NAME, DOKU_SCRIPTS, EINGABE_RAENDER, ENTWURF } from "./drehbuecher-doku";

describe("Drehbücher für das Nachschlagen in der Doku", () => {
  it.each(Object.entries(DOKU_SCRIPTS))(
    "%s hat die Form, die der Test-Anbieter annimmt",
    (_, script) => {
      const typed: FakeScript = script;
      expect(checkScript(JSON.parse(JSON.stringify(typed)))).toEqual(
        JSON.parse(JSON.stringify(script)),
      );
    },
  );

  it("der Name des Werkzeugs passt zum Namensmuster", () => {
    expect(TOOL_NAME_PATTERN.test(DOKU_NAME)).toBe(true);
  });

  it("die Ränder der Eingabe liegen genau neben bzw. auf den Grenzen", () => {
    expect(EINGABE_RAENDER.frage2.frage).toHaveLength(2);
    expect(EINGABE_RAENDER.frage201.frage).toHaveLength(201);
    expect(EINGABE_RAENDER.dreiBegriffe.andere_begriffe).toHaveLength(3);
    expect(EINGABE_RAENDER.begriff81.andere_begriffe[0]).toHaveLength(81);
    expect(EINGABE_RAENDER.gueltigGrenzen.frage).toHaveLength(200);
    expect(EINGABE_RAENDER.gueltigGrenzen.andere_begriffe.map((b) => b.length)).toEqual([80, 80]);
    expect(EINGABE_RAENDER.gueltigKurz.frage).toHaveLength(3);
  });

  it("der Schritt vor „nichts gefunden“ schreibt Text und schlägt im selben Schritt nach", () => {
    const [first] = DOKU_SCRIPTS.nichtsGefunden.steps;
    expect(first?.text).toBe(ENTWURF);
    expect(first?.toolCalls?.map((call) => call.name)).toEqual([DOKU_NAME]);
  });
});
