/**
 * PaiBot – Namen im Teamchat: Vergleichsform und Konflikte (Tests)
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { describe, expect, it } from "vitest";
import { aehnlichkeitsForm, namensKonflikte, vergleichsName } from "./namen";

const bots = (...namen: string[]) => namen.map((name, i) => ({ id: `b${i}`, name }));

describe("vergleichsName", () => {
  it("gleicht Groß-/Kleinschreibung, Voll-Breite-Formen, Nullbreite-Zeichen und Leerraum an", () => {
    expect(vergleichsName("Ideen")).toBe("ideen");
    expect(vergleichsName("ＩＤＥＥＮ")).toBe("ideen");
    expect(vergleichsName("Ide​en")).toBe("ideen");
    expect(vergleichsName("  Team \t Content ")).toBe("team content");
  });

  it("hält andere Schriften auseinander: kyrillisches „е“ ist kein lateinisches „e“", () => {
    expect(vergleichsName("Idеen")).not.toBe(vergleichsName("Ideen"));
    expect(aehnlichkeitsForm("Idеen")).toBe(aehnlichkeitsForm("Ideen"));
  });
});

describe("namensKonflikte", () => {
  it("findet nichts bei verschiedenen Namen", () => {
    expect(namensKonflikte(bots("Redaktion", "Ideen", "Entwurf", "Lektorat"))).toEqual([]);
  });

  it("findet Namen, die sich nur in Groß-/Kleinschreibung unterscheiden", () => {
    expect(namensKonflikte(bots("Ideen", "IDEEN", "Entwurf"))).toEqual([
      { art: "gleich", botIds: ["b0", "b1"] },
    ]);
  });

  it("findet Namen, die sich nur in unsichtbaren Zeichen oder der Unicode-Form unterscheiden", () => {
    expect(namensKonflikte(bots("Ideen", "Ide​en"))).toEqual([
      { art: "gleich", botIds: ["b0", "b1"] },
    ]);
    expect(namensKonflikte(bots("Ideen", "ＩＤＥＥＮ"))).toEqual([
      { art: "gleich", botIds: ["b0", "b1"] },
    ]);
  });

  it("findet ähnlich aussehende Zeichen als „aehnlich“, nicht als „gleich“", () => {
    expect(namensKonflikte(bots("Ideen", "Idеen"))).toEqual([
      { art: "aehnlich", botIds: ["b0", "b1"] },
    ]);
  });

  it("meldet dieselbe Gruppe nicht doppelt", () => {
    const k = namensKonflikte(bots("Ideen", "ideen"));
    expect(k).toHaveLength(1);
    expect(k[0]?.art).toBe("gleich");
  });

  it("meldet jeden Konflikt mit allen beteiligten Bots", () => {
    const k = namensKonflikte(bots("Ideen", "ideen", "IDEEN", "Entwurf"));
    expect(k).toEqual([{ art: "gleich", botIds: ["b0", "b1", "b2"] }]);
  });
});
