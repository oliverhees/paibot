/**
 * PaiBot – Tests: Ereignis-Strom (laufende Nummer, Meldung, Lesen ab Nummer, Aufräumen).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { PGlite } from "@electric-sql/pglite";
import { EVENT_NOTIFY_CHANNEL, newId } from "@paibot/shared";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../client";
import { conversationEvents } from "../schema";
import { createTestDb } from "../testing";
import { bots, conversations, events, messages, runs, withTransaction } from "./index";
import { mitCode } from "./testhilfe";

type ConversationId = ReturnType<typeof newId<"conversation">>;

describe("events", () => {
  let db: Database;
  let client: PGlite;
  let botId: ReturnType<typeof newId<"bot">>;
  let cid: ConversationId;

  beforeEach(async () => {
    ({ db, client } = await createTestDb());
    botId = (await bots.create(db, { name: "Pai", avatarShape: "blatt", color: "blau" })).id;
    cid = (await conversations.create(db, { botId, title: "U" })).id;
  });

  const queued = (conversationId: ConversationId = cid) =>
    events.append(db, { conversationId, type: "run.queued", data: { runId: newId("run") } });

  it("vergibt Nummern ab 1 ohne Lücke, je Unterhaltung getrennt", async () => {
    const andere = (await conversations.create(db, { botId, title: "V" })).id;
    expect((await queued()).seq).toBe(1);
    expect((await queued()).seq).toBe(2);
    expect((await queued(andere)).seq).toBe(1);
    expect((await queued()).seq).toBe(3);
    expect(await events.lastSeq(db, cid)).toBe(3);
    expect(await events.lastSeq(db, andere)).toBe(1);
    expect(await events.lastSeq(db, newId("conversation"))).toBe(0);
  });

  it("gibt das Ereignis in der Form der Verträge zurück und übernimmt runId aus den Daten", async () => {
    const runId = newId("run");
    const e = await events.append(db, {
      conversationId: cid,
      type: "run.started",
      data: { runId },
    });
    expect(e).toMatchObject({
      conversationId: cid,
      seq: 1,
      type: "run.started",
      runId,
      data: { runId },
    });
    expect(e.time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    const ohneLauf = await events.append(db, {
      conversationId: cid,
      type: "message.created",
      data: { messageId: newId("message"), role: "user", text: "Hallo" },
    });
    expect(ohneLauf).not.toHaveProperty("runId");
  });

  it("ist bei parallelem Anhängen lückenlos und eindeutig", async () => {
    const andere = (await conversations.create(db, { botId, title: "V" })).id;
    const ergebnisse = await Promise.all(
      Array.from({ length: 40 }, (_, i) => queued(i % 2 === 0 ? cid : andere)),
    );
    for (const id of [cid, andere]) {
      const nummern = ergebnisse
        .filter((e) => e.conversationId === id)
        .map((e) => e.seq)
        .sort((a, b) => a - b);
      expect(nummern).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
      const gelesen = await events.listSince(db, id);
      expect(gelesen.map((e) => e.seq)).toEqual(nummern);
    }
  });

  it("weist ungültige Daten ab und schreibt nichts", async () => {
    await expect(
      events.append(db, {
        conversationId: cid,
        type: "text.delta",
        data: { runId: newId("run"), messageId: newId("message"), text: "" },
      }),
    ).rejects.toEqual(mitCode("eingabe_ungueltig"));
    await expect(
      events.append(db, {
        conversationId: cid,
        type: "run.queued",
        data: { runId: "kein-lauf" } as never,
      }),
    ).rejects.toEqual(mitCode("eingabe_ungueltig"));
    expect(await events.lastSeq(db, cid)).toBe(0);
  });

  it("unbekannte Unterhaltung: nicht_gefunden", async () => {
    await expect(queued(newId("conversation"))).rejects.toEqual(mitCode("nicht_gefunden"));
  });

  it("liest ab einer Nummer, mit Begrenzung, aufsteigend", async () => {
    for (let i = 0; i < 6; i++) await queued();
    expect((await events.listSince(db, cid)).map((e) => e.seq)).toEqual([1, 2, 3, 4, 5, 6]);
    expect((await events.listSince(db, cid, { afterSeq: 4 })).map((e) => e.seq)).toEqual([5, 6]);
    expect((await events.listSince(db, cid, { afterSeq: 1, limit: 2 })).map((e) => e.seq)).toEqual([
      2, 3,
    ]);
    expect(await events.listSince(db, cid, { afterSeq: 6 })).toEqual([]);
  });

  it("eine zurückgenommene Transaktion hinterlässt weder Ereignis noch Lücke", async () => {
    await queued();
    await expect(
      withTransaction(db, async (tx) => {
        await events.append(tx, {
          conversationId: cid,
          type: "run.queued",
          data: { runId: newId("run") },
        });
        throw new Error("zurück");
      }),
    ).rejects.toThrow("zurück");
    expect((await queued()).seq).toBe(2);
  });

  it("meldet jedes Ereignis auf dem Kanal, erst nach dem Bestätigen", async () => {
    const empfangen: string[] = [];
    const abmelden = await client.listen(EVENT_NOTIFY_CHANNEL, (payload) => {
      empfangen.push(payload);
    });
    try {
      await queued();
      await queued();
      await new Promise((r) => setTimeout(r, 50));
      expect(empfangen).toEqual([cid, cid]);

      empfangen.length = 0;
      await expect(
        withTransaction(db, async (tx) => {
          await events.append(tx, {
            conversationId: cid,
            type: "run.queued",
            data: { runId: newId("run") },
          });
          throw new Error("zurück");
        }),
      ).rejects.toThrow();
      await new Promise((r) => setTimeout(r, 50));
      expect(empfangen).toEqual([]);

      await withTransaction(db, async (tx) => {
        await events.append(tx, {
          conversationId: cid,
          type: "run.queued",
          data: { runId: newId("run") },
        });
        expect(empfangen).toEqual([]);
      });
      await new Promise((r) => setTimeout(r, 50));
      expect(empfangen).toEqual([cid]);
    } finally {
      await abmelden();
    }
  });

  describe("pruneTextDeltas", () => {
    const alt = new Date("2026-01-01T00:00:00.000Z");

    async function delta(
      runId: ReturnType<typeof newId<"run">>,
      messageId: ReturnType<typeof newId<"message">>,
      zeit: Date,
    ) {
      const e = await events.append(db, {
        conversationId: cid,
        type: "text.delta",
        data: { runId, messageId, text: "x" },
      });
      // createdAt nachträglich setzen (Trigger verbietet UPDATE, daher kurz abschalten).
      await db.execute(
        sql`alter table conversation_events disable trigger ereignisse_nur_anhaengen`,
      );
      await db
        .update(conversationEvents)
        .set({ createdAt: zeit })
        .where(eq(conversationEvents.seq, e.seq));
      await db.execute(
        sql`alter table conversation_events enable trigger ereignisse_nur_anhaengen`,
      );
      return e;
    }

    it("löscht alte text.delta abgeschlossener Läufe, sonst nichts", async () => {
      const m = await messages.insert(db, { conversationId: cid, role: "user", content: "Hi" });
      const fertig = await runs.create(db, { conversationId: cid, triggerMessageId: m.id, botId });
      await runs.markRunning(db, fertig.id);
      await runs.finish(db, fertig.id, { status: "succeeded" });
      const msgId = newId("message");

      const altFertig = await delta(fertig.id, msgId, alt);
      const frischFertig = await delta(fertig.id, msgId, new Date());
      const andereAlt = await events.append(db, {
        conversationId: cid,
        type: "run.started",
        data: { runId: fertig.id },
      });
      await db.execute(
        sql`alter table conversation_events disable trigger ereignisse_nur_anhaengen`,
      );
      await db
        .update(conversationEvents)
        .set({ createdAt: alt })
        .where(eq(conversationEvents.seq, andereAlt.seq));
      await db.execute(
        sql`alter table conversation_events enable trigger ereignisse_nur_anhaengen`,
      );

      // Lauf ohne Abschluss: sein altes Delta bleibt.
      const aktiv = await runs.create(db, { conversationId: cid, triggerMessageId: m.id, botId });
      const altAktiv = await delta(aktiv.id, msgId, alt);

      const anzahl = await events.pruneTextDeltas(db, { now: new Date() });
      expect(anzahl).toBe(1);
      const rest = (await events.listSince(db, cid)).map((e) => e.seq);
      expect(rest).not.toContain(altFertig.seq);
      expect(rest).toEqual(expect.arrayContaining([frischFertig.seq, andereAlt.seq, altAktiv.seq]));
    });

    it("andere Ereignisse lassen sich nicht einzeln löschen (Trigger)", async () => {
      const e = await queued();
      await expect(
        db.delete(conversationEvents).where(eq(conversationEvents.seq, e.seq)),
      ).rejects.toThrow();
      expect(await events.lastSeq(db, cid)).toBe(1);
    });
  });
});
