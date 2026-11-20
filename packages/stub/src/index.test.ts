/**
 * PaiBot – Tests für den Fehler „noch nicht umgesetzt“.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { describe, expect, it } from "vitest";
import {
  isNotImplemented,
  NOT_IMPLEMENTED_CODE,
  NotImplementedError,
  notImplemented,
} from "./index";

describe("notImplemented", () => {
  it("wirft einen Fehler mit festem Code und dem Namen der Funktion", () => {
    let caught: unknown;
    try {
      notImplemented("beispiel.funktion");
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(NotImplementedError);
    expect(isNotImplemented(caught)).toBe(true);
    expect((caught as NotImplementedError).code).toBe(NOT_IMPLEMENTED_CODE);
    expect((caught as NotImplementedError).feature).toBe("beispiel.funktion");
    expect((caught as Error).message).toBe("Noch nicht umgesetzt: beispiel.funktion");
  });

  it("erkennt andere Fehler nicht als „noch nicht umgesetzt“", () => {
    expect(isNotImplemented(new Error("x"))).toBe(false);
    expect(isNotImplemented(undefined)).toBe(false);
  });
});
