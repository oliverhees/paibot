/**
 * PaiBot – Tests: Der Worker prüft die Datenschleuse beim Start und regelmäßig und meldet den
 * Zustand in die Datenbank; ein Fehler beim Melden hält ihn nicht an und verrät keine Geheimnisse.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { randomBytes } from "node:crypto";
import { type Database, repo, type SchleuseZustandWert } from "@paibot/db";
import { createTestDb } from "@paibot/db/testing";
import { startFakeSchleuse } from "@paibot/llm/testing";
import { describe, expect, it } from "vitest";
import { realWorkerDeps } from "./abhaengigkeiten";
import type { WorkerLog } from "./protokoll";
import { realSchleuseCheck, type SchleuseCheck, startSchleuseMeldung } from "./schleuse-meldung";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function memoryLog() {
  const lines: string[] = [];
  const log: WorkerLog = {
    info: (m) => lines.push(`info ${m}`),
    warn: (m) => lines.push(`warn ${m}`),
    error: (m) => lines.push(`error ${m}`),
  };
  return { log, lines };
}

function fakeCheck(states: SchleuseZustandWert[], fail?: () => Error | undefined) {
  const reports: SchleuseZustandWert[] = [];
  const check: SchleuseCheck = {
    check: async () => states.shift() ?? "bereit",
    report: async (_db, state) => {
      const error = fail?.();
      if (error) throw error;
      reports.push(state);
    },
  };
  return { check, reports };
}

describe("Meldung der Datenschleuse", () => {
  it("meldet sofort beim Start und danach in festen Abständen; nur Wechsel stehen im Log", async () => {
    const { log, lines } = memoryLog();
    const { check, reports } = fakeCheck(["nicht_erreichbar", "bereit", "bereit"]);
    const meldung = await startSchleuseMeldung({
      db: {} as Database,
      env: {},
      check,
      intervalMs: 15,
      log,
      secrets: [],
    });
    expect(reports).toEqual(["nicht_erreichbar"]);
    await sleep(70);
    meldung.stop();
    const anzahl = meldung.reports();
    expect(anzahl).toBeGreaterThanOrEqual(3);
    expect(reports.slice(0, 3)).toEqual(["nicht_erreichbar", "bereit", "bereit"]);
    expect(lines).toEqual(["info Datenschleuse: nicht_erreichbar.", "info Datenschleuse: bereit."]);
    await sleep(40);
    expect(meldung.reports()).toBe(anzahl);
  });

  it("scheitert das Melden, läuft er weiter, warnt einmal ohne Geheimnis und meldet später wieder", async () => {
    const { log, lines } = memoryLog();
    let kaputt = true;
    const { check, reports } = fakeCheck([], () =>
      kaputt ? new Error("Anmeldung mit pw-0123456789abcdef fehlgeschlagen") : undefined,
    );
    const meldung = await startSchleuseMeldung({
      db: {} as Database,
      env: {},
      check,
      intervalMs: 10,
      log,
      secrets: ["pw-0123456789abcdef"],
    });
    await sleep(40);
    expect(reports).toEqual([]);
    expect(lines.filter((l) => l.startsWith("warn"))).toHaveLength(1);
    expect(lines.join("\n")).not.toContain("pw-0123456789abcdef");
    kaputt = false;
    await sleep(40);
    meldung.stop();
    expect(reports.length).toBeGreaterThan(0);
    expect(lines).toContain("info Zustand der Datenschleuse wird wieder gemeldet.");
  });

  it("eine hängende Prüfung wird nicht doppelt gestartet", async () => {
    const { log } = memoryLog();
    let laufend = 0;
    let hoechstens = 0;
    const check: SchleuseCheck = {
      check: async () => {
        laufend += 1;
        hoechstens = Math.max(hoechstens, laufend);
        await sleep(40);
        laufend -= 1;
        return "bereit";
      },
      report: async () => undefined,
    };
    const meldung = await startSchleuseMeldung({
      db: {} as Database,
      env: {},
      check,
      intervalMs: 5,
      log,
      secrets: [],
    });
    await sleep(60);
    meldung.stop();
    expect(hoechstens).toBe(1);
  });

  it("der Betrieb meldet über die echte Prüfung", () => {
    expect(realWorkerDeps().schleuse).toBeDefined();
  });

  it("echt: ohne Datenschleuse „aus“, mit laufender „bereit“, mit falschem Schlüssel „schluessel_falsch“", async () => {
    const { db } = await createTestDb();
    const { log } = memoryLog();
    const echt = realSchleuseCheck();
    const schleuseKey = `sk-schleuse-${randomBytes(12).toString("hex")}`;
    const schleuse = await startFakeSchleuse({
      apiKey: schleuseKey,
      upstream: "http://127.0.0.1:9/v1",
    });
    try {
      const melden = async (env: Record<string, string>) => {
        const m = await startSchleuseMeldung({
          db,
          env,
          check: echt,
          intervalMs: 60_000,
          log,
          secrets: [],
        });
        m.stop();
        return (await repo.schleuse.get(db))?.state;
      };
      expect(await melden({})).toBe("aus");
      expect(await melden({ SCHLEUSE_URL: schleuse.baseUrl, SCHLEUSE_KEY: schleuseKey })).toBe(
        "bereit",
      );
      expect(
        await melden({ SCHLEUSE_URL: schleuse.baseUrl, SCHLEUSE_KEY: "sk-falsch-000000000000" }),
      ).toBe("schluessel_falsch");
      expect(
        await melden({ SCHLEUSE_URL: "http://127.0.0.1:9/v1", SCHLEUSE_KEY: schleuseKey }),
      ).toBe("nicht_erreichbar");
    } finally {
      await schleuse.close();
    }
  });
});
