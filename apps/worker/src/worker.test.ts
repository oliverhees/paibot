/**
 * PaiBot – Tests für die Schnittstelle des Workers.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { isNotImplemented } from "@paibot/stub";
import { describe, expect, it } from "vitest";
import { readStand, STAND_ENV } from "./stand";
import { loadWorkerConfig, startWorker } from "./worker";

describe("Schnittstelle", () => {
  it("liest den Stand aus PAIBOT_BUILD", () => {
    expect(STAND_ENV).toBe("PAIBOT_BUILD");
    expect(readStand({ PAIBOT_BUILD: "0.3.0+20261205.3f9c2ab" })).toBe("0.3.0+20261205.3f9c2ab");
    expect(readStand({})).toMatch(/\+dev$/);
  });

  it("noch nicht umgesetzt", () => {
    expect(typeof startWorker).toBe("function");
    let caught: unknown;
    try {
      loadWorkerConfig({});
    } catch (error) {
      caught = error;
    }
    expect(isNotImplemented(caught)).toBe(true);
  });
});
