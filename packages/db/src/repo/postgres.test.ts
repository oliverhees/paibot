/**
 * PaiBot – Tests gegen einen echten Postgres-Server (nur mit PAIBOT_TEST_DATABASE_URL): echte Parallelität bei Nummern, Läufen, Zählern und Meldungen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { EVENT_NOTIFY_CHANNEL, newId } from "@paibot/shared";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb } from "../client";
import { runMigrations } from "../migrate";
import { MIGRATIONS_FOLDER } from "../testing";
import { bots, conversations, events, messages, rateLimit, runs } from "./index";
import { mitCode } from "./testhilfe";

const URL_ENV = process.env.PAIBOT_TEST_DATABASE_URL;

/** Adresse derselben Instanz mit anderem Datenbanknamen. */
function mitDatenbank(adresse: string, name: string): string {
  const url = new URL(adresse);
  url.pathname = `/${name}`;
  return url.toString();
}

describe.skipIf(URL_ENV === undefined)("Zugriffsfunktionen gegen echtes Postgres", () => {
  const name = `paibot_test_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
  let verwaltung: postgres.Sql;
  let sql: postgres.Sql;
  let db: ReturnType<typeof createDb>["db"];
  let botId: ReturnType<typeof newId<"bot">>;

  beforeAll(async () => {
    if (URL_ENV === undefined) return;
    verwaltung = postgres(URL_ENV, { max: 1 });
    await verwaltung.unsafe(`create database ${name}`);
    const adresse = mitDatenbank(URL_ENV, name);
    await runMigrations(adresse, MIGRATIONS_FOLDER);
    ({ db, sql } = createDb(adresse));
    botId = (await bots.create(db, { name: "Pai", avatarShape: "blatt", color: "blau" })).id;
  });

  afterAll(async () => {
    if (URL_ENV === undefined) return;
    await sql?.end({ timeout: 2 });
    await verwaltung?.unsafe(`drop database if exists ${name} with (force)`);
    await verwaltung?.end({ timeout: 2 });
  });

  it("Ereignis-Nummern sind bei echter Parallelität lückenlos und eindeutig", async () => {
    const ids = await Promise.all(
      [1, 2, 3].map(async (i) => (await conversations.create(db, { botId, title: `U${i}` })).id),
    );
    const ergebnisse = await Promise.all(
      Array.from({ length: 60 }, (_, i) =>
        events.append(db, {
          conversationId: ids[i % 3] ?? ids[0] ?? newId("conversation"),
          type: "run.queued",
          data: { runId: newId("run") },
        }),
      ),
    );
    for (const id of ids) {
      const nummern = ergebnisse
        .filter((e) => e.conversationId === id)
        .map((e) => e.seq)
        .sort((a, b) => a - b);
      expect(nummern).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
      expect((await events.listSince(db, id)).map((e) => e.seq)).toEqual(nummern);
    }
  });

  it("paralleles Anhängen und Nachrichten-Einfügen in derselben Unterhaltung blockiert sich nicht", async () => {
    const id = (await conversations.create(db, { botId, title: "Gemischt" })).id;
    await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        i % 2 === 0
          ? events.append(db, {
              conversationId: id,
              type: "run.queued",
              data: { runId: newId("run") },
            })
          : messages.insert(db, { conversationId: id, role: "user", content: String(i) }),
      ),
    );
    expect(await events.lastSeq(db, id)).toBe(15);
    expect(await messages.listForConversation(db, id)).toHaveLength(15);
  });

  it("zwei Läufe gleichzeitig: genau einer wird angenommen", async () => {
    const id = (await conversations.create(db, { botId, title: "Lauf" })).id;
    const m = await messages.insert(db, { conversationId: id, role: "user", content: "Hi" });
    const ergebnisse = await Promise.allSettled(
      Array.from({ length: 8 }, () =>
        runs.create(db, { conversationId: id, triggerMessageId: m.id, botId }),
      ),
    );
    expect(ergebnisse.filter((e) => e.status === "fulfilled")).toHaveLength(1);
    for (const e of ergebnisse) {
      if (e.status === "rejected") expect(e.reason).toEqual(mitCode("lauf_aktiv"));
    }
  });

  it("das Rate-Limit zählt bei echter Parallelität nichts doppelt", async () => {
    const eingabe = { key: "anmelden:ip:198.51.100.9", max: 1000, windowSeconds: 3600 };
    const ergebnisse = await Promise.all(
      Array.from({ length: 50 }, () => rateLimit.hit(db, eingabe)),
    );
    expect(ergebnisse.map((r) => r.count).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 50 }, (_, i) => i + 1),
    );
  });

  it("NOTIFY erreicht einen Zuhörer auf dem Kanal, mit der Unterhaltungs-ID", async () => {
    const id = (await conversations.create(db, { botId, title: "Meldung" })).id;
    const empfangen: string[] = [];
    const zuhoerer = await sql.listen(EVENT_NOTIFY_CHANNEL, (payload) => {
      empfangen.push(payload);
    });
    try {
      await events.append(db, {
        conversationId: id,
        type: "run.queued",
        data: { runId: newId("run") },
      });
      for (let i = 0; i < 50 && empfangen.length === 0; i++) {
        await new Promise((r) => setTimeout(r, 20));
      }
      expect(empfangen).toEqual([id]);
    } finally {
      await zuhoerer.unlisten();
    }
  });
  it("Zeitpunkte als Parameter: veraltete Läufe, Abbruchwunsch und Herzschlag mit postgres-js", async () => {
    const id = (await conversations.create(db, { botId, title: "Zeit" })).id;
    const m = await messages.insert(db, { conversationId: id, role: "user", content: "Hi" });
    const lauf = await runs.create(db, { conversationId: id, triggerMessageId: m.id, botId });
    const alt = new Date(Date.now() - 3_600_000);
    await runs.markRunning(db, lauf.id, { now: alt });
    expect(await runs.heartbeat(db, lauf.id, { now: alt })).toBe(true);

    const stale = await runs.findStale(db, { before: new Date(Date.now() - 60_000) });
    expect(stale.map((r) => r.id)).toContain(lauf.id);
    const frueher = await runs.findStale(db, {
      before: new Date(alt.getTime() - 60_000),
      statuses: ["queued", "running"],
    });
    expect(frueher.map((r) => r.id)).not.toContain(lauf.id);

    const abbruch = await runs.requestCancel(db, lauf.id, { now: new Date() });
    expect(abbruch?.cancelRequestedAt).toBeDefined();
    await runs.finish(db, lauf.id, { status: "cancelled", now: new Date() });
  });

  it("Token seit einem Zeitpunkt: nur Antworten des Bots, Zeitpunkt als Parameter mit postgres-js", async () => {
    const id = (await conversations.create(db, { botId, title: "Token" })).id;
    const vorher = await messages.tokensSince(db, new Date(Date.now() - 60_000));
    await messages.insert(db, { conversationId: id, role: "user", content: "Hi" });
    await messages.insert(db, {
      conversationId: id,
      role: "assistant",
      content: "Hallo",
      status: "complete",
      tokensIn: 120,
      tokensOut: 30,
    });
    await messages.insert(db, {
      conversationId: id,
      role: "assistant",
      content: "Nur Ausgabe",
      status: "complete",
      tokensOut: 5,
    });
    expect(await messages.tokensSince(db, new Date(Date.now() - 60_000))).toBe(vorher + 155);
    expect(await messages.tokensSince(db, new Date(Date.now() + 60_000))).toBe(0);
  });
});
