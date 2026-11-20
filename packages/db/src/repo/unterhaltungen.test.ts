/**
 * PaiBot – Tests: Unterhaltungen und Nachrichten.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { newId, ZERO_PREV } from "@paibot/shared";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../client";
import {
  belege,
  conversationEvents,
  installationKeys,
  runs as laeufeTabelle,
  messages as nachrichtenTabelle,
} from "../schema";
import { belegRow, keyRow } from "../testdaten";
import { createTestDb } from "../testing";
import { StatuswechselError } from "./fehler";
import { bots, conversations, events, messages, runs, withTransaction } from "./index";
import { mitCode } from "./testhilfe";

describe("conversations", () => {
  let db: Database;
  let botId: ReturnType<typeof newId<"bot">>;
  beforeEach(async () => {
    db = (await createTestDb()).db;
    botId = (await bots.create(db, { name: "Pai", avatarShape: "blatt", color: "blau" })).id;
  });

  it("legt an, holt, benennt um", async () => {
    const c = await conversations.create(db, { botId, title: "Erste" });
    expect(c).toMatchObject({ botId, title: "Erste" });
    expect(c).not.toHaveProperty("schleuseMode");
    expect(c).not.toHaveProperty("lastMessageAt");
    expect(await conversations.get(db, c.id)).toEqual(c);
    const r = await conversations.rename(db, c.id, "Neuer Titel");
    expect(r?.title).toBe("Neuer Titel");
    expect(await conversations.rename(db, newId("conversation"), "x")).toBeUndefined();
  });

  it("weist unbekannten Bot und ungültigen Titel ab", async () => {
    await expect(conversations.create(db, { botId: newId("bot"), title: "x" })).rejects.toEqual(
      mitCode("nicht_gefunden"),
    );
    await expect(conversations.create(db, { botId, title: "" })).rejects.toEqual(
      mitCode("eingabe_ungueltig"),
    );
    const c = await conversations.create(db, { botId, title: "ok" });
    await expect(conversations.rename(db, c.id, "x".repeat(201))).rejects.toEqual(
      mitCode("eingabe_ungueltig"),
    );
  });

  it("listet die zuletzt benutzte zuerst, leere am Ende", async () => {
    const a = await conversations.create(db, { botId, title: "A" });
    const b = await conversations.create(db, { botId, title: "B" });
    const leer = await conversations.create(db, { botId, title: "Leer" });
    await messages.insert(db, { conversationId: a.id, role: "user", content: "1" });
    await messages.insert(db, { conversationId: b.id, role: "user", content: "2" });
    await messages.insert(db, { conversationId: a.id, role: "user", content: "3" });
    expect((await conversations.list(db)).map((c) => c.title)).toEqual(["A", "B", "Leer"]);
    expect((await conversations.list(db, { limit: 1, offset: 1 })).map((c) => c.id)).toEqual([
      b.id,
    ]);
    expect((await conversations.get(db, a.id))?.lastMessageAt).toBeDefined();
    expect((await conversations.get(db, leer.id))?.lastMessageAt).toBeUndefined();
  });

  it("Schleusen-Modus setzen und auf Standard zurücksetzen", async () => {
    const c = await conversations.create(db, { botId, title: "S", schleuseMode: "on" });
    expect(c.schleuseMode).toBe("on");
    expect((await conversations.setSchleuseMode(db, c.id, null))?.schleuseMode).toBeUndefined();
  });

  it("Löschen räumt Nachrichten, Läufe und Ereignisse ab; Belege bleiben", async () => {
    const c = await conversations.create(db, { botId, title: "Weg" });
    const andere = await conversations.create(db, { botId, title: "Bleibt" });
    const m = await messages.insert(db, { conversationId: c.id, role: "user", content: "Hallo" });
    await messages.insert(db, { conversationId: andere.id, role: "user", content: "Bleibt" });
    const lauf = await runs.create(db, { conversationId: c.id, triggerMessageId: m.id, botId });
    await events.append(db, { conversationId: c.id, type: "run.queued", data: { runId: lauf.id } });
    await events.append(db, {
      conversationId: c.id,
      type: "run.started",
      data: { runId: lauf.id },
    });
    await events.append(db, {
      conversationId: andere.id,
      type: "run.queued",
      data: { runId: newId("run") },
    });

    const [schluessel] = await db.insert(installationKeys).values(keyRow()).returning();
    if (schluessel === undefined) throw new Error("Schlüssel fehlt");
    const beleg = belegRow(schluessel.id, {
      seq: 1,
      prevHash: ZERO_PREV,
      type: "decision",
      conversationId: c.id,
    });
    await db.insert(belege).values(beleg);

    expect(await conversations.remove(db, c.id)).toBe(true);
    expect(await conversations.remove(db, c.id)).toBe(false);

    expect(
      await db.select().from(nachrichtenTabelle).where(eq(nachrichtenTabelle.conversationId, c.id)),
    ).toEqual([]);
    expect(
      await db.select().from(laeufeTabelle).where(eq(laeufeTabelle.conversationId, c.id)),
    ).toEqual([]);
    expect(
      await db.select().from(conversationEvents).where(eq(conversationEvents.conversationId, c.id)),
    ).toEqual([]);
    // Die andere Unterhaltung ist unberührt.
    expect(await messages.listForConversation(db, andere.id)).toHaveLength(1);
    expect(await events.lastSeq(db, andere.id)).toBe(1);
    // Der Beleg bleibt, ohne Fremdschlüssel auf die Unterhaltung.
    const bleibt = await db.select().from(belege);
    expect(bleibt).toHaveLength(1);
    expect(bleibt[0]?.conversationId).toBe(c.id);
  });
});

describe("messages", () => {
  let db: Database;
  let botId: ReturnType<typeof newId<"bot">>;
  let conversationId: ReturnType<typeof newId<"conversation">>;
  beforeEach(async () => {
    db = (await createTestDb()).db;
    botId = (await bots.create(db, { name: "Pai", avatarShape: "blatt", color: "blau" })).id;
    conversationId = (await conversations.create(db, { botId, title: "U" })).id;
  });

  it("fügt an und setzt lastMessageAt", async () => {
    const m = await messages.insert(db, { conversationId, role: "user", content: "Hallo" });
    expect(m).toMatchObject({ role: "user", content: "Hallo", status: "complete" });
    expect(m).not.toHaveProperty("runId");
    expect(await messages.get(db, m.id)).toEqual(m);
    expect((await conversations.get(db, conversationId))?.lastMessageAt).toBe(m.createdAt);
  });

  it("weist eine Nachricht in unbekannter Unterhaltung ab", async () => {
    await expect(
      messages.insert(db, { conversationId: newId("conversation"), role: "user", content: "x" }),
    ).rejects.toEqual(mitCode("nicht_gefunden"));
  });

  it("Nachrichten derselben Transaktion bleiben in Einfüge-Reihenfolge", async () => {
    await withTransaction(db, async (tx) => {
      for (let i = 0; i < 20; i++) {
        await messages.insert(tx, {
          conversationId,
          role: i % 2 === 0 ? "user" : "assistant",
          content: String(i),
        });
      }
    });
    const liste = await messages.listForConversation(db, conversationId);
    expect(liste.map((m) => m.content)).toEqual(Array.from({ length: 20 }, (_, i) => String(i)));
  });

  it("listet mit limit die letzten Nachrichten, aufsteigend", async () => {
    for (let i = 0; i < 5; i++)
      await messages.insert(db, { conversationId, role: "user", content: String(i) });
    expect(
      (await messages.listForConversation(db, conversationId, { limit: 2 })).map((m) => m.content),
    ).toEqual(["3", "4"]);
  });

  it("finalize schließt eine streamende Antwort ab, aber nur einmal", async () => {
    const m = await messages.insert(db, {
      conversationId,
      role: "assistant",
      status: "streaming",
    });
    expect(m.content).toBe("");
    const fertig = await messages.finalize(db, m.id, {
      status: "complete",
      content: "Antwort",
      route: "direct",
      tokensIn: 10,
      tokensOut: 20,
    });
    expect(fertig).toMatchObject({
      status: "complete",
      content: "Antwort",
      route: "direct",
      tokensIn: 10,
      tokensOut: 20,
    });
    await expect(
      messages.finalize(db, m.id, { status: "failed", content: "", errorCode: "intern" }),
    ).rejects.toBeInstanceOf(StatuswechselError);
    expect((await messages.get(db, m.id))?.content).toBe("Antwort");
    await expect(
      messages.finalize(db, newId("message"), { status: "complete", content: "x" }),
    ).rejects.toEqual(mitCode("nicht_gefunden"));
  });

  it("speichert Fehlercode und Herkunft einer abgebrochenen Antwort", async () => {
    const m = await messages.insert(db, { conversationId, role: "assistant", status: "streaming" });
    const f = await messages.finalize(db, m.id, {
      status: "failed",
      content: "Teil",
      errorCode: "anbieter_nicht_erreichbar",
    });
    expect(f).toMatchObject({ status: "failed", errorCode: "anbieter_nicht_erreichbar" });
  });
});
