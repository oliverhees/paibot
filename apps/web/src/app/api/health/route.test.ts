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
import * as health from "../../../lib/health";
import { GET } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
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

  it("verbietet das Zwischenspeichern und zeigt keine Rollen-Kopfzeile, wenn alles passt", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const response = await GET();
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get(health.DB_ROLE_HEADER)).toBeNull();
  });

  it("meldet zu viele Rechte nur in der Kopfzeile, die Felder bleiben gleich", async () => {
    vi.spyOn(health, "databaseHealth").mockResolvedValue({ db: "ok", role: "zu_viele_rechte" });
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get(health.DB_ROLE_HEADER)).toBe("zu_viele_rechte");
    expect(Object.keys(body)).toEqual(["status", "app", "db", "time", "version"]);
  });

  it("antwortet mit 503, wenn die Datenbank nicht erreichbar ist", async () => {
    vi.spyOn(health, "databaseHealth").mockResolvedValue({ db: "down" });
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ status: "degraded", db: "down" });
  });
});
