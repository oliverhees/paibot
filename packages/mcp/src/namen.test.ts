/**
 * PaiBot – Test: Namen für das Modell (eindeutig, 64 Zeichen, nie der Original-Name).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { describe, expect, it } from "vitest";
import { bereinigeNamensteil, MODELL_NAME_MUSTER, vergebeModellNamen } from "./namen";

describe("Modell-Namen", () => {
  it("bilden <app>__<name> und passen zum Namensmuster", () => {
    const namen = vergebeModellNamen("linear", ["list_issues", "Get Issue!"]);
    expect(namen.map((n) => n.modellName)).toEqual(["linear__list_issues", "linear__Get_Issue"]);
    for (const n of namen) expect(n.modellName).toMatch(MODELL_NAME_MUSTER);
  });

  it("geben dem Namen mit Punkt und 128 Zeichen einen gültigen Namen von höchstens 64 Zeichen", () => {
    const lang = `${"a".repeat(60)}.${"b".repeat(67)}`;
    const [eintrag] = vergebeModellNamen("app", [lang]);
    expect(eintrag?.modellName.length).toBeLessThanOrEqual(64);
    expect(eintrag?.modellName).toMatch(MODELL_NAME_MUSTER);
    expect(eintrag?.original).toBe(lang);
  });

  it("lösen Kollisionen in einer App mit Zähler und unabhängig von der Reihenfolge der Liste", () => {
    const eins = vergebeModellNamen("app", ["a.b", "a-b", "a b", "a_b"]);
    const zwei = vergebeModellNamen("app", ["a_b", "a b", "a-b", "a.b"]);
    const tabelle = (liste: typeof eins) =>
      Object.fromEntries(liste.map((n) => [n.original, n.modellName]));
    expect(tabelle(eins)).toEqual(tabelle(zwei));
    expect(new Set(eins.map((n) => n.modellName)).size).toBe(4);
  });

  it("geben zwei Apps mit demselben Werkzeug `search` verschiedene Namen, und `doku_nachschlagen` bleibt dem eingebauten Werkzeug", () => {
    const erste = vergebeModellNamen("alpha", ["search", "doku_nachschlagen"]);
    const zweite = vergebeModellNamen("beta", ["search"], new Set(erste.map((n) => n.modellName)));
    const alle = [...erste, ...zweite].map((n) => n.modellName);
    expect(new Set(alle).size).toBe(3);
    expect(alle).not.toContain("doku_nachschlagen");
    for (const name of alle) expect(name).toContain("__");
  });

  it("vermeiden Namen, die schon an andere Apps vergeben sind", () => {
    const [eintrag] = vergebeModellNamen("app", ["x"], new Set(["app__x"]));
    expect(eintrag?.modellName).toBe("app__x_2");
  });

  it("weisen einen ungültigen oder zu langen Kurznamen ab", () => {
    expect(() => vergebeModellNamen("Gross", ["x"])).toThrow(RangeError);
    expect(() => vergebeModellNamen("a".repeat(64), ["x"])).toThrow(RangeError);
  });

  it("machen aus einem Namen ohne brauchbare Zeichen einen Ersatznamen", () => {
    expect(bereinigeNamensteil("###")).toBe("werkzeug");
    expect(bereinigeNamensteil("a__b")).toBe("a_b");
  });
});
