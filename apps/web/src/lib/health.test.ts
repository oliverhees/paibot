/**
 * PaiBot – Tests der Health-Prüfung: Zwischenspeicher, eine Prüfung gleichzeitig, Zeitgrenze.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { describe, expect, it } from "vitest";
import { cachedHealth } from "./health";

describe("cachedHealth", () => {
  it("prüft bei vielen gleichzeitigen Abrufen nur einmal und speichert das Ergebnis", async () => {
    let calls = 0;
    let time = 1000;
    const check = cachedHealth(
      async () => {
        calls += 1;
        return "eingeschraenkt";
      },
      { cacheMs: 5000, now: () => time },
    );
    const results = await Promise.all(Array.from({ length: 50 }, () => check()));
    expect(calls).toBe(1);
    expect(results.every((r) => r.db === "ok" && r.role === "eingeschraenkt")).toBe(true);
    time += 4999;
    await check();
    expect(calls).toBe(1);
    time += 2;
    await check();
    expect(calls).toBe(2);
  });

  it("meldet down bei Fehler und nach der Zeitgrenze, ohne Details", async () => {
    const failing = cachedHealth(async () => {
      throw new Error("password authentication failed for user geheim");
    });
    expect(await failing()).toEqual({ db: "down" });

    const hanging = cachedHealth(() => new Promise(() => undefined), { timeoutMs: 20 });
    expect(await hanging()).toEqual({ db: "down" });
  });

  it("meldet zu viele Rechte weiter", async () => {
    const check = cachedHealth(async () => "zu_viele_rechte");
    expect(await check()).toEqual({ db: "ok", role: "zu_viele_rechte" });
  });
});
