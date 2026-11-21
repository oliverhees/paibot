/**
 * PaiBot – Tests der Tasten im Eingabefeld.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { describe, expect, it } from "vitest";
import { eingabeAktion, fokusZurueck, sendbar } from "./eingabe";

describe("Tasten im Eingabefeld", () => {
  it("sendet mit Enter und bricht mit Umschalt+Enter um", () => {
    expect(eingabeAktion({ key: "Enter", shiftKey: false })).toBe("senden");
    expect(eingabeAktion({ key: "Enter", shiftKey: true })).toBe("neue-zeile");
    expect(eingabeAktion({ key: "a", shiftKey: false })).toBe("nichts");
  });

  it("sendet nicht während einer Zeichen-Komposition", () => {
    expect(eingabeAktion({ key: "Enter", shiftKey: false, isComposing: true })).toBe("nichts");
  });

  it("sendet keinen leeren Text", () => {
    expect(sendbar("")).toBe(false);
    expect(sendbar("  \n ")).toBe(false);
    expect(sendbar("Hallo")).toBe(true);
  });
});

describe("Fokus nach dem Senden", () => {
  it("holt den Fokus zurück, wenn er auf einem Knopf der Eingabe oder auf der Seite steht", () => {
    expect(fokusZurueck("eingabe", true, false)).toBe(true);
    expect(fokusZurueck("nirgends", true, false)).toBe(true);
  });

  it("lässt ihn, wo er ist: schon im Feld, anderswo (z. B. Dialog), ohne Senden oder bei gesperrtem Feld", () => {
    expect(fokusZurueck("feld", true, false)).toBe(false);
    expect(fokusZurueck("anderswo", true, false)).toBe(false);
    expect(fokusZurueck("nirgends", false, false)).toBe(false);
    expect(fokusZurueck("eingabe", true, true)).toBe(false);
  });
});
