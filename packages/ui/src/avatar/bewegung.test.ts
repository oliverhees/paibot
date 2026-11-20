/**
 * PaiBot – Tests der Bewegungen der Avatare.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { describe, expect, it } from "vitest";
import { blickZumZeiger, planeBlick, planeBlinzeln, planeLaune } from "./bewegung";

/** Liefert die Werte nacheinander, dann immer den letzten. */
const folge = (...werte: number[]) => {
  let i = 0;
  return () => werte[Math.min(i++, werte.length - 1)] ?? 0;
};

describe("Bewegung der Avatare", () => {
  it("blinzelt einfach oder doppelt und wartet 1600 bis 6000 ms", () => {
    expect(planeBlinzeln(folge(0.9, 0))).toEqual({ dauer: 130, naechstesNach: 1600 });
    const doppelt = planeBlinzeln(folge(0.1, 0.999999));
    expect(doppelt.zweites).toEqual({ nach: 260, dauer: 120 });
    expect(doppelt.naechstesNach).toBeCloseTo(6000, 0);
  });

  it("schaut manchmal geradeaus und sonst in den Grenzen", () => {
    expect(planeBlick(folge(0.1, 0.2, 0))).toEqual({ x: 0, y: 0, naechsterNach: 1100 });
    const b = planeBlick(folge(0.5, 0, 0.5, 0, 0));
    expect(b.x).toBeCloseTo(-1.9);
    expect(b.y).toBeCloseTo(-1.3);
  });

  it("wählt die Laune nach den Schwellen", () => {
    expect(planeLaune(folge(0.1, 0)).art).toBe("staunen");
    expect(planeLaune(folge(0.5, 0))).toMatchObject({ art: "huepfen", dauer: 620 });
    expect(planeLaune(folge(0.7, 0))).toMatchObject({ art: "wackeln", dauer: 700 });
    expect(planeLaune(folge(0.9, 0)).art).toBe("reden");
    expect(planeLaune(folge(0.9, 0, 0)).naechsteNach).toBe(2600);
  });

  it("folgt dem Zeiger nur in der Nähe", () => {
    expect(blickZumZeiger({ x: 0, y: 0 }, { x: 10, y: 0 }, 32)).toEqual({ x: 2, y: 0 });
    expect(blickZumZeiger({ x: 0, y: 0 }, { x: 0, y: 30 }, 32)).toEqual({ x: 0, y: 1.5 });
    expect(blickZumZeiger({ x: 0, y: 0 }, { x: 71, y: 0 }, 32)).toBeNull();
    // Großer Avatar: Nähe wächst mit der Breite (100 × 1.4 = 140).
    expect(blickZumZeiger({ x: 0, y: 0 }, { x: 120, y: 0 }, 100)).not.toBeNull();
  });
});
