/**
 * PaiBot – Tests: Welche Rolle beim Start migriert. Die Web-App migriert in Produktion nie, nur der
 * Dienst `migrate`; in der Entwicklung migriert sie selbst.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { randomBytes } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const calls: string[] = [];
const ok = {
  ok: true,
  role: { status: "eingeschraenkt", role: "paibot_app", issues: [] },
  state: { status: "aktuell", applied: 7, expected: 7 },
  separateRoles: true,
};

vi.mock("@paibot/db/migrate", () => ({
  prepareDatabase: async () => {
    calls.push("migrieren");
    return ok;
  },
  checkDatabase: async () => {
    calls.push("pruefen");
    return ok;
  },
}));

vi.mock("@paibot/jobs", () => ({
  prepareQueue: async () => {
    calls.push("warteschlange");
  },
}));

const { prepareStart } = await import("./betrieb");

const url = (user: string) =>
  `postgres://${user}:${randomBytes(24).toString("hex")}@postgres:5432/paibot`;
const silent = { info: () => undefined, warn: () => undefined, error: () => undefined };
const exits: number[] = [];
const exit = ((code: number) => {
  exits.push(code);
}) as (code: number) => never;

beforeEach(() => {
  calls.length = 0;
  exits.length = 0;
});

describe("wer migriert", () => {
  it("web in Produktion prüft nur", async () => {
    await prepareStart(
      {
        NODE_ENV: "production",
        APP_URL: "https://paibot.example.de",
        PAIBOT_SECRET: randomBytes(32).toString("base64"),
        DATABASE_URL: url("paibot_app"),
      } as NodeJS.ProcessEnv,
      { log: silent, exit },
    );
    expect(calls).toEqual(["pruefen"]);
    expect(exits).toEqual([]);
  });

  it("migrate migriert und endet mit 0", async () => {
    await prepareStart(
      {
        NODE_ENV: "production",
        PAIBOT_ROLE: "migrate",
        DATABASE_URL: url("paibot_app"),
        DATABASE_MIGRATION_URL: url("paibot"),
      } as NodeJS.ProcessEnv,
      { log: silent, exit },
    );
    // Nach den Migrationen richtet migrate die Warteschlange mit der App-Rolle ein.
    expect(calls).toEqual(["migrieren", "warteschlange"]);
    expect(exits).toEqual([0]);
  });

  it("web in der Entwicklung migriert selbst", async () => {
    await prepareStart(
      { NODE_ENV: "development", DATABASE_URL: url("paibot") } as NodeJS.ProcessEnv,
      { log: silent, exit },
    );
    // In der Entwicklung ist die Web-App auch der Migrations-Schritt (samt Warteschlange).
    expect(calls).toEqual(["migrieren", "warteschlange"]);
  });
});
