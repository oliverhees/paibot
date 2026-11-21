/**
 * PaiBot – Tests für die @-Auswahl der Bots (reine Funktionen).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { describe, expect, it } from "vitest";
import {
  erwaehnungAmCursor,
  erwaehnungAnhaengen,
  erwaehnungEinsetzen,
  filtereNamen,
  naechsteAuswahl,
} from "./erwaehnung";

describe("erwaehnungAmCursor", () => {
  const faelle: [string, string, number, { start: number; suche: string } | null][] = [
    ["nur @", "@", 1, { start: 0, suche: "" }],
    ["am Anfang mit Suche", "@Ide", 4, { start: 0, suche: "Ide" }],
    ["nach Leerzeichen", "Bitte @Len", 10, { start: 6, suche: "Len" }],
    ["nach Zeilenumbruch", "Hallo\n@Ent", 10, { start: 6, suche: "Ent" }],
    ["Cursor mitten im Wort schneidet die Suche ab", "@Lektorat", 4, { start: 0, suche: "Lek" }],
    ["kein @", "Hallo Welt", 10, null],
    ["Leerzeichen zwischen @ und Cursor beendet die Suche", "@Ideen und", 10, null],
    ["E-Mail-Adresse ist keine Erwähnung", "schreib an max@beispiel.de", 26, null],
    ["Cursor vor dem @", "Hallo @Ideen", 3, null],
    ["Cursor außerhalb des Textes wird begrenzt", "@Id", 99, { start: 0, suche: "Id" }],
    ["leerer Text", "", 0, null],
  ];
  for (const [name, text, cursor, erwartet] of faelle) {
    it(name, () => {
      expect(erwaehnungAmCursor(text, cursor)).toEqual(erwartet);
    });
  }
});

describe("filtereNamen", () => {
  const bots = [{ name: "Entwurf" }, { name: "Ideen" }, { name: "Lektorat" }, { name: "Pai" }];

  it("ohne Suche kommen alle in Reihenfolge", () => {
    expect(filtereNamen(bots, "").map((b) => b.name)).toEqual([
      "Entwurf",
      "Ideen",
      "Lektorat",
      "Pai",
    ]);
  });

  it("Namen, die so beginnen, stehen vor denen, die es nur enthalten", () => {
    const mehr = [{ name: "Alte Idee" }, { name: "Ideen" }, { name: "Video" }];
    expect(filtereNamen(mehr, "id").map((b) => b.name)).toEqual(["Ideen", "Alte Idee", "Video"]);
  });

  it("ignoriert Groß- und Kleinschreibung und Akzente", () => {
    expect(filtereNamen([{ name: "Éclair" }, { name: "Pai" }], "ec").map((b) => b.name)).toEqual([
      "Éclair",
    ]);
    expect(filtereNamen(bots, "LEKT").map((b) => b.name)).toEqual(["Lektorat"]);
  });

  it("findet nichts, wenn nichts passt, und verändert die Liste nicht", () => {
    const kopie = [...bots];
    expect(filtereNamen(bots, "xyz")).toEqual([]);
    expect(bots).toEqual(kopie);
  });
});

describe("erwaehnungEinsetzen", () => {
  it("ersetzt die angefangene Erwähnung und setzt den Cursor dahinter", () => {
    const r = erwaehnungEinsetzen("Bitte @Le prüfen", { start: 6, suche: "Le" }, 9, "Lektorat");
    expect(r.text).toBe("Bitte @Lektorat prüfen");
    expect(r.cursor).toBe("Bitte @Lektorat ".length);
  });

  it("setzt kein doppeltes Leerzeichen, wenn schon eins folgt", () => {
    const r = erwaehnungEinsetzen("@Id und mehr", { start: 0, suche: "Id" }, 3, "Ideen");
    expect(r.text).toBe("@Ideen und mehr");
  });

  it("am Textende bleibt ein Leerzeichen zum Weiterschreiben", () => {
    const r = erwaehnungEinsetzen("@", { start: 0, suche: "" }, 1, "Pai");
    expect(r).toEqual({ text: "@Pai ", cursor: 5 });
  });

  it("Gegenprobe: Text vor der Erwähnung bleibt unberührt", () => {
    const r = erwaehnungEinsetzen("Hallo Welt @E", { start: 11, suche: "E" }, 13, "Entwurf");
    expect(r.text.startsWith("Hallo Welt ")).toBe(true);
  });
});

describe("naechsteAuswahl", () => {
  it("überspringt gesperrte Einträge und springt am Ende herum", () => {
    const g = [false, true, false];
    expect(naechsteAuswahl(g, -1, 1)).toBe(0);
    expect(naechsteAuswahl(g, 0, 1)).toBe(2);
    expect(naechsteAuswahl(g, 2, 1)).toBe(0);
    expect(naechsteAuswahl(g, 0, -1)).toBe(2);
    expect(naechsteAuswahl(g, -1, -1)).toBe(2);
  });

  it("liefert -1, wenn nichts wählbar ist", () => {
    expect(naechsteAuswahl([], -1, 1)).toBe(-1);
    expect(naechsteAuswahl([true, true], 0, 1)).toBe(-1);
  });
});

describe("erwaehnungAnhaengen", () => {
  it("setzt ein Leerzeichen davor, wenn der Text nicht damit endet", () => {
    expect(erwaehnungAnhaengen("", "Ida")).toBe("@Ida ");
    expect(erwaehnungAnhaengen("Hallo", "Ida")).toBe("Hallo @Ida ");
    expect(erwaehnungAnhaengen("Hallo ", "Ida")).toBe("Hallo @Ida ");
  });
});
