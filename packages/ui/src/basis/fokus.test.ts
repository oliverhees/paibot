/**
 * PaiBot – Tests von Fokus-Falle und Pfeiltasten.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { describe, expect, it, vi } from "vitest";
import { ERSTER_FOKUS, menueIndex, naechstesZiel, startZiel } from "./fokus";

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

describe("Start-Ziel beim Öffnen", () => {
  /** Kleiner Ersatz für ein Element: nur, was `startZiel` braucht. */
  function element(name: string, optionen: { markiert?: boolean; aus?: boolean } = {}) {
    return {
      name,
      markiert: optionen.markiert ?? false,
      matches: (s: string) => s === ":disabled" && (optionen.aus ?? false),
      getClientRects: () => [{}],
    };
  }
  function bereich(kinder: ReturnType<typeof element>[]) {
    return {
      name: "bereich",
      querySelector: (s: string) =>
        s === `[${ERSTER_FOKUS}]` ? (kinder.find((k) => k.markiert) ?? null) : null,
      querySelectorAll: () => kinder,
    } as unknown as HTMLElement;
  }
  const name = (el: HTMLElement) => (el as unknown as { name: string }).name;

  it("nimmt das gekennzeichnete Feld statt des ersten Knopfs (Schließen)", () => {
    vi.stubGlobal("getComputedStyle", () => ({ visibility: "visible" }));
    try {
      const b = bereich([element("schliessen"), element("titel", { markiert: true })]);
      expect(name(startZiel(b))).toBe("titel");
      expect(ERSTER_FOKUS).toBe("data-erster-fokus");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("ohne Markierung (oder gesperrt) das erste, ohne Ziele den Bereich selbst", () => {
    vi.stubGlobal("getComputedStyle", () => ({ visibility: "visible" }));
    try {
      expect(name(startZiel(bereich([element("schliessen"), element("titel")])))).toBe(
        "schliessen",
      );
      const gesperrt = bereich([
        element("schliessen"),
        element("x", { markiert: true, aus: true }),
      ]);
      expect(name(startZiel(gesperrt))).toBe("schliessen");
      expect(name(startZiel(bereich([])))).toBe("bereich");
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
