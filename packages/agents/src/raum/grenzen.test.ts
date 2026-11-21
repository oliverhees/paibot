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
import {
  type AuftragsFakten,
  type GrenzMessung,
  messeAuftragsGrenzen,
  STANDARD_AUFTRAGS_GRENZEN,
} from "./grenzen";

const OK: AuftragsFakten = { tiefe: 1, anzahl: 3, tokens: 1_000, alterSekunden: 60 };
const NAMEN = ["tiefe", "anzahl", "budget", "zeit"] as const;
const ueber = (f: AuftragsFakten, g = STANDARD_AUFTRAGS_GRENZEN) => {
  const m = messeAuftragsGrenzen(f, g);
  return NAMEN.filter((n) => m[n].ueberschreitet);
};
const fehlend = (m: GrenzMessung) => NAMEN.filter((n) => m[n].fehlt);

describe("Messwerte zu den Grenzen je Auftrag", () => {
  it("Standardwerte", () => {
    expect(STANDARD_AUFTRAGS_GRENZEN).toEqual({
      maxTiefe: 3,
      maxAnzahl: 20,
      maxTokens: 200_000,
      maxMinuten: 30,
    });
  });

  it("liefert Wert und Grenze je Messwert und entscheidet nichts", () => {
    const m = messeAuftragsGrenzen(OK);
    expect(m).toEqual({
      grenzenGueltig: true,
      tiefe: { wert: 1, grenze: 3, fehlt: false, ueberschreitet: false },
      anzahl: { wert: 3, grenze: 20, fehlt: false, ueberschreitet: false },
      budget: { wert: 1_000, grenze: 200_000, fehlt: false, ueberschreitet: false },
      zeit: { wert: 60, grenze: 1_800, fehlt: false, ueberschreitet: false },
    });
    // nur Fakten: kein Entscheidungsfeld
    expect(Object.keys(m).sort()).toEqual(["anzahl", "budget", "grenzenGueltig", "tiefe", "zeit"]);
  });

  it.each([
    ["Tiefe 3 liegt auf der Grenze", { tiefe: 3 }, []],
    ["Tiefe 4 liegt darüber", { tiefe: 4 }, ["tiefe"]],
    ["20 Aufträge liegen auf der Grenze", { anzahl: 20 }, []],
    ["der 21. Auftrag liegt darüber", { anzahl: 21 }, ["anzahl"]],
    ["199 999 Token sind unter der Grenze", { tokens: 199_999 }, []],
    ["200 000 Token haben die Grenze erreicht", { tokens: 200_000 }, ["budget"]],
    ["29:59 Minuten sind unter der Grenze", { alterSekunden: 1_799 }, []],
    ["30 Minuten haben die Grenze erreicht", { alterSekunden: 1_800 }, ["zeit"]],
  ] as [string, Partial<AuftragsFakten>, string[]][])("%s", (_name, teil, erwartet) => {
    expect(ueber({ ...OK, ...teil })).toEqual(erwartet);
  });

  it("meldet mehrere Überschreitungen zusammen, mit Wert und Grenze", () => {
    const m = messeAuftragsGrenzen({ tiefe: 9, anzahl: 99, tokens: 5e6, alterSekunden: 1e6 });
    expect(NAMEN.filter((n) => m[n].ueberschreitet)).toEqual([...NAMEN]);
    expect(m.budget).toEqual({ wert: 5e6, grenze: 200_000, fehlt: false, ueberschreitet: true });
  });

  it("jeder fehlende Fakt ist als fehlend gemeldet", () => {
    expect(fehlend(messeAuftragsGrenzen({}))).toEqual([...NAMEN]);
    expect(fehlend(messeAuftragsGrenzen({ ...OK, tokens: undefined }))).toEqual(["budget"]);
    expect(fehlend(messeAuftragsGrenzen({ ...OK, alterSekunden: undefined }))).toEqual(["zeit"]);
    expect(messeAuftragsGrenzen({}).tiefe).toEqual({
      wert: null,
      grenze: 3,
      fehlt: true,
      ueberschreitet: false,
    });
  });

  it("unbrauchbare Zahlen zählen als fehlend", () => {
    for (const schlecht of [Number.NaN, Number.POSITIVE_INFINITY, -1, "5" as unknown as number]) {
      expect(fehlend(messeAuftragsGrenzen({ ...OK, tokens: schlecht }))).toEqual(["budget"]);
    }
    expect(fehlend(messeAuftragsGrenzen({ ...OK, tiefe: 1.5 }))).toEqual(["tiefe"]);
    expect(fehlend(messeAuftragsGrenzen({ ...OK, anzahl: -2 }))).toEqual(["anzahl"]);
  });

  it("eigene Grenzen gelten; Grenzen außerhalb des Bereichs werfen nicht, sie sind ungültig gemeldet", () => {
    const g = { maxTiefe: 1, maxAnzahl: 2, maxTokens: 1_000, maxMinuten: 1 };
    expect(ueber({ tiefe: 1, anzahl: 2, tokens: 999, alterSekunden: 59 }, g)).toEqual([]);
    expect(ueber({ tiefe: 2, anzahl: 3, tokens: 1_000, alterSekunden: 60 }, g)).toHaveLength(4);
    expect(messeAuftragsGrenzen(OK, g).grenzenGueltig).toBe(true);
    for (const falsch of [
      { ...g, maxTiefe: 0 },
      { ...g, maxTiefe: 9 },
      { ...g, maxAnzahl: 101 },
      { ...g, maxTokens: 999 },
      { ...g, maxTokens: 2_000_001 },
      { ...g, maxMinuten: 241 },
      { ...g, maxMinuten: 0.5 },
    ]) {
      expect(messeAuftragsGrenzen(OK, falsch).grenzenGueltig).toBe(false);
    }
  });
});
