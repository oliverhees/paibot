/**
 * PaiBot – Tests des weichen Rands beim Scrollen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { describe, expect, it } from "vitest";
import { scrollRand, scrollt } from "./scrollRand";

describe("weicher Rand beim Scrollen", () => {
  it("zeigt keinen Rand, wenn alles hineinpasst", () => {
    expect(scrollRand({ position: 0, inhalt: 300, sichtbar: 300 })).toBe("keiner");
    expect(scrollRand({ position: 0, inhalt: 300.6, sichtbar: 300 })).toBe("keiner");
    expect(scrollt({ position: 0, inhalt: 300, sichtbar: 300 })).toBe(false);
  });

  it("zeigt den Rand dort, wo Inhalt weiterläuft", () => {
    expect(scrollRand({ position: 0, inhalt: 900, sichtbar: 300 })).toBe("ende");
    expect(scrollRand({ position: 250, inhalt: 900, sichtbar: 300 })).toBe("beide");
    expect(scrollRand({ position: 600, inhalt: 900, sichtbar: 300 })).toBe("start");
    expect(scrollRand({ position: 599.5, inhalt: 900, sichtbar: 300 })).toBe("start");
    expect(scrollt({ position: 0, inhalt: 900, sichtbar: 300 })).toBe(true);
  });

  it("versteht negative Positionen (Schreibrichtung von rechts)", () => {
    expect(scrollRand({ position: -600, inhalt: 900, sichtbar: 300 })).toBe("start");
  });
});
