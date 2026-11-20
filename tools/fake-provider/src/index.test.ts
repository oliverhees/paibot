/**
 * PaiBot – Tests für die Schnittstelle des Test-Anbieters.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { isNotImplemented } from "@paibot/stub";
import { describe, expect, it } from "vitest";
import { createFakeProvider, FAKE_CONTROL_PATHS, FAKE_PROVIDER_PATHS } from "./index";

describe("Schnittstelle", () => {
  it("nennt die nachgebildeten Pfade", () => {
    expect(FAKE_PROVIDER_PATHS).toEqual({
      models: "/v1/models",
      chatCompletions: "/v1/chat/completions",
    });
    expect(Object.values(FAKE_CONTROL_PATHS).every((path) => path.startsWith("/_steuerung/"))).toBe(
      true,
    );
  });

  it("noch nicht umgesetzt", () => {
    expect(() => createFakeProvider()).toThrow(/Noch nicht umgesetzt/);
    try {
      createFakeProvider();
    } catch (error) {
      expect(isNotImplemented(error)).toBe(true);
    }
  });
});
