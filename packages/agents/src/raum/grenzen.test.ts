/**
 * PaiBot – Grenzen je Auftrag im Teamchat (Tests)
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { describe, expect, it } from "vitest";
import { type AuftragsFakten, pruefeAuftragGrenzen, STANDARD_AUFTRAGS_GRENZEN } from "./grenzen";

const OK: AuftragsFakten = { tiefe: 1, anzahl: 3, tokens: 1_000, alterSekunden: 60 };
const verletzt = (f: AuftragsFakten, g = STANDARD_AUFTRAGS_GRENZEN) => {
  const r = pruefeAuftragGrenzen(f, g);
  return r.ok ? [] : r.verletzt.map((v) => `${v.grenze}:${v.grund}`);
};

describe("Grenzen je Auftrag", () => {
  it("Standardwerte", () => {
    expect(STANDARD_AUFTRAGS_GRENZEN).toEqual({
      maxTiefe: 3,
      maxAnzahl: 20,
      maxTokens: 200_000,
      maxMinuten: 30,
    });
  });

  it("alles im Rahmen ist ok", () => {
    expect(pruefeAuftragGrenzen(OK)).toEqual({ ok: true });
  });

  it.each([
    ["Tiefe 3 ist erlaubt", { tiefe: 3 }, []],
    ["Tiefe 4 ist zu tief", { tiefe: 4 }, ["tiefe:ueberschritten"]],
    ["20 Aufträge sind erlaubt", { anzahl: 20 }, []],
    ["der 21. Auftrag ist zu viel", { anzahl: 21 }, ["anzahl:ueberschritten"]],
    ["199 999 Token sind ok", { tokens: 199_999 }, []],
    ["200 000 Token sind verbraucht", { tokens: 200_000 }, ["budget:ueberschritten"]],
    ["29:59 Minuten sind ok", { alterSekunden: 1_799 }, []],
    ["30 Minuten sind abgelaufen", { alterSekunden: 1_800 }, ["zeit:ueberschritten"]],
  ] as [string, Partial<AuftragsFakten>, string[]][])("%s", (_name, teil, erwartet) => {
    expect(verletzt({ ...OK, ...teil })).toEqual(erwartet);
  });

  it("meldet mehrere verletzte Grenzen zusammen, mit Wert und Limit", () => {
    const r = pruefeAuftragGrenzen({ tiefe: 9, anzahl: 99, tokens: 5e6, alterSekunden: 1e6 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.verletzt.map((v) => v.grenze)).toEqual(["tiefe", "anzahl", "budget", "zeit"]);
      expect(r.verletzt[2]).toEqual({
        grenze: "budget",
        grund: "ueberschritten",
        wert: 5e6,
        limit: 200_000,
      });
    }
  });

  it("jeder fehlende Fakt ist verletzt, nicht übersehen", () => {
    expect(verletzt({})).toEqual([
      "tiefe:fakt_fehlt",
      "anzahl:fakt_fehlt",
      "budget:fakt_fehlt",
      "zeit:fakt_fehlt",
    ]);
    expect(verletzt({ ...OK, tokens: undefined })).toEqual(["budget:fakt_fehlt"]);
    expect(verletzt({ ...OK, alterSekunden: undefined })).toEqual(["zeit:fakt_fehlt"]);
  });

  it("unbrauchbare Zahlen zählen wie fehlende", () => {
    for (const schlecht of [Number.NaN, Number.POSITIVE_INFINITY, -1, "5" as unknown as number]) {
      expect(verletzt({ ...OK, tokens: schlecht })).toEqual(["budget:fakt_fehlt"]);
    }
    expect(verletzt({ ...OK, tiefe: 1.5 })).toEqual(["tiefe:fakt_fehlt"]);
    expect(verletzt({ ...OK, anzahl: -2 })).toEqual(["anzahl:fakt_fehlt"]);
  });

  it("eigene Grenzen gelten, außerhalb des Bereichs ist es ein Fehler", () => {
    const g = { maxTiefe: 1, maxAnzahl: 2, maxTokens: 1_000, maxMinuten: 1 };
    expect(verletzt({ tiefe: 1, anzahl: 2, tokens: 999, alterSekunden: 59 }, g)).toEqual([]);
    expect(verletzt({ tiefe: 2, anzahl: 3, tokens: 1_000, alterSekunden: 60 }, g)).toHaveLength(4);
    for (const falsch of [
      { ...g, maxTiefe: 0 },
      { ...g, maxTiefe: 9 },
      { ...g, maxAnzahl: 101 },
      { ...g, maxTokens: 999 },
      { ...g, maxTokens: 2_000_001 },
      { ...g, maxMinuten: 241 },
      { ...g, maxMinuten: 0.5 },
    ]) {
      expect(() => pruefeAuftragGrenzen(OK, falsch)).toThrow(RangeError);
    }
  });
});
