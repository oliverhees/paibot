/**
 * PaiBot – Tests: Pausen-Stand eines Bots wird bei jedem Aufruf frisch gelesen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { repo } from "@paibot/db";
import { createTestDb } from "@paibot/db/testing";
import { newId } from "@paibot/shared/ids";
import { describe, expect, it } from "vitest";
import { readBotPaused } from "./bot-stand";

describe("readBotPaused", () => {
  it("ein neuer Bot ist nicht pausiert; Pause und Aufheben gelten beim nächsten Lesen sofort", async () => {
    const { db } = await createTestDb();
    const bot = await repo.bots.create(db, { name: "Pai", avatarShape: "blatt", color: "blau" });
    expect(await readBotPaused(db, bot.id)).toBe(false);
    await repo.bots.setPaused(db, bot.id, true);
    expect(await readBotPaused(db, bot.id)).toBe(true);
    await repo.bots.setPaused(db, bot.id, false);
    expect(await readBotPaused(db, bot.id)).toBe(false);
  });

  // Gegenprobe: `?? false` statt `undefined` für eine fehlende Zeile → der Test unten wird rot.
  it("einen Bot ohne Zeile gibt es nicht: undefined, nie ein Standardwert", async () => {
    const { db } = await createTestDb();
    expect(await readBotPaused(db, newId("bot"))).toBeUndefined();
  });

  it("die Pause eines Bots betrifft nur diesen Bot", async () => {
    const { db } = await createTestDb();
    const a = await repo.bots.create(db, { name: "A", avatarShape: "blatt", color: "blau" });
    const b = await repo.bots.create(db, { name: "B", avatarShape: "blatt", color: "pink" });
    await repo.bots.setPaused(db, a.id, true);
    expect(await readBotPaused(db, a.id)).toBe(true);
    expect(await readBotPaused(db, b.id)).toBe(false);
  });
});
