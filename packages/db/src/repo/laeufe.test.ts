/**
 * PaiBot – Tests: Läufe (ein aktiver Lauf je Unterhaltung, erlaubte Statuswechsel, Herzschlag).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { newId, RUN_STATUSES, type RunStatus } from "@paibot/shared";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "../client";
import { runs as laeufeTabelle } from "../schema";
import { createTestDb } from "../testing";
import { StatuswechselError } from "./fehler";
import { bots, conversations, messages, runs } from "./index";
import { RUN_TRANSITIONS } from "./laeufe";
import { mitCode } from "./testhilfe";

const T0 = new Date("2026-11-20T10:00:00.000Z");
const nach = (basis: Date, ms: number) => new Date(basis.getTime() + ms);

describe("runs", () => {
  let db: Database;
  let botId: ReturnType<typeof newId<"bot">>;
  let conversationId: ReturnType<typeof newId<"conversation">>;
  let triggerMessageId: ReturnType<typeof newId<"message">>;

  beforeEach(async () => {
    db = (await createTestDb()).db;
    botId = (await bots.create(db, { name: "Pai", avatarShape: "blatt", color: "blau" })).id;
    conversationId = (await conversations.create(db, { botId, title: "U" })).id;
    triggerMessageId = (await messages.insert(db, { conversationId, role: "user", content: "Hi" }))
      .id;
  });

  const anlegen = (cid = conversationId) =>
    runs.create(db, { conversationId: cid, triggerMessageId, botId });

  it("legt einen Lauf in der Warteschlange an", async () => {
    const lauf = await anlegen();
    expect(lauf).toMatchObject({ conversationId, triggerMessageId, botId, status: "queued" });
    expect(lauf).not.toHaveProperty("startedAt");
    expect(await runs.get(db, lauf.id)).toEqual(lauf);
    expect((await runs.getActive(db, conversationId))?.id).toBe(lauf.id);
  });

  type LaufId = ReturnType<typeof newId<"run">>;
  async function laufend(id: LaufId) {
    await runs.markRunning(db, id);
  }
  async function wartend(id: LaufId) {
    await runs.markRunning(db, id);
    await runs.markWaiting(db, id);
  }

  it.each([
    ["queued", async (_id: LaufId) => undefined],
    ["running", laufend],
    ["waiting_approval", wartend],
  ])(
    "ein zweiter aktiver Lauf wird abgewiesen, solange der erste %s ist",
    async (status, bringeIn) => {
      const erster = await anlegen();
      await bringeIn(erster.id);
      expect((await runs.get(db, erster.id))?.status).toBe(status);
      await expect(anlegen()).rejects.toEqual(mitCode("lauf_aktiv"));
      expect(await runs.listForConversation(db, conversationId)).toHaveLength(1);
    },
  );

  it("nach dem Ende ist ein neuer Lauf erlaubt; andere Unterhaltungen sind unabhängig", async () => {
    const erster = await anlegen();
    const andere = (await conversations.create(db, { botId, title: "Andere" })).id;
    await anlegen(andere);
    await runs.markRunning(db, erster.id);
    await runs.finish(db, erster.id, { status: "succeeded" });
    const zweiter = await anlegen();
    expect(zweiter.id).not.toBe(erster.id);
    expect((await runs.getActive(db, conversationId))?.id).toBe(zweiter.id);
  });

  it("parallele Versuche: genau einer gewinnt", async () => {
    const ergebnisse = await Promise.allSettled(Array.from({ length: 6 }, () => anlegen()));
    expect(ergebnisse.filter((e) => e.status === "fulfilled")).toHaveLength(1);
    for (const e of ergebnisse) {
      if (e.status === "rejected") expect(e.reason).toEqual(mitCode("lauf_aktiv"));
    }
  });

  it("unbekannte Unterhaltung oder Nachricht: nicht_gefunden", async () => {
    await expect(anlegen(newId("conversation"))).rejects.toEqual(mitCode("nicht_gefunden"));
  });

  it("markRunning setzt Start und Herzschlag", async () => {
    const lauf = await anlegen();
    const l = await runs.markRunning(db, lauf.id, { now: T0 });
    expect(l).toMatchObject({
      status: "running",
      startedAt: T0.toISOString(),
      heartbeatAt: T0.toISOString(),
    });
  });

  it("finish setzt Ende und Fehlercode", async () => {
    const lauf = await anlegen();
    await runs.markRunning(db, lauf.id);
    const l = await runs.finish(db, lauf.id, {
      status: "failed",
      errorCode: "anbieter_nicht_erreichbar",
      now: T0,
    });
    expect(l).toMatchObject({
      status: "failed",
      errorCode: "anbieter_nicht_erreichbar",
      finishedAt: T0.toISOString(),
    });
  });

  it("erlaubt genau die Wege der Übergangstabelle, alles andere wird abgewiesen", async () => {
    const stati = [...RUN_STATUSES] as RunStatus[];
    for (const von of stati) {
      for (const nach of stati) {
        const erlaubt = RUN_TRANSITIONS[nach].includes(von);
        // Frischer Lauf je Paar in eigener Unterhaltung.
        const cid = (await conversations.create(db, { botId, title: `${von}>${nach}` })).id;
        const lauf = await runs.create(db, { conversationId: cid, triggerMessageId, botId });
        // `von` herstellen (direkt in der Tabelle, der Ablauf darum geht es hier nicht).
        await db.update(laeufeTabelle).set({ status: von }).where(eq(laeufeTabelle.id, lauf.id));
        const versuch = wechsle(lauf.id, nach);
        if (erlaubt) {
          expect((await versuch).status).toBe(nach);
        } else {
          await expect(versuch).rejects.toBeInstanceOf(StatuswechselError);
          expect((await runs.get(db, lauf.id))?.status).toBe(von);
        }
      }
    }
  }, 120_000);

  function wechsle(id: ReturnType<typeof newId<"run">>, ziel: RunStatus) {
    switch (ziel) {
      case "running":
        return runs.markRunning(db, id);
      case "waiting_approval":
        return runs.markWaiting(db, id);
      case "queued":
        // „queued“ ist nie ein Ziel: es gibt keine Funktion, die dorthin wechselt.
        return Promise.reject(new StatuswechselError("lauf", id, "?", "queued"));
      default:
        return runs.finish(db, id, { status: ziel });
    }
  }

  it("typische unerlaubte Wechsel werden mit StatuswechselError abgewiesen", async () => {
    const lauf = await anlegen();
    await expect(runs.finish(db, lauf.id, { status: "succeeded" })).rejects.toBeInstanceOf(
      StatuswechselError,
    );
    await expect(runs.markWaiting(db, lauf.id)).rejects.toBeInstanceOf(StatuswechselError);
    await runs.markRunning(db, lauf.id);
    await runs.finish(db, lauf.id, { status: "cancelled" });
    await expect(runs.markRunning(db, lauf.id)).rejects.toBeInstanceOf(StatuswechselError);
    await expect(runs.finish(db, lauf.id, { status: "failed" })).rejects.toBeInstanceOf(
      StatuswechselError,
    );
    await expect(runs.markRunning(db, newId("run"))).rejects.toEqual(mitCode("nicht_gefunden"));
    expect((await runs.get(db, lauf.id))?.status).toBe("cancelled");
  });

  it("Herzschlag gilt nur für laufende Läufe", async () => {
    const lauf = await anlegen();
    expect(await runs.heartbeat(db, lauf.id, { now: T0 })).toBe(false);
    await runs.markRunning(db, lauf.id, { now: T0 });
    expect(await runs.heartbeat(db, lauf.id, { now: nach(T0, 5000) })).toBe(true);
    expect((await runs.get(db, lauf.id))?.heartbeatAt).toBe(nach(T0, 5000).toISOString());
    await runs.finish(db, lauf.id, { status: "succeeded" });
    expect(await runs.heartbeat(db, lauf.id)).toBe(false);
  });

  it("Abbruchwunsch wird nur beim ersten Mal gemerkt und nur für aktive Läufe", async () => {
    const lauf = await anlegen();
    const a = await runs.requestCancel(db, lauf.id, { now: T0 });
    expect(a?.cancelRequestedAt).toBe(T0.toISOString());
    const b = await runs.requestCancel(db, lauf.id, { now: nach(T0, 9000) });
    expect(b?.cancelRequestedAt).toBe(T0.toISOString());
    await runs.markRunning(db, lauf.id);
    await runs.finish(db, lauf.id, { status: "cancelled" });
    expect(await runs.requestCancel(db, lauf.id)).toBeUndefined();
    expect(await runs.requestCancel(db, newId("run"))).toBeUndefined();
  });

  it("findStale findet standardmäßig nur laufende Läufe ohne Herzschlag, auf Wunsch auch alte in der Warteschlange, nie wartende", async () => {
    const ids = [] as ReturnType<typeof newId<"run">>[];
    const neueUnterhaltung = async () =>
      (await conversations.create(db, { botId, title: String(ids.length) })).id;
    const mach = async () =>
      (await runs.create(db, { conversationId: await neueUnterhaltung(), triggerMessageId, botId }))
        .id;

    const frisch = await mach();
    await runs.markRunning(db, frisch, { now: T0 });
    await runs.heartbeat(db, frisch, { now: nach(T0, 100_000) });
    const alt = await mach();
    await runs.markRunning(db, alt, { now: T0 });
    const wartend = await mach();
    await runs.markRunning(db, wartend, { now: T0 });
    await runs.markWaiting(db, wartend);
    const fertig = await mach();
    await runs.markRunning(db, fertig, { now: T0 });
    await runs.finish(db, fertig, { status: "succeeded" });
    const inSchlange = await mach();

    const grenze = nach(T0, 60_000);
    const stale = await runs.findStale(db, { before: grenze });
    expect(stale.map((r) => r.id)).toEqual([alt]);

    expect(runs.STALE_RUN_STATUSES_DEFAULT).toEqual(["running"]);
    const spaeter = await runs.findStale(db, { before: new Date(Date.now() + 60_000) });
    expect(spaeter.map((r) => r.id).sort()).toEqual([alt, frisch].sort());

    const mitSchlange = await runs.findStale(db, {
      before: new Date(Date.now() + 60_000),
      statuses: ["queued", "running"],
    });
    expect(mitSchlange.map((r) => r.id).sort()).toEqual([alt, frisch, inSchlange].sort());
    expect(
      (await runs.findStale(db, { before: grenze, statuses: ["queued"] })).map((r) => r.id),
    ).toEqual([]);
    expect(await runs.findStale(db, { before: grenze, statuses: [] })).toEqual([]);
    void wartend;
  });

  it("resume beendet den wartenden Lauf und legt einen neuen mit resumesRunId an", async () => {
    const lauf = await anlegen();
    await runs.markRunning(db, lauf.id);
    await runs.markWaiting(db, lauf.id);
    const neu = await runs.resume(db, lauf.id);
    expect(neu).toMatchObject({
      status: "queued",
      resumesRunId: lauf.id,
      conversationId,
      botId,
      triggerMessageId,
    });
    expect((await runs.get(db, lauf.id))?.status).toBe("succeeded");
    expect((await runs.getActive(db, conversationId))?.id).toBe(neu.id);
  });

  it("resume nur aus waiting_approval; bei Fehlern bleibt alles wie es war", async () => {
    const lauf = await anlegen();
    await expect(runs.resume(db, lauf.id)).rejects.toBeInstanceOf(StatuswechselError);
    await expect(runs.resume(db, newId("run"))).rejects.toEqual(mitCode("nicht_gefunden"));
    expect((await runs.get(db, lauf.id))?.status).toBe("queued");
    expect(await runs.listForConversation(db, conversationId)).toHaveLength(1);
  });
});
