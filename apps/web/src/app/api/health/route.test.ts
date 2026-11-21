/**
 * PaiBot – Test für den Health-Endpunkt: Felder und Reihenfolge, keine Version für Fremde.
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
  it("meldet Status, App, Datenbank und Zeit in dieser Reihenfolge, ohne Version", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("PAIBOT_BUILD", "");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(Object.keys(body)).toEqual(["status", "app", "db", "time"]);
    expect(body).toMatchObject({ status: "ok", app: "PaiBot", db: "not_configured" });
    expect(body.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("nennt weder Version noch Stand der Software, auch nicht mit PAIBOT_BUILD", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("PAIBOT_BUILD", "0.3.0+20261205.3f9c2ab");
    const response = await GET();
    const text = await response.text();
    expect(text).not.toContain("0.3.0");
    expect(text).not.toContain(PAIBOT_VERSION);
    expect(text).not.toContain("3f9c2ab");
    expect([...response.headers.keys()].filter((k) => k.startsWith("x-pb"))).toEqual([]);
  });

  it("verbietet das Zwischenspeichern", async () => {
    vi.stubEnv("DATABASE_URL", "");
    const response = await GET();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("verrät Fremden nichts über die Rechte der Datenbank-Verbindung, nur das Log nennt sie", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(health, "databaseHealth").mockResolvedValue({ db: "ok", role: "zu_viele_rechte" });
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect([...response.headers.keys()].filter((k) => k.startsWith("x-pb"))).toEqual([]);
    expect(Object.keys(body)).toEqual(["status", "app", "db", "time"]);
    expect(JSON.stringify(body)).not.toContain("rechte");
    expect(warn.mock.calls.flat().join(" ")).toContain("zu viele Rechte");
  });

  it("antwortet mit 503, wenn die Datenbank nicht erreichbar ist", async () => {
    vi.spyOn(health, "databaseHealth").mockResolvedValue({ db: "down" });
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ status: "degraded", db: "down" });
  });
});
