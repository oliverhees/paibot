/**
 * PaiBot – Tests der Gesichts-Tabellen des lebendigen Avatars.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { AVATAR_SHAPES } from "@paibot/shared/objekte";
import { t } from "@paibot/shared/texte";
import { describe, expect, it } from "vitest";
import { FORMEN } from "../avatar/formen";
import {
  ARBEITS_ZUSTAENDE,
  AUSDRUCK_GESICHT,
  AVATAR_AUSDRUECKE,
  AVATAR_LEBENDIG_ZUSTAENDE,
  FORM_GESICHT,
  gesichtFuer,
} from "./daten";

describe("Gesichts-Tabellen", () => {
  it("haben für jede Form genau einen Eintrag, damit eine neue Form nur eine Zeile braucht", () => {
    expect(Object.keys(FORM_GESICHT).sort()).toEqual([...AVATAR_SHAPES].sort());
    expect(Object.keys(FORM_GESICHT).sort()).toEqual(Object.keys(FORMEN).sort());
  });

  it("legen Augen und Mund auf jeder Form in den Rahmen des 40er-Rasters", () => {
    for (const form of AVATAR_SHAPES) {
      const { augen, mund } = FORM_GESICHT[form];
      expect(augen.lx, form).toBeLessThan(20);
      expect(augen.rx, form).toBeGreaterThan(20);
      expect(augen.y, form).toBeLessThan(mund.y);
      expect(mund.s, form).toBeGreaterThan(0.5);
    }
  });

  it("zeigen jeden Zustand als Standbild anders", () => {
    // Nur, was man sieht: die Arbeits-Marke zählt nicht.
    const bilder = AVATAR_LEBENDIG_ZUSTAENDE.map((z) =>
      JSON.stringify({ ...gesichtFuer(z), arbeit: undefined }),
    );
    expect(new Set(bilder).size).toBe(AVATAR_LEBENDIG_ZUSTAENDE.length);
  });

  it("lassen nur in den Arbeits-Zuständen Arbeits-Mimik zu", () => {
    for (const z of AVATAR_LEBENDIG_ZUSTAENDE) {
      expect(gesichtFuer(z).arbeit, z).toBe(ARBEITS_ZUSTAENDE.includes(z));
    }
    // Schreib-Mund, schiefer Denk-Mund und Denk-Blick gibt es nirgends sonst.
    for (const z of AVATAR_LEBENDIG_ZUSTAENDE) {
      const g = gesichtFuer(z);
      if (!ARBEITS_ZUSTAENDE.includes(z)) {
        expect(g.mund, z).not.toBe("sprech");
        expect(g.mundT, z).toBe("none");
      }
    }
    expect(gesichtFuer("ruhig").mund).toBe("laecheln");
  });

  it("legen Ausdrücke über den Zustand, ohne ihn zu ändern, und halten sie kurz", () => {
    for (const a of AVATAR_AUSDRUECKE) {
      const e = AUSDRUCK_GESICHT[a];
      expect(e.dauer, a).toBeGreaterThanOrEqual(500);
      expect(e.dauer, a).toBeLessThanOrEqual(1500);
      expect(JSON.stringify(gesichtFuer("ruhig", a)), a).not.toBe(
        JSON.stringify(gesichtFuer("ruhig")),
      );
    }
    expect(gesichtFuer("denkt", "nicken").pose).toBe(gesichtFuer("denkt").pose);
    // Nur „anpacken“ sieht nach Arbeit aus.
    for (const a of AVATAR_AUSDRUECKE) {
      expect(gesichtFuer("ruhig", a).arbeit, a).toBe(a === "anpacken");
    }
  });

  it("haben einen Bildschirmleser-Text je Zustand", () => {
    for (const z of AVATAR_LEBENDIG_ZUSTAENDE) {
      const text = t(`avatar.zustand.${z}`, { name: "Pai" });
      expect(text, z).toContain("Pai");
    }
  });
});
