/**
 * PaiBot – Tests für IDs: Format, Präfixe, Sortierung und Eindeutigkeit.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { describe, expect, it, vi } from "vitest";
import { ID_KINDS, ID_LENGTH, ID_PATTERN, ID_PREFIX, idSchema, isId, newId, parseId } from "./id";

const EXAMPLE = "unt_06f8k2m9qz3w7x1c4b5n8p0r2t";
const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

/** Liest die 48 Bit Zeit aus den ersten zehn Zeichen nach dem Präfix. */
function timeOf(id: string): number {
  let ms = 0;
  for (const char of id.slice(4, 14)) ms = ms * 32 + ALPHABET.indexOf(char);
  return ms;
}

describe("newId", () => {
  it("erzeugt für jede Art das vorgegebene Format", () => {
    for (const kind of ID_KINDS) {
      const id = newId(kind);
      expect(id).toHaveLength(ID_LENGTH);
      expect(id.startsWith(`${ID_PREFIX[kind]}_`)).toBe(true);
      expect(id).toMatch(ID_PATTERN);
      expect(isId(kind, id)).toBe(true);
      expect(id[4]).toMatch(/[0-7]/);
    }
  });

  it("kodiert die aktuelle Zeit in Millisekunden", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-11-20T10:00:00.000Z"));
      expect(timeOf(newId("run"))).toBe(Date.parse("2026-11-20T10:00:00.000Z"));
      vi.setSystemTime(0);
      expect(newId("run").slice(4, 14)).toBe("0000000000");
    } finally {
      vi.useRealTimers();
    }
  });

  it("sortiert sich als Text nach der Zeit", () => {
    vi.useFakeTimers();
    try {
      const ids: string[] = [];
      for (const ms of [1, 31, 32, 1_000_000, 1_763_632_800_000, 2 ** 48 - 1]) {
        vi.setSystemTime(ms);
        ids.push(newId("message"));
      }
      expect([...ids].sort()).toEqual(ids);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ist eindeutig, auch in derselben Millisekunde", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-11-20T10:00:00.000Z"));
      const ids = new Set(Array.from({ length: 10_000 }, () => newId("receipt")));
      expect(ids.size).toBe(10_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("nutzt alle Zeichen des Alphabets im Zufallsteil", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) for (const char of newId("bot").slice(14)) seen.add(char);
    expect([...seen].sort().join("")).toBe(ALPHABET);
  });
});

describe("Prüfen von IDs", () => {
  it("nimmt das Beispiel an", () => {
    expect(isId("conversation", EXAMPLE)).toBe(true);
    expect(ID_PATTERN.test(EXAMPLE)).toBe(true);
    expect(idSchema("conversation").parse(EXAMPLE)).toBe(EXAMPLE);
    expect(parseId("conversation", EXAMPLE)).toBe(EXAMPLE);
  });

  it("lehnt falsche Art, falsche Länge und falsche Zeichen ab", () => {
    const bad = [
      EXAMPLE.replace("unt_", "nac_"),
      EXAMPLE.slice(0, -1),
      `${EXAMPLE}0`,
      EXAMPLE.replace("06f", "86f"),
      EXAMPLE.replace("k2m", "i2m"),
      EXAMPLE.replace("k2m", "l2m"),
      EXAMPLE.replace("k2m", "o2m"),
      EXAMPLE.replace("k2m", "u2m"),
      EXAMPLE.toUpperCase(),
      ` ${EXAMPLE}`,
      "",
    ];
    for (const value of bad) {
      expect(isId("conversation", value)).toBe(false);
      expect(idSchema("conversation").safeParse(value).success).toBe(false);
    }
    expect(isId("conversation", 42)).toBe(false);
    expect(() => parseId("message", EXAMPLE)).toThrow(TypeError);
  });

  it("kennt genau die vorgegebenen Präfixe", () => {
    expect(ID_PATTERN.source).toBe(
      "^(unt|nac|lau|bot|anb|mod|bes|blg|akt|sch|ins|reg|ger|app|wzg|tea|ent|auf)_[0-7][0-9a-hjkmnp-tv-z]{25}$",
    );
  });
});
