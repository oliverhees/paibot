/**
 * PaiBot – Tests: Die Nummern des Tors (Regeln, Grenzen, Vorbedingungen, Deckel) sind eindeutig,
 * und keine liegt auf einer Nummer, die schon anders vergeben ist oder nie vergeben wird.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { describe, expect, it } from "vitest";
import {
  ACTIVE_STANDARD_RULES,
  CAPS,
  LIMITS_BY_ID,
  PRECONDITIONS,
  STANDARD_RULE_IDS,
  STANDARD_RULE_VERSIONS,
  UNSTORED_STANDARD_RULE_VERSIONS,
} from "./gate";
import { LIMITS_BY_ID_4, PRECONDITIONS_4 } from "./tor-fassung-4";
import { CAPS_5, LIMITS_BY_ID_5, PRECONDITIONS_5, STANDARD_RULES_5 } from "./tor-fassung-5";

function bereich(prefix: string, von: number, bis: number, stellen: number): string[] {
  return Array.from(
    { length: bis - von + 1 },
    (_, i) => `${prefix}-${String(von + i).padStart(stellen, "0")}`,
  );
}

/** Nummern, die schon für etwas anderes vergeben sind. */
const VERGEBEN = [
  ...bereich("V", 15, 18, 2),
  ...bereich("V", 20, 24, 2),
  "V-26",
  "V-32",
  "V-33",
  "V-34",
  "V-35",
  "V-36",
  "G-14",
  ...bereich("G", 19, 31, 2),
  "G-35",
  "G-36",
  "G-37",
  "R-011",
  "R-013",
];

/** Nummern, die Fassung 4 braucht (sie stehen seit dem Inkraftsetzen in den lebenden Listen). */
const FASSUNG_4 = [...Object.keys(LIMITS_BY_ID_4), ...Object.keys(PRECONDITIONS_4)];

/** Nummern, die nie vergeben werden. */
const NIE_VERGEBEN = ["R-012"];

const REGELN = [
  ...new Set([
    ...STANDARD_RULE_IDS,
    ...STANDARD_RULE_VERSIONS.map((rule) => rule.id),
    ...UNSTORED_STANDARD_RULE_VERSIONS.map((rule) => rule.id),
    ...ACTIVE_STANDARD_RULES.map((rule) => rule.id),
  ]),
];

const ALLE = [
  ...Object.keys(LIMITS_BY_ID),
  ...Object.keys(PRECONDITIONS),
  ...Object.keys(CAPS),
  ...REGELN,
];

describe("Nummern des Tors", () => {
  it("jede Nummer kommt je Art genau einmal vor und hat die feste Form", () => {
    for (const liste of [
      Object.keys(LIMITS_BY_ID),
      Object.keys(PRECONDITIONS),
      Object.keys(CAPS),
    ]) {
      expect(new Set(liste).size).toBe(liste.length);
    }
    expect(new Set(ALLE).size).toBe(ALLE.length);
    for (const id of Object.keys(LIMITS_BY_ID)) expect(id).toMatch(/^G-\d{2}$/);
    for (const id of Object.keys(PRECONDITIONS)) expect(id).toMatch(/^V-\d{2}$/);
    for (const id of Object.keys(CAPS)) expect(id).toMatch(/^D-\d{2}$/);
    for (const id of REGELN) expect(id).toMatch(/^R-\d{3}$/);
  });

  it("keine Nummer liegt auf einer schon vergebenen oder nie vergebenen", () => {
    for (const id of ALLE) {
      expect(VERGEBEN, id).not.toContain(id);
      expect(NIE_VERGEBEN, id).not.toContain(id);
    }
  });

  it("die Nummern dieser Fassung", () => {
    expect(Object.keys(LIMITS_BY_ID)).toEqual([
      ...bereich("G", 1, 5, 2),
      ...bereich("G", 16, 18, 2),
      "G-06",
      "G-07",
      "G-08",
      "G-40",
      "G-15",
      "G-32",
      "G-33",
      "G-34",
      ...bereich("G", 9, 13, 2),
      "G-38",
      "G-39",
      ...bereich("G", 41, 46, 2),
    ]);
    expect(Object.keys(PRECONDITIONS)).toEqual([
      ...bereich("V", 1, 14, 2),
      "V-19",
      "V-38",
      "V-25",
      "V-27",
      "V-28",
      "V-29",
      "V-30",
      "V-31",
      "V-37",
      "V-42",
      "V-43",
      "V-44",
      ...bereich("V", 39, 41, 2),
    ]);
    expect(Object.keys(CAPS)).toEqual(["D-01", "D-02"]);
    expect(REGELN.sort()).toEqual(
      [...bereich("R", 1, 10, 3), "R-014", ...bereich("R", 15, 19, 3), "R-999"].sort(),
    );
  });

  it("Fassung 4: ihre Nummern sind weder vergeben noch doppelt und stehen in den lebenden Listen", () => {
    expect(new Set(FASSUNG_4).size).toBe(FASSUNG_4.length);
    for (const id of FASSUNG_4) {
      expect(VERGEBEN, id).not.toContain(id);
      expect(NIE_VERGEBEN, id).not.toContain(id);
      expect(ALLE, id).toContain(id);
    }
    expect(Object.keys(LIMITS_BY_ID_4)).toEqual(["G-15", "G-32", "G-33", "G-34"]);
    expect(Object.keys(PRECONDITIONS_4)).toEqual([
      "V-25",
      "V-27",
      "V-28",
      "V-29",
      "V-30",
      "V-31",
      "V-37",
      "V-42",
      "V-43",
      "V-44",
    ]);
  });

  it("Fassung 5: genau ihre Nummern, weder vergeben noch doppelt, und in den lebenden Listen", () => {
    const fassung5 = [
      ...Object.keys(LIMITS_BY_ID_5),
      ...Object.keys(PRECONDITIONS_5),
      ...CAPS_5.map((cap) => cap.id),
      ...STANDARD_RULES_5.map((rule) => rule.id),
    ];
    expect(new Set(fassung5).size).toBe(fassung5.length);
    expect(Object.keys(LIMITS_BY_ID_5)).toEqual([
      ...bereich("G", 9, 13, 2),
      "G-38",
      "G-39",
      ...bereich("G", 41, 46, 2),
    ]);
    expect(Object.keys(PRECONDITIONS_5)).toEqual(bereich("V", 39, 41, 2));
    expect(CAPS_5.map((cap) => cap.id)).toEqual(["D-02"]);
    expect(STANDARD_RULES_5.map((rule) => rule.id)).toEqual(["R-009", ...bereich("R", 15, 19, 3)]);
    for (const id of fassung5) {
      expect(NIE_VERGEBEN, id).not.toContain(id);
      expect(VERGEBEN, id).not.toContain(id);
      expect(ALLE, id).toContain(id);
    }
    // G-14 bleibt für später reserviert und gehört nicht zu Fassung 5.
    expect(fassung5).not.toContain("G-14");
    expect(VERGEBEN).toContain("G-14");
  });
});
