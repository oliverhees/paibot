/**
 * PaiBot – Test für den Health-Endpunkt: Felder, Reihenfolge und Version.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { PAIBOT_VERSION } from "@paibot/shared/stand";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/health", () => {
  it("meldet Status, App, Datenbank, Zeit und Version in dieser Reihenfolge", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("PAIBOT_BUILD", "");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(Object.keys(body)).toEqual(["status", "app", "db", "time", "version"]);
    expect(body).toMatchObject({
      status: "ok",
      app: "PaiBot",
      db: "not_configured",
      version: PAIBOT_VERSION,
    });
    expect(body.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("nennt nur die Version aus PAIBOT_BUILD, ohne den Teil ab +", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("PAIBOT_BUILD", "0.3.0+20261205.3f9c2ab");
    const body = await (await GET()).json();
    expect(body.version).toBe("0.3.0");
  });
});
