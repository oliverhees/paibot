/**
 * PaiBot – Tests: Die Bereitschaft einer bestehenden Unterhaltung gehört dem Bot **dieser**
 * Unterhaltung, nicht dem Standard-Bot. Davon hängen der Hinweis auf eine Pause und die Angabe
 * des Modells über der Eingabe ab.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

import { type Database, repo } from "@paibot/db";
import { createTestDb } from "@paibot/db/testing";
import type { ConversationId } from "@paibot/shared/ids";
import { describe, expect, it, vi } from "vitest";
import { ladeBereitschaftZurUnterhaltung, ladeVerlauf } from "./laden";

vi.setConfig({ testTimeout: 120_000 });

/**
 * Standard-Bot „Pai“ mit dem Modell A und eine pausierte „Mila“ mit dem Modell B; jede hat ihre
 * eigene Unterhaltung. Ein Faden eines Teams hat keine Bot-Kennung; dort bleibt die Vorgabe.
 */
async function stand() {
  const { db } = await createTestDb();
  const anbieter = await repo.providers.create(db, {
    name: "Beispiel",
    baseUrl: "http://127.0.0.1:1/v1",
    region: "local",
  });
  const a = await repo.models.create(db, {
    providerId: anbieter.id,
    slug: "beispiel/modell-a",
    displayName: "Modell A",
  });
  const b = await repo.models.create(db, {
    providerId: anbieter.id,
    slug: "beispiel/modell-b",
    displayName: "Modell B",
  });
  const pai = await repo.bots.create(db, {
    name: "Pai",
    instructions: "Antworte kurz.",
    avatarShape: "kiesel",
    color: "limette",
    modelId: a.id,
  });
  await repo.settings.update(db, { defaultBotId: pai.id });
  const mila = await repo.bots.create(db, {
    name: "Mila",
    instructions: "Schreib Entwürfe.",
    avatarShape: "blatt",
    color: "blau",
    modelId: b.id,
  });
  await repo.bots.setPaused(db, mila.id, true);
  const paiChat = await repo.conversations.create(db, { botId: pai.id, title: "Mit Pai" });
  const milaChat = await repo.conversations.create(db, { botId: mila.id, title: "Mit Mila" });
  return {
    db,
    paiId: pai.id,
    milaId: mila.id,
    paiChat: paiChat.id,
    milaChat: milaChat.id,
    modellA: a.displayName,
    modellB: b.displayName,
  };
}

/** Genau der Weg der Seite `app/(app)/chat/[id]/page.tsx`: erst der Verlauf, dann die Bereitschaft. */
async function wieDieSeite(db: Database, id: ConversationId) {
  const verlauf = await ladeVerlauf(db, id, { mitSchritten: true });
  if (verlauf === undefined) throw new Error("kein Verlauf");
  return ladeBereitschaftZurUnterhaltung(db, false, undefined, verlauf.unterhaltung);
}

describe("Bereitschaft einer bestehenden Unterhaltung", () => {
  // Gegenprobe: Gibt `ladeBereitschaftZurUnterhaltung` die Kennung nicht weiter (oder ruft die
  // Seite wieder `ladeBereitschaft` ohne sie auf), wird dieser Test rot – der Standard-Bot „Pai“
  // ist nicht pausiert und hat ein anderes Modell.
  it("nennt den pausierten Bot der Unterhaltung, nicht den Standard-Bot", async () => {
    const s = await stand();
    const bereit = await wieDieSeite(s.db, s.milaChat);
    expect(bereit.botId).toBe(s.milaId);
    expect(bereit.botName).toBe("Mila");
    expect(bereit.pausiert).toBe(true);
    expect(bereit.modell?.name).toBe(s.modellB);
  });

  it("die Unterhaltung des Standard-Bots bleibt unberührt, wenn ein anderer Bot pausiert", async () => {
    const s = await stand();
    const bereit = await wieDieSeite(s.db, s.paiChat);
    expect(bereit.botId).toBe(s.paiId);
    expect(bereit.botName).toBe("Pai");
    expect(bereit.pausiert).toBe(false);
    expect(bereit.modell?.name).toBe(s.modellA);
  });

  // Ohne Bot-Kennung gibt es die Unterhaltung nur als Faden eines Teams (`typen.ts:48`).
  it("ohne Bot-Kennung bleibt der Standard-Bot die Vorgabe", async () => {
    const s = await stand();
    const bereit = await ladeBereitschaftZurUnterhaltung(s.db, false, undefined, {
      id: s.milaChat,
      titel: "Faden eines Teams",
      schleuse: "off",
    });
    expect(bereit.botId).toBe(s.paiId);
    expect(bereit.pausiert).toBe(false);
  });
});
