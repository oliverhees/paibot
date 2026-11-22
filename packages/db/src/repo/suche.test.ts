/**
 * PaiBot – Tests: Suche in Titeln und Nachrichten.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import type { BotId, ConversationId } from "@paibot/shared";
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../client";
import { createTestDb } from "../testing";
import { bots, conversations, messages, search } from "./index";
import { pruefeZwischentexte } from "./testhilfe";

describe("search", () => {
  let db: Database;
  let botId: BotId;
  let eins: ConversationId;
  let zwei: ConversationId;
  beforeEach(async () => {
    db = (await createTestDb()).db;
    botId = (await bots.create(db, { name: "Pai", avatarShape: "blatt", color: "blau" })).id;
    eins = (await conversations.create(db, { botId, title: "Grüne Äpfel" })).id;
    zwei = (await conversations.create(db, { botId, title: "Reise nach Wien" })).id;
    await messages.insert(db, {
      conversationId: eins,
      role: "user",
      content: "Wie lagere ich ÄPFEL?",
    });
    await messages.insert(db, {
      conversationId: eins,
      role: "assistant",
      content: `${"Vorrede ".repeat(40)}Äpfel mögen es kühl. ${"Nachsatz ".repeat(60)}`,
    });
    await messages.insert(db, {
      conversationId: zwei,
      role: "user",
      content: "Rabatt 50% und a_b\\c",
    });
    await messages.insert(db, { conversationId: zwei, role: "system", content: "äpfel geheim" });
  });

  it("findet Titel ohne Groß- und Kleinschreibung, auch mit Umlauten", async () => {
    const t = await search.titles(db, "GRÜNE äpfel", { limit: 10 });
    expect(t.map((x) => x.conversationId)).toEqual([eins]);
    expect(await search.titles(db, "wien", { limit: 10 })).toHaveLength(1);
    expect(await search.titles(db, "", { limit: 10 })).toEqual([]);
  });

  it("findet Nachrichten der Person und des Bots, nie Anweisungen, neueste zuerst", async () => {
    const { hits, more } = await search.messageHits(db, "äpfel", { limit: 10, offset: 0 });
    expect(more).toBe(false);
    expect(hits.map((h) => h.role)).toEqual(["assistant", "user"]);
    expect(hits.every((h) => h.conversationId === eins && h.title === "Grüne Äpfel")).toBe(true);
  });

  it("schneidet den Ausschnitt in der Datenbank um die Fundstelle zu", async () => {
    const { hits } = await search.messageHits(db, "kühl", { limit: 10, offset: 0 });
    const [h] = hits;
    expect(h?.excerpt).toContain("Äpfel mögen es kühl.");
    expect(h?.excerpt.length).toBeLessThanOrEqual(search.SNIPPET_BEFORE + search.SNIPPET_AFTER);
    expect(h?.cutStart).toBe(true);
    expect(h?.cutEnd).toBe(true);
    const [kurz] = (await search.messageHits(db, "lagere", { limit: 10, offset: 0 })).hits;
    expect(kurz?.excerpt).toBe("Wie lagere ich ÄPFEL?");
    expect(kurz?.cutStart).toBe(false);
    expect(kurz?.cutEnd).toBe(false);
  });

  it("Sonderzeichen haben keine Muster-Wirkung", async () => {
    const treffer = async (q: string) =>
      (await search.messageHits(db, q, { limit: 10, offset: 0 })).hits.length;
    expect(await treffer("50%")).toBe(1);
    expect(await treffer("%")).toBe(1);
    expect(await treffer("a_b")).toBe(1);
    expect(await treffer("_")).toBe(1);
    expect(await treffer("a%b")).toBe(0);
    expect(await treffer("\\")).toBe(1);
    expect(await treffer("'; drop table messages; --")).toBe(0);
    expect(await search.titles(db, "%", { limit: 10 })).toEqual([]);
    expect(await search.titles(db, "_", { limit: 10 })).toEqual([]);
  });

  it("blättert seitenweise", async () => {
    for (let i = 0; i < 5; i++) {
      await messages.insert(db, { conversationId: zwei, role: "user", content: `Punkt ${i}` });
    }
    const a = await search.messageHits(db, "punkt", { limit: 2, offset: 0 });
    const b = await search.messageHits(db, "punkt", { limit: 2, offset: 2 });
    const c = await search.messageHits(db, "punkt", { limit: 2, offset: 4 });
    expect([a.more, b.more, c.more]).toEqual([true, true, false]);
    expect([...a.hits, ...b.hits, ...c.hits].map((h) => h.excerpt)).toEqual([
      "Punkt 4",
      "Punkt 3",
      "Punkt 2",
      "Punkt 1",
      "Punkt 0",
    ]);
  });

  it("findet keine Zwischentexte eines Laufs mit Werkzeugen; Blättern zählt nur Treffer", async () => {
    await pruefeZwischentexte(db, botId);
  });
});
