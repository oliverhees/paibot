/**
 * PaiBot – Tests der Anfänge: Texte aus dem Katalog, nur reiner Text-Chat.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { t } from "@paibot/shared/texte";
import { describe, expect, it } from "vitest";
import { anfaengeBegruessung, anfaengeStartbrett, anfaengeStille } from "./anfaenge";

const ALLE = [
  ...anfaengeBegruessung().flatMap((g) => g.anfaenge),
  ...anfaengeStartbrett().flatMap((g) => g.anfaenge),
  ...anfaengeStille(),
];

describe("Anfänge", () => {
  it("die Fassungen haben die vorgesehene Zahl an Anfängen", () => {
    expect(anfaengeBegruessung().map((g) => [g.gruppe, g.anfaenge.length])).toEqual([
      ["schreiben", 2],
      ["planen", 2],
      ["verstehen", 2],
    ]);
    expect(anfaengeStartbrett().map((g) => [g.gruppe, g.anfaenge.length])).toEqual([
      ["schreiben", 3],
      ["planen", 2],
      ["verstehen", 2],
    ]);
    expect(anfaengeStille()).toHaveLength(4);
  });

  it("jeder Anfang hat Beschriftung und Text; offene enden mit Doppelpunkt und Leerzeichen", () => {
    for (const anfang of ALLE) {
      expect(anfang.label.trim().length, anfang.id).toBeGreaterThan(0);
      expect(anfang.text.trim().length, anfang.id).toBeGreaterThan(0);
      if (anfang.text.endsWith(":") || anfang.text.endsWith(": ")) {
        expect(anfang.text.endsWith(": "), anfang.id).toBe(true);
      }
    }
  });

  it("die Texte sind wörtlich die aus dem Katalog", () => {
    const woche = anfaengeBegruessung()[1]?.anfaenge[0];
    expect(woche?.text).toBe("Hilf mir, meine Woche zu planen. Das steht an: ");
    expect(woche?.text).toBe(t("startbereich.anfang.woche"));
    expect(anfaengeStartbrett()[1]?.anfaenge[1]?.text).toBe(
      "Sortier diese Aufgaben nach Wichtigkeit: ",
    );
  });

  it("verlangt nichts, was ein reiner Text-Chat nicht kann", () => {
    const braucht =
      /datei|anhang|werkzeug|gedächtnis|merk|suche im (web|netz)|internet|datenschleuse|beleg/i;
    for (const anfang of ALLE) expect(braucht.test(anfang.text), anfang.id).toBe(false);
  });
});
