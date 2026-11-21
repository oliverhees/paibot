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

function bereich(prefix: string, von: number, bis: number, stellen: number): string[] {
  return Array.from(
    { length: bis - von + 1 },
    (_, i) => `${prefix}-${String(von + i).padStart(stellen, "0")}`,
  );
}

/** Nummern, die schon für etwas anderes vergeben sind. */
const VERGEBEN = [
  ...bereich("V", 15, 38, 2),
  ...bereich("G", 6, 15, 2),
  ...bereich("G", 19, 40, 2),
  "D-02",
  "R-011",
  ...bereich("R", 13, 17, 3),
];

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
    ]);
    expect(Object.keys(PRECONDITIONS)).toEqual(bereich("V", 1, 14, 2));
    expect(Object.keys(CAPS)).toEqual(["D-01"]);
    expect(REGELN.sort()).toEqual([...bereich("R", 1, 8, 3), "R-010", "R-999"].sort());
  });
});
