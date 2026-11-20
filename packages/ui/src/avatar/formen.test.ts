/**
 * PaiBot – Tests der Avatar-Formen und der Farb-Paare.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { AVATAR_SHAPES, BOT_COLORS } from "@paibot/shared/objekte";
import { describe, expect, it } from "vitest";
import { FORM_ZU_FARBE, FORMEN, formFuer, gesichtFuer, mundOffenY } from "./formen";

describe("Avatar-Formen", () => {
  it("ergibt den Blüten-Pfad zeichengenau", () => {
    expect(FORMEN.bluete.d).toBe(
      "M11 12.6a9 9 0 1 0 18 0a9 9 0 1 0 -18 0ZM18.4 20a9 9 0 1 0 18 0a9 9 0 1 0 -18 0ZM11 27.4a9 9 0 1 0 18 0a9 9 0 1 0 -18 0ZM3.5999999999999996 20a9 9 0 1 0 18 0a9 9 0 1 0 -18 0Z",
    );
  });

  it("hat für jede Form einen Umriss und nur die Wabe einen Rand", () => {
    expect(Object.keys(FORMEN).sort()).toEqual([...AVATAR_SHAPES].sort());
    expect(FORMEN.wabe.rand).toBe(5);
  });

  it("ordnet jeder Farbe genau die feste Form zu", () => {
    expect(Object.keys(FORM_ZU_FARBE).sort()).toEqual([...BOT_COLORS].sort());
    expect(formFuer("limette")).toBe("blatt");
    expect(formFuer("orange")).toBe("blatt");
    expect(formFuer("blau")).toBe("bogen");
    expect(formFuer("gruen")).toBe("kiesel");
    expect(formFuer("violett")).toBe("raute");
    expect(formFuer("pink")).toBe("bluete");
    expect(formFuer("tuerkis")).toBe("dee");
    expect(formFuer("gelb")).toBe("wabe");
  });

  it("nimmt das dunkle Gesicht nur auf Limette", () => {
    expect(gesichtFuer("limette")).toBe("var(--bot-gesicht-dunkel)");
    for (const farbe of BOT_COLORS.filter((f) => f !== "limette")) {
      expect(gesichtFuer(farbe)).toBe("var(--bot-gesicht)");
    }
  });

  it("setzt den offenen Mund je Form", () => {
    expect(mundOffenY("bogen")).toBe(27);
    expect(mundOffenY("bluete")).toBe(24.6);
    expect(mundOffenY("raute")).toBe(25.6);
  });
});
