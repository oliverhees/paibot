/**
 * PaiBot – Tests: Nachrichten mit Schritt und Herkunft anlegen und nur die Antworten lesen (ohne
 * Zwischentexte eines Laufs mit Werkzeugen).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { type ConversationId, type MessageId, messageSchema, type RunId } from "@paibot/shared";
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../client";
import { createTestDb } from "../testing";
import { bots, conversations, messages, runs } from "./index";

describe("Nachrichten mit Schritten", () => {
  let db: Database;
  let conversationId: ConversationId;
  let botId: Awaited<ReturnType<typeof bots.create>>["id"];
  const text = new Map<MessageId, string>();

  beforeEach(async () => {
    db = (await createTestDb()).db;
    botId = (await bots.create(db, { name: "Pai", avatarShape: "blatt", color: "blau" })).id;
    conversationId = (await conversations.create(db, { botId, title: "Schritte" })).id;
    text.clear();
  });

  async function nachricht(
    content: string,
    extra: { role?: "user" | "assistant"; runId?: RunId; step?: number } = {},
  ) {
    const m = await messages.insert(db, {
      conversationId,
      role: extra.role ?? "assistant",
      content,
      ...(extra.runId === undefined ? {} : { runId: extra.runId }),
      ...(extra.step === undefined ? {} : { step: extra.step }),
    });
    text.set(m.id, content);
    return m;
  }

  /** Drei Fragen, drei End-Antworten, vier Zwischentexte (zwei im ersten Lauf). */
  async function verlauf() {
    for (const [n, schritte] of [
      [1, 2],
      [2, 1],
      [3, 1],
    ] as const) {
      const frage = await nachricht(`f${n}`, { role: "user" });
      const lauf = await runs.create(db, { conversationId, triggerMessageId: frage.id, botId });
      for (let step = 0; step < schritte; step++) {
        await nachricht(`z${n}.${step}`, { runId: lauf.id, step });
      }
      await nachricht(`a${n}`, { runId: lauf.id });
      await runs.markRunning(db, lauf.id);
      await runs.finish(db, lauf.id, { status: "succeeded" });
    }
  }

  const inhalte = (liste: { content: string }[]) => liste.map((m) => m.content);

  it("nurAntworten: nur Nachrichten ohne Schritt; limit zählt nur diese", async () => {
    await verlauf();
    expect(
      inhalte(await messages.listForConversation(db, conversationId, { nurAntworten: true })),
    ).toEqual(["f1", "a1", "f2", "a2", "f3", "a3"]);
    expect(
      inhalte(
        await messages.listForConversation(db, conversationId, { nurAntworten: true, limit: 4 }),
      ),
    ).toEqual(["f2", "a2", "f3", "a3"]);
  });

  it("ohne Option wie bisher: alle Nachrichten, Zwischentexte mit Schritt", async () => {
    await verlauf();
    const alle = await messages.listForConversation(db, conversationId);
    expect(inhalte(alle)).toEqual([
      "f1",
      "z1.0",
      "z1.1",
      "a1",
      "f2",
      "z2.0",
      "a2",
      "f3",
      "z3.0",
      "a3",
    ]);
    expect(alle.filter((m) => m.step !== undefined).map((m) => m.step)).toEqual([0, 1, 0, 0]);
    expect(inhalte(await messages.listForConversation(db, conversationId, { limit: 4 }))).toEqual([
      "a2",
      "f3",
      "z3.0",
      "a3",
    ]);
  });

  it("Schritt und Herkunft werden gespeichert und gelesen", async () => {
    const frage = await nachricht("f", { role: "user" });
    const lauf = await runs.create(db, { conversationId, triggerMessageId: frage.id, botId });
    const fest = await messages.insert(db, {
      conversationId,
      role: "assistant",
      content: "Ich schaue in der Doku nach.",
      runId: lauf.id,
      step: 0,
      origin: "fest",
    });
    expect(fest).toMatchObject({ step: 0, origin: "fest" });
    expect(await messages.get(db, fest.id)).toEqual(fest);
    expect(messageSchema.safeParse(fest).success).toBe(true);
    expect(frage.origin).toBe("modell");
    expect(frage).not.toHaveProperty("step");
  });
  // Gegenprobe: `untrusted` in `finalize` nicht in den Schreibvorgang übernehmen → die Antwort bleibt ohne Kennzeichen.
  it("finalize setzt das Kennzeichen „fremder Inhalt“ im selben Schreibvorgang, nur wenn verlangt", async () => {
    const neueAntwort = async () => {
      // Je Antwort eine eigene Unterhaltung: In einer läuft immer nur ein Lauf.
      const eigene = (await conversations.create(db, { botId, title: "Kennzeichen" })).id;
      const frage = await messages.insert(db, {
        conversationId: eigene,
        role: "user",
        content: "f",
      });
      const lauf = await runs.create(db, {
        conversationId: eigene,
        triggerMessageId: frage.id,
        botId,
      });
      return messages.insert(db, {
        conversationId: eigene,
        role: "assistant",
        status: "streaming",
        content: "",
        runId: lauf.id,
      });
    };
    const mit = await neueAntwort();
    const ohne = await neueAntwort();
    await messages.finalize(db, mit.id, { status: "complete", content: "a", untrusted: true });
    await messages.finalize(db, ohne.id, { status: "complete", content: "b" });
    expect(await messages.anyUntrusted(db, [mit.id])).toBe(true);
    expect(await messages.anyUntrusted(db, [ohne.id])).toBe(false);
  });

  // Gegenprobe: `untrusted` in `toMessage` nicht übernehmen → die Nachricht trägt das Kennzeichen nicht.
  it("die Nachricht aus der Datenbank trägt das Kennzeichen „fremder Inhalt“ nur, wenn es gesetzt ist", async () => {
    const eigene = (await conversations.create(db, { botId, title: "Kennzeichen sichtbar" })).id;
    const frage = await messages.insert(db, { conversationId: eigene, role: "user", content: "f" });
    const lauf = await runs.create(db, {
      conversationId: eigene,
      triggerMessageId: frage.id,
      botId,
    });
    const antwort = await messages.insert(db, {
      conversationId: eigene,
      role: "assistant",
      status: "streaming",
      content: "",
      runId: lauf.id,
    });
    expect(antwort).not.toHaveProperty("untrusted");
    const fertig = await messages.finalize(db, antwort.id, {
      status: "complete",
      content: "a",
      untrusted: true,
    });
    expect(fertig).toMatchObject({ untrusted: true });
    expect(await messages.get(db, antwort.id)).toMatchObject({ untrusted: true });
    expect(messageSchema.safeParse(await messages.get(db, antwort.id)).success).toBe(true);
    // Die Frage der Person hat es nie.
    expect(await messages.get(db, frage.id)).not.toHaveProperty("untrusted");
  });
});
