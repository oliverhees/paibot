/**
 * PaiBot – Tests: Einstellungen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { newId, type Sha256Digest } from "@paibot/shared";
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../client";
import { createTestDb, type TestDb } from "../testing";
import { bots, owner, settings } from "./index";
import { mitCode } from "./testhilfe";

describe("settings", () => {
  let db: Database;
  let ctx: TestDb;
  beforeEach(async () => {
    ctx = await createTestDb();
    db = ctx.db;
  });

  describe("Prüfwert des Einrichtungs-Codes", () => {
    const hash = (c: string) => `sha256:${c.repeat(64)}` as Sha256Digest;
    const zeit = new Date("2026-11-21T08:00:00.000Z");

    it("setzen, ersetzen, lesen; erscheint nicht in den Einstellungen", async () => {
      expect(await settings.getSetupCode(db)).toBeUndefined();
      expect(await settings.setSetupCode(db, { hash: hash("a"), now: zeit })).toBe(true);
      expect(await settings.getSetupCode(db)).toEqual({ hash: hash("a"), createdAt: zeit });
      expect(await settings.setSetupCode(db, { hash: hash("b") })).toBe(true);
      expect((await settings.getSetupCode(db))?.hash).toBe(hash("b"));
      expect(JSON.stringify(await settings.get(db))).not.toContain("sha256:");
      await settings.clearSetupCode(db);
      expect(await settings.getSetupCode(db)).toBeUndefined();
    });

    it("nur solange es keinen Besitzer gibt", async () => {
      await owner.create(db, { passwordHash: "hash-1" });
      expect(await settings.setSetupCode(db, { hash: hash("a") })).toBe(false);
      expect(await settings.getSetupCode(db)).toBeUndefined();
    });

    it("auch die Datenbank lässt ihn mit Besitzer nicht neu setzen", async () => {
      await settings.ensure(db);
      await owner.create(db, { passwordHash: "hash-1" });
      await expect(
        ctx.client.query(
          `update settings set setup_code_hash = '${hash("c")}', setup_code_created_at = now()`,
        ),
      ).rejects.toMatchObject({ code: "23514" });
    });

    it("nicht nach dem Abschluss der Einrichtung; der Abschluss löscht ihn", async () => {
      await settings.setSetupCode(db, { hash: hash("a") });
      await settings.completeSetup(db, { installationId: newId("installation") });
      expect(await settings.getSetupCode(db)).toBeUndefined();
      expect(await settings.setSetupCode(db, { hash: hash("b") })).toBe(false);
      expect(await settings.getSetupCode(db)).toBeUndefined();
    });
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

  // Gegenprobe: `settings.default_bot_id` wieder mit `on delete set null` → der Standard-Bot ist weg (rot).
  it("der Standard-Bot lässt sich nicht löschen: fester Satz, nichts ändert sich", async () => {
    const bot = await bots.create(db, { name: "Pai", avatarShape: "blatt", color: "blau" });
    await settings.update(db, { defaultBotId: bot.id });
    expect((await bots.getDefault(db))?.id).toBe(bot.id);
    await expect(bots.remove(db, bot.id)).rejects.toMatchObject({
      code: "abgelehnt",
      text: "Das ist dein Standard-Bot und lässt sich nicht löschen.",
      ausweg: "Wähle zuerst einen anderen Bot als Standard.",
    });
    expect((await settings.get(db))?.defaultBotId).toBe(bot.id);
    expect((await bots.getDefault(db))?.id).toBe(bot.id);
  });

  it("nach einem Wechsel des Standard-Bots lässt sich der frühere löschen", async () => {
    const alt = await bots.create(db, { name: "Alt", avatarShape: "blatt", color: "blau" });
    const neu = await bots.create(db, { name: "Neu", avatarShape: "blatt", color: "pink" });
    await settings.update(db, { defaultBotId: alt.id });
    await settings.update(db, { defaultBotId: neu.id });
    expect(await bots.remove(db, alt.id)).toBe(true);
    expect((await bots.getDefault(db))?.id).toBe(neu.id);
  });
});
