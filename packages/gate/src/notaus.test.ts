/**
 * PaiBot – Tests des Not-Aus im Tor: Umschalten ist eine Aktion des Besitzers, die die Grenze
 * G-05 nie trifft; Aufheben verlangt das bestätigte Passwort (V-10), Einschalten nicht.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import type { Facts } from "@paibot/shared/aktionen";
import { ACTIVE_STANDARD_RULES } from "@paibot/shared/tor";
import { describe, expect, it } from "vitest";
import { denialCode, evaluate } from "./evaluate";
import { DECIDED_BOT_ACTIONS as BOT_ACTIONS, sampleAction, sampleFacts } from "./testdaten";

function umschalten(facts: Partial<Facts<"notaus.umschalten">>) {
  return evaluate(
    sampleAction("notaus.umschalten"),
    { ...sampleFacts("notaus.umschalten"), ...facts },
    ACTIVE_STANDARD_RULES,
  );
}

describe("Not-Aus umschalten", () => {
  it("Einschalten geht mit Sitzung, ohne Passwort", () => {
    const d = umschalten({ on: true, wasOn: false, currentPasswordVerified: false });
    expect(d.outcome).toBe("allow");
    expect(d.preconditions).toEqual([{ name: "notaus_aufheben_bestaetigt", result: "entfaellt" }]);
    expect(d.matchedRules.map((r) => r.id)).toEqual(["R-001"]);
  });

  it("Aufheben ohne bestätigtes Passwort wird abgelehnt (passwort_falsch)", () => {
    const d = umschalten({ on: false, wasOn: true, currentPasswordVerified: false });
    expect(d.outcome).toBe("deny");
    expect(denialCode(d)).toBe("passwort_falsch");
  });

  it("Aufheben mit bestätigtem Passwort geht", () => {
    const d = umschalten({ on: false, wasOn: true, currentPasswordVerified: true });
    expect(d.outcome).toBe("allow");
  });

  it("die Grenze G-05 trifft das Umschalten nie: der Besitzer kann immer aufheben", () => {
    for (const on of [true, false]) {
      const d = umschalten({ on, wasOn: true, currentPasswordVerified: true });
      expect(d.limits.find((l) => l.name === "not_aus")?.result).toBe("entfaellt");
      expect(d.outcome).toBe("allow");
    }
  });

  it("ein mitgeschickter Schalter `killSwitch` macht die Eingabe ungültig (kein Umgehen)", () => {
    const d = evaluate(
      sampleAction("notaus.umschalten"),
      { ...sampleFacts("notaus.umschalten"), killSwitch: true } as never,
      ACTIVE_STANDARD_RULES,
    );
    expect(d.outcome).toBe("deny");
  });

  it("jede Aktion eines Bots wird bei Not-Aus abgelehnt (Code `angehalten`)", () => {
    for (const type of BOT_ACTIONS) {
      const d = evaluate(
        sampleAction(type),
        { ...sampleFacts(type), killSwitch: true } as never,
        ACTIVE_STANDARD_RULES,
      );
      expect(d.outcome, type).toBe("deny");
      expect(d.limits.find((l) => l.name === "not_aus")?.result, type).toBe("verletzt");
      expect(denialCode(d), type).toBe("angehalten");
    }
  });
});
