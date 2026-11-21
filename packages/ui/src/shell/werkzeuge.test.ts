/**
 * PaiBot – Tests: Werkzeuge der Seitenleiste ein- und ausklappen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { describe, expect, it } from "vitest";
import { leseEingeklappt, merkeEingeklappt, WERKZEUGE_SCHLUESSEL } from "./werkzeuge";

function speicher() {
  const werte = new Map<string, string>();
  return {
    werte,
    getItem: (k: string) => werte.get(k) ?? null,
    setItem: (k: string, v: string) => void werte.set(k, v),
  };
}

describe("Werkzeuge einklappen", () => {
  it("ist ohne gemerkten Zustand offen und merkt sich Ein- und Ausklappen", () => {
    const s = speicher();
    expect(leseEingeklappt(s)).toBe(false);
    merkeEingeklappt(true, s);
    expect(s.werte.get(WERKZEUGE_SCHLUESSEL)).toBe("1");
    expect(leseEingeklappt(s)).toBe(true);
    merkeEingeklappt(false, s);
    expect(leseEingeklappt(s)).toBe(false);
  });

  it("bleibt offen und still, wenn der Speicher fehlt oder wirft", () => {
    const kaputt = {
      getItem: () => {
        throw new Error("gesperrt");
      },
      setItem: () => {
        throw new Error("voll");
      },
    };
    expect(leseEingeklappt(kaputt)).toBe(false);
    expect(() => merkeEingeklappt(true, kaputt)).not.toThrow();
    expect(leseEingeklappt(undefined)).toBe(false);
  });
});
