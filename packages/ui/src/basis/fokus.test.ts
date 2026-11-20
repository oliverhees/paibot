/**
 * PaiBot – Tests von Fokus-Falle und Pfeiltasten.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { describe, expect, it } from "vitest";
import { menueIndex, naechstesZiel } from "./fokus";

describe("Fokus-Falle", () => {
  it("springt am Ende zum Anfang und umgekehrt", () => {
    expect(naechstesZiel(3, 2, false)).toBe(0);
    expect(naechstesZiel(3, 0, true)).toBe(2);
  });

  it("lässt den Browser innerhalb des Bereichs selbst weitergehen", () => {
    expect(naechstesZiel(3, 1, false)).toBeNull();
    expect(naechstesZiel(3, 1, true)).toBeNull();
  });

  it("holt den Fokus zurück, wenn er draußen ist", () => {
    expect(naechstesZiel(3, -1, false)).toBe(0);
    expect(naechstesZiel(3, -1, true)).toBe(2);
    expect(naechstesZiel(0, -1, false)).toBeNull();
  });
});

describe("Pfeiltasten in Menü und Reitern", () => {
  it("geht im Kreis und kennt Pos1 und Ende", () => {
    expect(menueIndex("ArrowDown", 3, 2)).toBe(0);
    expect(menueIndex("ArrowUp", 3, 0)).toBe(2);
    expect(menueIndex("ArrowRight", 3, 0)).toBe(1);
    expect(menueIndex("ArrowLeft", 3, 1)).toBe(0);
    expect(menueIndex("Home", 3, 2)).toBe(0);
    expect(menueIndex("End", 3, 0)).toBe(2);
    expect(menueIndex("ArrowDown", 3, -1)).toBe(0);
  });

  it("ignoriert andere Tasten und leere Listen", () => {
    expect(menueIndex("a", 3, 0)).toBeNull();
    expect(menueIndex("ArrowDown", 0, 0)).toBeNull();
  });
});
