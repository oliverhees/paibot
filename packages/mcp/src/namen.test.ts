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

/** Erste Vergabe einer App: noch keine gespeicherte Zuordnung. */
const neu = (app: string, namen: string[], vergeben: ReadonlySet<string> = new Set()) =>
  vergebeModellNamen(app, namen, vergeben, new Map());

describe("Modell-Namen", () => {
  it("bilden <app>__<name> und passen zum Namensmuster", () => {
    const namen = neu("linear", ["list_issues", "Get Issue!"]);
    expect(namen.map((n) => n.modellName)).toEqual(["linear__list_issues", "linear__Get_Issue"]);
    for (const n of namen) expect(n.modellName).toMatch(MODELL_NAME_MUSTER);
  });

  it("geben dem Namen mit Punkt und 128 Zeichen einen gültigen Namen von höchstens 64 Zeichen", () => {
    const lang = `${"a".repeat(60)}.${"b".repeat(67)}`;
    const [eintrag] = neu("app", [lang]);
    expect(eintrag?.modellName.length).toBeLessThanOrEqual(64);
    expect(eintrag?.modellName).toMatch(MODELL_NAME_MUSTER);
    expect(eintrag?.original).toBe(lang);
  });

  it("lösen Kollisionen in einer App mit Zähler und unabhängig von der Reihenfolge der Liste", () => {
    const eins = neu("app", ["a.b", "a-b", "a b", "a_b"]);
    const zwei = neu("app", ["a_b", "a b", "a-b", "a.b"]);
    const tabelle = (liste: typeof eins) =>
      Object.fromEntries(liste.map((n) => [n.original, n.modellName]));
    expect(tabelle(eins)).toEqual(tabelle(zwei));
    expect(new Set(eins.map((n) => n.modellName)).size).toBe(4);
  });

  it("geben zwei Apps mit demselben Werkzeug `search` verschiedene Namen, und `doku_nachschlagen` bleibt dem eingebauten Werkzeug", () => {
    const erste = neu("alpha", ["search", "doku_nachschlagen"]);
    const zweite = neu("beta", ["search"], new Set(erste.map((n) => n.modellName)));
    const alle = [...erste, ...zweite].map((n) => n.modellName);
    expect(new Set(alle).size).toBe(3);
    expect(alle).not.toContain("doku_nachschlagen");
    for (const name of alle) expect(name).toContain("__");
  });

  it("vermeiden Namen, die schon an andere Apps vergeben sind", () => {
    const [eintrag] = neu("app", ["x"], new Set(["app__x"]));
    expect(eintrag?.modellName).toBe("app__x_2");
  });

  it("weisen einen ungültigen oder zu langen Kurznamen ab", () => {
    expect(() => neu("Gross", ["x"])).toThrow(RangeError);
    expect(() => neu("a".repeat(64), ["x"])).toThrow(RangeError);
  });

  it("machen aus einem Namen ohne brauchbare Zeichen einen Ersatznamen", () => {
    expect(bereinigeNamensteil("###")).toBe("werkzeug");
    expect(bereinigeNamensteil("a__b")).toBe("a_b");
  });
});

// Ein bestätigtes Werkzeug behält seinen Namen, auch wenn der Server ein neues hinzufügt.
// Gegenprobe: die bekannte Zuordnung ignorieren (alles frisch berechnen) → `a_b` heißt plötzlich
// `app__a_b_2`.
describe("Modell-Namen bleiben stabil", () => {
  it("ein neues Werkzeug verdrängt kein bekanntes von seinem Namen", () => {
    const vorher = neu("app", ["a_b"]);
    expect(vorher[0]?.modellName).toBe("app__a_b");
    const bekannt = new Map(vorher.map((e) => [e.original, e.modellName]));
    const jetzt = vergebeModellNamen("app", ["a_b", "a.b"], new Set(), bekannt);
    const nach = Object.fromEntries(jetzt.map((e) => [e.original, e.modellName]));
    expect(nach).toEqual({ a_b: "app__a_b", "a.b": "app__a_b_2" });
  });

  it("beim ersten Abruf (leere Zuordnung) bleibt es bei der Vergabe nach Namen", () => {
    const nach = Object.fromEntries(
      neu("app", ["a_b", "a.b"]).map((e) => [e.original, e.modellName]),
    );
    expect(nach).toEqual({ "a.b": "app__a_b", a_b: "app__a_b_2" });
  });
});

// Gegenprobe: nur die Namen der Werkzeuge reservieren, die in der Liste stehen; Konflikte still
// umbenennen; eine fehlende Zuordnung durch eine leere ersetzen → die Fälle werden rot.
describe("Bekannte Namen sind verbindlich", () => {
  it("ein bekannter Name bleibt reserviert, auch wenn sein Werkzeug in der Liste fehlt", () => {
    const bekannt = new Map([["a_b", "app__a_b"]]);
    const [neu] = vergebeModellNamen("app", ["a.b"], new Set(), bekannt);
    expect(neu?.modellName).not.toBe("app__a_b");
    expect(neu?.modellName).toBe("app__a_b_2");
  });

  it("ein bekannter Name, der schon einer anderen App gehört, wird abgewiesen statt still umbenannt", () => {
    const bekannt = new Map([["a_b", "app__a_b"]]);
    expect(() => vergebeModellNamen("app", ["a_b"], new Set(["app__a_b"]), bekannt)).toThrow(
      RangeError,
    );
  });

  it("zwei Werkzeuge mit demselben bekannten Namen, ein Name einer anderen App oder ein Name außerhalb des Musters: abgewiesen", () => {
    const doppelt = new Map([
      ["x", "app__y"],
      ["z", "app__y"],
    ]);
    expect(() => vergebeModellNamen("app", ["x", "z"], new Set(), doppelt)).toThrow(RangeError);
    expect(() =>
      vergebeModellNamen("app", ["x"], new Set(), new Map([["x", "andere__x"]])),
    ).toThrow(RangeError);
    expect(() => vergebeModellNamen("app", ["x"], new Set(), new Map([["x", "app__x!"]]))).toThrow(
      RangeError,
    );
  });

  it("ohne die gespeicherte Zuordnung gibt es keine Vergabe: Sie ist Pflicht, auch für JavaScript-Aufrufer", () => {
    expect(() => vergebeModellNamen("app", ["x"], new Set(), undefined as never)).toThrow(
      TypeError,
    );
  });
});
