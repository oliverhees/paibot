/**
 * PaiBot – Tests für die Schnittstelle der Agenten.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import * as shared from "@paibot/shared";
import { isNotImplemented } from "@paibot/stub";
import { describe, expect, it } from "vitest";
import * as agents from "./index";
import * as testing from "./testing";

describe("Schnittstelle", () => {
  it("reicht den Motor-Vertrag unverändert weiter", () => {
    expect(agents.MOTOR_ERROR_CODES).toBe(shared.MOTOR_ERROR_CODES);
  });

  it("exportiert Motoren, Anweisung und Lauf-Steuerung", () => {
    expect(typeof agents.createAiSdkMotor).toBe("function");
    expect(typeof agents.buildSystemPrompt).toBe("function");
    expect(typeof agents.executeRun).toBe("function");
    expect(typeof agents.failStaleRuns).toBe("function");
    expect(typeof testing.createFakeMotor).toBe("function");
    expect(typeof testing.motorContractTests).toBe("function");
    expect(agents.RUN_TUNING).toEqual({
      deltaFlushMs: 50,
      deltaFlushChars: 200,
      staleAfterMs: 60000,
    });
    expect(agents.PROMPT_PLACEHOLDERS).toEqual(["name", "datum", "zeitzone", "anweisung"]);
  });

  it("Test-Hilfen sind nicht Teil des Einstiegspunkts", async () => {
    const root: Record<string, unknown> = await import("./index");
    expect(root.createFakeMotor).toBeUndefined();
    expect(root.motorContractTests).toBeUndefined();
  });

  it("noch nicht umgesetzt", () => {
    let caught: unknown;
    try {
      agents.createAiSdkMotor();
    } catch (error) {
      caught = error;
    }
    expect(isNotImplemented(caught)).toBe(true);
  });
});
