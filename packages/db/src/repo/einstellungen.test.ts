/**
 * PaiBot – Tests: Einstellungen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { newId } from "@paibot/shared";
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../client";
import { createTestDb } from "../testing";
import { bots, settings } from "./index";
import { mitCode } from "./testhilfe";

describe("settings", () => {
  let db: Database;
  beforeEach(async () => {
    db = (await createTestDb()).db;
  });

  it("gibt vor der Einrichtung nichts zurück", async () => {
    expect(await settings.get(db)).toBeUndefined();
    expect(await settings.isSetupComplete(db)).toBe(false);
  });

  it("ensure legt die Zeile mit Standardwerten an und ist wiederholbar", async () => {
    const erste = await settings.ensure(db);
    expect(erste).toMatchObject({
      locale: "de",
      timezone: "Europe/Berlin",
      schleuseModeDefault: "off",
      maxHops: 8,
      killSwitch: false,
    });
    expect(erste).not.toHaveProperty("dailyTokenBudget");
    expect(erste).not.toHaveProperty("installationId");
    expect(await settings.ensure(db)).toEqual(erste);
  });

  it("update legt bei Bedarf an, ändert nur genannte Felder und entfernt Grenzen mit null", async () => {
    const a = await settings.update(db, { dailyTokenBudget: 1000, timezone: "Europe/Wien" });
    expect(a).toMatchObject({ dailyTokenBudget: 1000, timezone: "Europe/Wien", maxHops: 8 });
    const b = await settings.update(db, { historyTokenLimit: 500, killSwitch: true });
    expect(b).toMatchObject({ dailyTokenBudget: 1000, historyTokenLimit: 500, killSwitch: true });
    const c = await settings.update(db, { dailyTokenBudget: null });
    expect(c).not.toHaveProperty("dailyTokenBudget");
    expect(c.historyTokenLimit).toBe(500);
  });

  it("update weist ungültige Werte mit eingabe_ungueltig ab", async () => {
    await expect(settings.update(db, { maxHops: 0 })).rejects.toEqual(mitCode("eingabe_ungueltig"));
    await expect(settings.update(db, { dailyTokenBudget: -5 })).rejects.toEqual(
      mitCode("eingabe_ungueltig"),
    );
  });

  it("completeSetup setzt Installations-ID und Zeitpunkt einmalig", async () => {
    const bot = await bots.create(db, { name: "Pai", avatarShape: "blatt", color: "blau" });
    const installationId = newId("installation");
    const fertig = await settings.completeSetup(db, {
      installationId,
      schleuseModeDefault: "on",
      defaultBotId: bot.id,
      now: new Date("2026-11-20T10:00:00.000Z"),
    });
    expect(fertig).toMatchObject({
      installationId,
      schleuseModeDefault: "on",
      defaultBotId: bot.id,
      setupCompletedAt: "2026-11-20T10:00:00.000Z",
    });
    expect(await settings.isSetupComplete(db)).toBe(true);
    await expect(
      settings.completeSetup(db, { installationId: newId("installation") }),
    ).rejects.toEqual(mitCode("einrichtung_fertig"));
    expect((await settings.get(db))?.installationId).toBe(installationId);
  });

  it("die Installations-ID lässt sich nicht mehr ändern", async () => {
    await settings.completeSetup(db, { installationId: newId("installation") });
    await expect(settings.update(db, { installationId: newId("installation") })).rejects.toThrow();
  });

  it("der Standard-Bot fällt weg, wenn der Bot gelöscht wird", async () => {
    const bot = await bots.create(db, { name: "Pai", avatarShape: "blatt", color: "blau" });
    await settings.update(db, { defaultBotId: bot.id });
    expect((await bots.getDefault(db))?.id).toBe(bot.id);
    await bots.remove(db, bot.id);
    expect((await settings.get(db))?.defaultBotId).toBeUndefined();
    expect(await bots.getDefault(db)).toBeUndefined();
  });
});
