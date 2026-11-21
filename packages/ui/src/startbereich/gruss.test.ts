/**
 * PaiBot – Tests des Tageszeit-Grußes: Grenzen, Zeitzonen, ungültige Eingaben.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { describe, expect, it } from "vitest";
import { stundeIn, tageszeitFuerStunde, tageszeitIn } from "./gruss";

describe("Gruß nach Tageszeit", () => {
  it("5 bis 10 Uhr ist Morgen, 11 bis 16 Tag, 17 bis 22 Abend", () => {
    const erwartet: Record<number, string> = {
      4: "spaet",
      5: "morgen",
      10: "morgen",
      11: "tag",
      16: "tag",
      17: "abend",
      22: "abend",
      23: "spaet",
      0: "spaet",
    };
    for (const [stunde, art] of Object.entries(erwartet)) {
      expect(tageszeitFuerStunde(Number(stunde)), `${stunde} Uhr`).toBe(art);
    }
  });

  it("jede der 24 Stunden hat genau einen Gruß", () => {
    const gezaehlt = { morgen: 0, tag: 0, abend: 0, spaet: 0 };
    for (let h = 0; h < 24; h++) gezaehlt[tageszeitFuerStunde(h)]++;
    expect(gezaehlt).toEqual({ morgen: 6, tag: 6, abend: 6, spaet: 6 });
  });

  it("rechnet die Stunde in der eingestellten Zeitzone (Winter, UTC+1)", () => {
    const jetzt = new Date("2026-11-21T09:59:00Z"); // 10:59 in Berlin
    expect(stundeIn(jetzt, "Europe/Berlin")).toBe(10);
    expect(tageszeitIn(jetzt, "Europe/Berlin")).toBe("morgen");
    expect(tageszeitIn(new Date("2026-11-21T10:00:00Z"), "Europe/Berlin")).toBe("tag");
  });

  it("rechnet die Sommerzeit (UTC+2) mit", () => {
    expect(tageszeitIn(new Date("2026-07-01T08:59:00Z"), "Europe/Berlin")).toBe("morgen");
    expect(tageszeitIn(new Date("2026-07-01T09:00:00Z"), "Europe/Berlin")).toBe("tag");
  });

  it("derselbe Zeitpunkt ergibt in anderen Zeitzonen einen anderen Gruß", () => {
    const jetzt = new Date("2026-11-21T20:30:00Z");
    expect(tageszeitIn(jetzt, "Europe/Berlin")).toBe("abend"); // 21:30
    expect(tageszeitIn(jetzt, "Asia/Tokyo")).toBe("morgen"); // 05:30 am nächsten Tag
    expect(tageszeitIn(jetzt, "America/New_York")).toBe("tag"); // 15:30
  });

  it("Mitternacht und 4:59 Uhr sind „später Stunde“, 5:00 Uhr ist Morgen", () => {
    expect(tageszeitIn(new Date("2026-11-21T23:00:00Z"), "UTC")).toBe("spaet");
    expect(tageszeitIn(new Date("2026-11-21T00:00:00Z"), "UTC")).toBe("spaet");
    expect(tageszeitIn(new Date("2026-11-21T04:59:00Z"), "UTC")).toBe("spaet");
    expect(tageszeitIn(new Date("2026-11-21T05:00:00Z"), "UTC")).toBe("morgen");
  });

  it("nimmt bei einer unbekannten Zeitzone Europe/Berlin", () => {
    const jetzt = new Date("2026-11-21T18:00:00Z"); // 19 Uhr in Berlin
    expect(tageszeitIn(jetzt, "Nirgendwo/Stadt")).toBe("abend");
  });

  it("liefert bei einem ungültigen Datum keinen Gruß statt eines erfundenen", () => {
    expect(tageszeitIn(new Date("kein Datum"), "Europe/Berlin")).toBeUndefined();
  });
});
