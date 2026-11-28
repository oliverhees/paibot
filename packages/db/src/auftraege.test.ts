/**
 * PaiBot – Regeln der Datenbank für Aufträge (Migration 0020): Anfang, Entscheidung, Zettel,
 * Übergänge, Zähler, „belastet“, Nur-Anhängen von Ereignissen und Zuschlägen, Not-Aus-Epoche,
 * Autor und Inhalt der Nachrichten, Auftrag der Läufe und ein aktiver Lauf je Auftragsbaum.
 *
 * Jede Regel hat hier einen Test, der rot wird, sobald die Prüfung in der Migration fehlt (die
 * Gegenprobe steht jeweils als Kommentar über dem Test).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

import { type ActionId, type BotId, type ConversationId, newId } from "@paibot/shared";
import { beforeEach, describe, expect, it } from "vitest";
import { BelegKette } from "./apps-testhilfe";
import type { Database } from "./client";
import { createTestDb, type TestDb } from "./testing";

const RESTRICT = "23001";
const CHECK = "23514";
const NOT_NULL = "23502";
const EINDEUTIG = "23505";

async function codeOf(promise: PromiseLike<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    const e = error as { code?: string; cause?: { code?: string } };
    return e.code ?? e.cause?.code;
  }
}

let t: TestDb;
let kette: BelegKette;
let pai: BotId;
let zweiter: BotId;
let dritter: BotId;
let chat: ConversationId;
let chat2: ConversationId;

async function q(text: string, params: unknown[] = []) {
  return t.client.query<Record<string, unknown>>(text, params);
}

async function eins(text: string, params: unknown[] = []) {
  const r = await q(text, params);
  return r.rows[0] ?? {};
}

async function epoche(): Promise<number> {
  return Number((await eins("select notaus_epoche from settings")).notaus_epoche);
}

/** Erlaubte Nachricht des Besitzers in einer Unterhaltung (Entscheidung `nachricht.senden`). */
function nachrichtErlaubt(conversationId: ConversationId, outcome?: "allow" | "deny") {
  return kette.entscheidung({
    type: "nachricht.senden",
    target: { conversationId, messageId: newId("message") },
    facts: { credential: "sitzung" },
    ...(outcome === undefined ? {} : { outcome }),
  });
}

/** Erlaubte Übergabe eines Bots an einen anderen (Entscheidung `auftrag.uebergeben`). */
function uebergabeErlaubt(von: BotId, an: BotId, conversationId: ConversationId) {
  return kette.entscheidung({
    type: "auftrag.uebergeben",
    actor: `bot:${von}`,
    target: { conversationId, botId: von, toBotId: an },
    facts: {},
  });
}

async function wurzel(
  conversationId: ConversationId = chat,
  bot: BotId = pai,
  extra: { zettel?: string; actionId?: ActionId } = {},
): Promise<string> {
  const id = newId("auftrag");
  const actionId = extra.actionId ?? (await nachrichtErlaubt(conversationId));
  await q(
    `insert into auftraege (id, art, root_id, conversation_id, bot_id, geber, zettel, action_id, notaus_epoche)
     values ($1, 'wurzel', $1, $2, $3, 'besitzer', $4, $5, $6)`,
    [id, conversationId, bot, extra.zettel ?? "Bitte erledigen.", actionId, await epoche()],
  );
  return id;
}

async function uebergabe(
  parent: string,
  von: BotId,
  an: BotId,
  conversationId: ConversationId = chat,
): Promise<string> {
  const id = newId("auftrag");
  const root = (await eins("select root_id from auftraege where id = $1", [parent])).root_id;
  const actionId = await uebergabeErlaubt(von, an, conversationId);
  await q(
    `insert into auftraege (id, art, parent_auftrag_id, root_id, conversation_id, bot_id, geber, zettel, action_id, notaus_epoche)
     values ($1, 'uebergabe', $2, $3, $4, $5, $6, 'Teil-Aufgabe', $7, $8)`,
    [id, parent, root, conversationId, an, `bot:${von}`, actionId, await epoche()],
  );
  return id;
}

/** Legt einen Lauf zum Auftrag an (eigene Auslöser-Nachricht) und gibt seine Kennung zurück. */
async function lauf(
  auftrag: string,
  status: "queued" | "running" = "running",
  untrustedInput = false,
): Promise<string> {
  const a = await eins("select root_id, conversation_id, bot_id from auftraege where id = $1", [
    auftrag,
  ]);
  const nachricht = newId("message");
  await q(
    "insert into messages (id, conversation_id, role, content) values ($1, $2, 'user', 'los')",
    [nachricht, a.conversation_id],
  );
  const id = newId("run");
  await q(
    `insert into runs (id, conversation_id, trigger_message_id, bot_id, status, auftrag_id, auftrag_root_id, untrusted_input)
     values ($1, $2, $3, $4, 'queued', $5, $6, $7)`,
    [id, a.conversation_id, nachricht, a.bot_id, auftrag, a.root_id, untrustedInput],
  );
  if (status === "running") await q("update runs set status = 'running' where id = $1", [id]);
  return id;
}

async function laufEnde(run: string) {
  await q("update runs set status = 'succeeded', finished_at = now() where id = $1", [run]);
}

async function stand(auftrag: string, status: string, grund?: string) {
  const ende = ["fertig", "gescheitert", "abgelehnt", "abgebrochen"].includes(status);
  return q(
    `update auftraege set status = $2, finished_at = ${ende ? "now()" : "null"}, end_grund = $3 where id = $1`,
    [auftrag, status, grund ?? null],
  );
}

beforeEach(async () => {
  t = await createTestDb();
  kette = new BelegKette(t.db as unknown as Database);
  pai = newId("bot");
  zweiter = newId("bot");
  dritter = newId("bot");
  await q(
    `insert into bots (id, name, avatar_shape, color) values
      ($1, 'Pai', 'wabe', 'limette'), ($2, 'Zweiter', 'wabe', 'pink'), ($3, 'Dritter', 'wabe', 'pink')`,
    [pai, zweiter, dritter],
  );
  await q(
    `insert into settings (id, default_bot_id) values ('singleton', $1)
     on conflict (id) do update set default_bot_id = excluded.default_bot_id`,
    [pai],
  );
  chat = newId("conversation");
  chat2 = newId("conversation");
  await q(
    "insert into conversations (id, bot_id, title) values ($1, $2, 'Chat'), ($3, $4, 'Chat 2')",
    [chat, pai, chat2, zweiter],
  );
});

describe("Aufträge: Anfang und Entscheidung", () => {
  it("eine Wurzel mit erlaubter Nachricht entsteht als gefragt und schreibt ein Ereignis", async () => {
    const id = await wurzel();
    expect(
      await eins("select status, belastet, rueckfragen, bitten from auftraege where id = $1", [id]),
    ).toEqual({
      status: "gefragt",
      belastet: false,
      rueckfragen: 0,
      bitten: 0,
    });
    const ereignisse = await q(
      "select type, payload from auftrag_ereignisse where auftrag_id = $1",
      [id],
    );
    expect(ereignisse.rows).toHaveLength(1);
    expect(ereignisse.rows[0]).toMatchObject({ type: "auftrag.created" });
    // Ohne Inhalte: Der Zettel steht nicht im Ereignis.
    expect(JSON.stringify(ereignisse.rows[0])).not.toContain("Bitte erledigen");
  });

  // Gegenprobe: die Prüfung „beginnt als gefragt“ im Trigger entfernen → rot.
  it("ein Auftrag beginnt nie in einem anderen Stand oder mit Zählern", async () => {
    const actionId = await nachrichtErlaubt(chat);
    const id = newId("auftrag");
    expect(
      await codeOf(
        q(
          `insert into auftraege (id, art, root_id, conversation_id, bot_id, geber, action_id, notaus_epoche, status)
           values ($1, 'wurzel', $1, $2, $3, 'besitzer', $4, 0, 'arbeitet')`,
          [id, chat, pai, actionId],
        ),
      ),
    ).toBe(CHECK);
    expect(
      await codeOf(
        q(
          `insert into auftraege (id, art, root_id, conversation_id, bot_id, geber, action_id, notaus_epoche, rueckfragen)
           values ($1, 'wurzel', $1, $2, $3, 'besitzer', $4, 0, 2)`,
          [id, chat, pai, actionId],
        ),
      ),
    ).toBe(CHECK);
  });

  // Gegenprobe: `action_id` ohne `not null` oder die Beleg-Prüfung im Trigger entfernen → rot.
  it("ohne Entscheidung des Tors entsteht kein Auftrag", async () => {
    const id = newId("auftrag");
    expect(
      await codeOf(
        q(
          `insert into auftraege (id, art, root_id, conversation_id, bot_id, geber, notaus_epoche)
           values ($1, 'wurzel', $1, $2, $3, 'besitzer', 0)`,
          [id, chat, pai],
        ),
      ),
    ).toBeOneOf([NOT_NULL, RESTRICT]);
    const spalte = await eins(
      "select is_nullable from information_schema.columns where table_name = 'auftraege' and column_name = 'action_id'",
    );
    expect(spalte.is_nullable).toBe("NO");
    // Eine Kennung ohne Beleg, eine abgelehnte Nachricht, eine Nachricht in einer anderen Unterhaltung.
    for (const actionId of [
      newId("action"),
      await nachrichtErlaubt(chat, "deny"),
      await nachrichtErlaubt(chat2),
    ]) {
      expect(await codeOf(wurzel(chat, pai, { actionId }))).toBe(RESTRICT);
    }
  });

  // Gegenprobe: die Prüfung der Übergabe (Empfänger/Akteur) im Trigger entfernen → rot.
  it("ein Auftrag eines Bots braucht seine erlaubte Übergabe an genau diesen Empfänger", async () => {
    const w = await wurzel();
    await uebergabe(w, pai, zweiter);
    const falsch = await uebergabeErlaubt(pai, dritter, chat);
    expect(
      await codeOf(
        q(
          `insert into auftraege (id, art, parent_auftrag_id, root_id, conversation_id, bot_id, geber, action_id, notaus_epoche)
           values ($1, 'uebergabe', $2, $2, $3, $4, $5, $6, 0)`,
          [newId("auftrag"), w, chat, zweiter, `bot:${pai}`, falsch],
        ),
      ),
    ).toBe(RESTRICT);
  });

  // Gegenprobe: die Prüfung „offener Eltern-Auftrag derselben Wurzel“ entfernen → rot.
  it("ein Kind hängt nur an einem offenen Eltern-Auftrag derselben Wurzel", async () => {
    const w1 = await wurzel();
    const w2 = await wurzel(chat2, zweiter);
    const actionId = await uebergabeErlaubt(pai, zweiter, chat);
    // Falsche Wurzel.
    expect(
      await codeOf(
        q(
          `insert into auftraege (id, art, parent_auftrag_id, root_id, conversation_id, bot_id, geber, action_id, notaus_epoche)
           values ($1, 'uebergabe', $2, $3, $4, $5, $6, $7, 0)`,
          [newId("auftrag"), w1, w2, chat, zweiter, `bot:${pai}`, actionId],
        ),
      ),
    ).toBe(RESTRICT);
    // Eltern zu Ende.
    await stand(w1, "abgebrochen", "besitzer_bricht_ab");
    expect(await codeOf(uebergabe(w1, pai, zweiter))).toBe(RESTRICT);
  });

  it("die Arten des Servers haben keinen Geber, die anderen immer einen; die Wurzel kommt von dir", async () => {
    const actionId = await nachrichtErlaubt(chat);
    expect(
      await codeOf(
        q(
          `insert into auftraege (id, art, root_id, conversation_id, bot_id, geber, action_id, notaus_epoche)
           values ($1, 'wurzel', $1, $2, $3, $4, $5, 0)`,
          [newId("auftrag"), chat, pai, `bot:${zweiter}`, actionId],
        ),
      ),
    ).toBe(CHECK);
  });

  // Gegenprobe: die Prüfung „Rückkehr nur nach dem Ende des Kinds“ entfernen → rot.
  it("eine Rückkehr gibt es erst, wenn der Kind-Auftrag dieser Entscheidung zu Ende ist", async () => {
    const w = await wurzel();
    const kind = await uebergabe(w, pai, zweiter);
    const actionId = (await eins("select action_id from auftraege where id = $1", [kind]))
      .action_id;
    const rueckkehr = () =>
      q(
        `insert into auftraege (id, art, parent_auftrag_id, root_id, conversation_id, bot_id, action_id, notaus_epoche)
         values ($1, 'rueckkehr', $2, $2, $3, $4, $5, 0)`,
        [newId("auftrag"), w, chat, pai, actionId],
      );
    expect(await codeOf(rueckkehr())).toBe(RESTRICT);
    const r = await lauf(kind);
    await stand(kind, "arbeitet");
    await laufEnde(r);
    await stand(kind, "fertig");
    expect(await codeOf(rueckkehr())).toBeUndefined();
  });

  // Gegenprobe: die Zettel-Prüfregeln (Länge, bereinigt) entfernen → rot.
  it("der Zettel hat höchstens 2 000 Zeichen und ist bereinigt", async () => {
    expect(await codeOf(wurzel(chat, pai, { zettel: "x".repeat(2000) }))).toBeUndefined();
    expect(await codeOf(wurzel(chat, pai, { zettel: "x".repeat(2001) }))).toBe(CHECK);
    for (const zeichen of ["\u0007", "\r", "​", "‮", "﻿", " "]) {
      expect(
        await codeOf(wurzel(chat, pai, { zettel: `a${zeichen}b` })),
        JSON.stringify(zeichen),
      ).toBe(CHECK);
    }
    expect(
      await codeOf(wurzel(chat, pai, { zettel: "Zeile 1\n\tZeile 2 – Ümlaut" })),
    ).toBeUndefined();
  });
});

describe("Aufträge: nach dem Anlegen", () => {
  // Gegenprobe: `zettel` aus der Liste der festen Spalten im Trigger streichen → rot.
  it("Zettel, Entscheidung, Baum, Empfänger und Epoche sind unveränderlich", async () => {
    const w = await wurzel();
    for (const satz of [
      "update auftraege set zettel = 'anders' where id = $1",
      "update auftraege set fertig_wenn = 'anders' where id = $1",
      `update auftraege set action_id = '${newId("action")}' where id = $1`,
      `update auftraege set bot_id = '${zweiter}' where id = $1`,
      "update auftraege set notaus_epoche = notaus_epoche + 1 where id = $1",
      `update auftraege set conversation_id = '${chat2}' where id = $1`,
    ]) {
      expect(await codeOf(q(satz, [w])), satz).toBe(RESTRICT);
    }
  });

  // Gegenprobe: die Übergangs-Prüfung im Trigger entfernen → rot.
  it("der Stand wechselt nur auf den erlaubten Wegen", async () => {
    const w = await wurzel();
    expect(await codeOf(stand(w, "fertig"))).toBe(RESTRICT);
    expect(await codeOf(stand(w, "wartet_auf_dich"))).toBe(RESTRICT);
    const r = await lauf(w);
    await stand(w, "arbeitet");
    await stand(w, "wartet_auf_dich");
    await stand(w, "arbeitet");
    await laufEnde(r);
    await stand(w, "fertig");
    expect(await codeOf(stand(w, "gefragt"))).toBe(RESTRICT);
    expect(await codeOf(stand(w, "gescheitert"))).toBe(RESTRICT);
    const ereignisse = await q(
      "select payload->>'von' as von, payload->>'nach' as nach from auftrag_ereignisse where auftrag_id = $1 and type = 'auftrag.status' order by seq",
      [w],
    );
    expect(ereignisse.rows.map((e) => `${e.von}>${e.nach}`)).toEqual([
      "gefragt>arbeitet",
      "arbeitet>wartet_auf_dich",
      "wartet_auf_dich>arbeitet",
      "arbeitet>fertig",
    ]);
  });

  // Gegenprobe: `AND OLD.art = 'wurzel'` im Weg `fertig → arbeitet` streichen → rot.
  it("nur die Wurzel kommt aus fertig zurück (du gibst das Ergebnis zurück)", async () => {
    const w = await wurzel();
    const kind = await uebergabe(w, pai, zweiter, chat2);
    const rk = await lauf(kind);
    await stand(kind, "arbeitet");
    await laufEnde(rk);
    await stand(kind, "fertig");
    // Unter einem fertigen Kind startet kein Lauf mehr, und es wird nicht wieder offen.
    expect(await codeOf(lauf(kind))).toBe(RESTRICT);
    expect(await codeOf(stand(kind, "arbeitet"))).toBe(RESTRICT);
    // Die fertige Wurzel öffnet sich mit einem neuen Lauf wieder.
    const rw = await lauf(w);
    await stand(w, "arbeitet");
    await laufEnde(rw);
    await stand(w, "fertig");
    await lauf(w);
    expect(await codeOf(stand(w, "arbeitet"))).toBeUndefined();
  });

  // Gegenprobe: die Prüfung „arbeitet nur mit aktivem Lauf“ entfernen → rot.
  it("arbeitet nur mit einem aktiven Lauf dieses Auftrags", async () => {
    const w = await wurzel();
    expect(await codeOf(stand(w, "arbeitet"))).toBe(RESTRICT);
    await lauf(w, "queued");
    expect(await codeOf(stand(w, "arbeitet"))).toBeUndefined();
  });

  // Gegenprobe: die CHECK-Regel `auftraege_ende_passt` entfernen → rot.
  it("Ende und Grund nur mit einem Endzustand", async () => {
    const w = await wurzel();
    expect(await codeOf(q("update auftraege set status = 'abgebrochen' where id = $1", [w]))).toBe(
      CHECK,
    );
    // Grund ohne Wechsel des Stands weist schon der Trigger ab.
    expect(await codeOf(q("update auftraege set end_grund = 'x' where id = $1", [w]))).toBe(
      RESTRICT,
    );
  });

  // Gegenprobe: die Zähler-Prüfung im Trigger entfernen → rot.
  it("die Zähler für Rückfragen und Bitten werden nie kleiner", async () => {
    const w = await wurzel();
    await q("update auftraege set rueckfragen = 2, bitten = 1 where id = $1", [w]);
    expect(await codeOf(q("update auftraege set rueckfragen = 1 where id = $1", [w]))).toBe(
      RESTRICT,
    );
    expect(await codeOf(q("update auftraege set bitten = 0 where id = $1", [w]))).toBe(RESTRICT);
  });

  // Gegenprobe: die Prüfung `OLD.belastet AND NOT NEW.belastet` in `auftraege_regeln` entfernen → rot.
  it("„belastet“ eines Auftrags geht nie zurück, ein neues Kind erbt es", async () => {
    const w = await wurzel();
    await q("update auftraege set belastet = true where id = $1", [w]);
    expect(await codeOf(q("update auftraege set belastet = false where id = $1", [w]))).toBe(
      RESTRICT,
    );
    const kind = await uebergabe(w, pai, zweiter);
    expect((await eins("select belastet from auftraege where id = $1", [kind])).belastet).toBe(
      true,
    );
  });

  it("gelöscht wird ein Auftrag nur mit seiner Unterhaltung, mit Ereignissen und Zuschlägen", async () => {
    const w = await wurzel();
    await uebergabe(w, pai, zweiter);
    await lauf(w, "queued");
    await q("delete from conversations where id = $1", [chat]);
    expect((await q("select 1 from auftraege")).rows).toHaveLength(0);
    expect((await q("select 1 from auftrag_ereignisse")).rows).toHaveLength(0);
  });
});

describe("Ereignisse und Zuschläge: nur anhängen", () => {
  // Gegenprobe: Trigger `auftrag_ereignisse_nur_anhaengen` entfernen → rot.
  it("Ereignisse lassen sich weder ändern noch löschen noch leeren", async () => {
    await wurzel();
    expect(await codeOf(q("update auftrag_ereignisse set type = 'stab.moved'"))).toBe(RESTRICT);
    expect(await codeOf(q("delete from auftrag_ereignisse"))).toBe(RESTRICT);
    expect(await codeOf(q("truncate auftrag_ereignisse"))).toBe(RESTRICT);
  });

  function zuschlagErlaubt(root: string) {
    return kette.entscheidung({
      type: "auftrag.budget_erhoehen",
      target: { conversationId: chat, auftragId: root },
      facts: {},
    });
  }

  async function zuschlag(root: string, actionId?: ActionId) {
    return q("insert into auftrag_zuschlaege (auftrag_root_id, nr, action_id) values ($1, 0, $2)", [
      root,
      actionId ?? (await zuschlagErlaubt(root)),
    ]);
  }

  // Gegenprobe: CHECK `auftrag_zuschlaege_nr_bereich` entfernen → der sechste geht durch, rot.
  it("höchstens fünf Zuschläge je Wurzel, fest 10 000 Token, nummeriert vom Trigger", async () => {
    const w = await wurzel();
    for (let i = 0; i < 5; i++) await zuschlag(w);
    expect(await codeOf(zuschlag(w))).toBe(CHECK);
    const rows = await q(
      "select nr, tokens from auftrag_zuschlaege where auftrag_root_id = $1 order by nr",
      [w],
    );
    expect(rows.rows).toEqual([1, 2, 3, 4, 5].map((nr) => ({ nr, tokens: 10000 })));
    // Ein anderer Betrag scheitert.
    const w2 = await wurzel(chat2, zweiter);
    expect(
      await codeOf(
        q(
          "insert into auftrag_zuschlaege (auftrag_root_id, nr, action_id, tokens) values ($1, 0, $2, 20000)",
          [w2, await zuschlagErlaubt(w2)],
        ),
      ),
    ).toBe(CHECK);
  });

  // Gegenprobe: die Prüfung der Entscheidung in `auftrag_zuschlaege_regeln` entfernen → rot.
  it("ein Zuschlag braucht deine Entscheidung für diesen Baum und eine offene Wurzel", async () => {
    const w = await wurzel();
    const kind = await uebergabe(w, pai, zweiter);
    expect(await codeOf(zuschlag(w, newId("action")))).toBe(RESTRICT);
    expect(await codeOf(zuschlag(kind))).toBe(RESTRICT);
    const actionId = await zuschlagErlaubt(w);
    await zuschlag(w, actionId);
    // Dieselbe Entscheidung zählt nur einmal.
    expect(await codeOf(zuschlag(w, actionId))).toBe(EINDEUTIG);
  });

  // Gegenprobe: Trigger `auftrag_zuschlaege_nur_anhaengen` entfernen → rot.
  it("Zuschläge lassen sich weder ändern noch löschen noch leeren", async () => {
    const w = await wurzel();
    await zuschlag(w);
    expect(await codeOf(q("update auftrag_zuschlaege set nr = 1"))).toBe(RESTRICT);
    expect(await codeOf(q("delete from auftrag_zuschlaege"))).toBe(RESTRICT);
    expect(await codeOf(q("truncate auftrag_zuschlaege"))).toBe(RESTRICT);
  });
});

describe("Not-Aus-Epoche", () => {
  // Gegenprobe: den Zweig „ändert sich nur beim Einschalten“ in `settings_epoche` entfernen → rot.
  it("steigt nur zusammen mit dem Einschalten des Not-Aus, genau um 1, und nie zurück", async () => {
    expect(await epoche()).toBe(0);
    expect(await codeOf(q("update settings set notaus_epoche = 1"))).toBe(RESTRICT);
    await q("update settings set kill_switch = true");
    expect(await epoche()).toBe(1);
    await q("update settings set kill_switch = false");
    expect(await epoche()).toBe(1);
    expect(await codeOf(q("update settings set notaus_epoche = 0"))).toBe(RESTRICT);
    expect(await codeOf(q("update settings set kill_switch = true, notaus_epoche = 5"))).toBe(
      RESTRICT,
    );
    await q("update settings set kill_switch = true, notaus_epoche = 2");
    expect(await epoche()).toBe(2);
  });

  // Gegenprobe: die Not-Aus-Prüfung beim Anlegen in `auftraege_regeln` entfernen → rot.
  it("bei eingeschaltetem Not-Aus oder mit alter Epoche entsteht kein Auftrag", async () => {
    await q("update settings set kill_switch = true");
    expect(await codeOf(wurzel())).toBe(RESTRICT);
    await q("update settings set kill_switch = false");
    const actionId = await nachrichtErlaubt(chat);
    expect(
      await codeOf(
        q(
          `insert into auftraege (id, art, root_id, conversation_id, bot_id, geber, action_id, notaus_epoche)
           values ($1, 'wurzel', $1, $2, $3, 'besitzer', $4, 0)`,
          [newId("auftrag"), chat, pai, actionId],
        ),
      ),
    ).toBe(RESTRICT);
  });

  // Gegenprobe: die Epoche-Prüfung in `runs_auftrag` entfernen → rot.
  it("nach dem Not-Aus startet kein Lauf eines vorher angelegten Auftrags", async () => {
    const w = await wurzel();
    const r = await lauf(w, "queued");
    await q("update settings set kill_switch = true");
    await q("update settings set kill_switch = false");
    expect(await codeOf(q("update runs set status = 'running' where id = $1", [r]))).toBe(RESTRICT);
    // Ein neuer Lauf entsteht auch nicht.
    await q("update runs set status = 'cancelled', finished_at = now() where id = $1", [r]);
    expect(await codeOf(lauf(w, "queued"))).toBe(RESTRICT);
  });
});

describe("Fäden: Stand, Staffelstab, belastet", () => {
  let faden: ConversationId;

  beforeEach(async () => {
    const team = newId("team");
    faden = newId("conversation");
    await q("insert into teams (id, name) values ($1, 'Team')", [team]);
    await q(
      "insert into conversations (id, bot_id, title, kind, team_id) values ($1, null, 'Faden', 'faden', $2)",
      [faden, team],
    );
    await q(
      "insert into faeden (conversation_id, ziel, abnahme, herkunft, action_id) values ($1, 'Ziel', 'leitung', 'besitzer', $2)",
      [faden, newId("action")],
    );
  });

  it("Stand und Staffelstab lassen sich setzen, Ziel nicht", async () => {
    await q(
      "update faeden set stand = 'wartet_auf_dich', stab_bei = 'besitzer' where conversation_id = $1",
      [faden],
    );
    await q("update faeden set stab_bei = $2 where conversation_id = $1", [faden, `bot:${pai}`]);
    expect(
      await codeOf(q("update faeden set stab_bei = 'jemand' where conversation_id = $1", [faden])),
    ).toBe(CHECK);
    expect(
      await codeOf(q("update faeden set stand = 'unbekannt' where conversation_id = $1", [faden])),
    ).toBe(CHECK);
    expect(
      await codeOf(q("update faeden set ziel = 'anders' where conversation_id = $1", [faden])),
    ).toBe(RESTRICT);
  });

  // Gegenprobe: die Prüfung „belastet nie zurück“ in `faeden_regeln` entfernen → rot.
  it("„belastet“ eines Fadens geht nie zurück", async () => {
    await q("update faeden set belastet = true where conversation_id = $1", [faden]);
    expect(
      await codeOf(q("update faeden set belastet = false where conversation_id = $1", [faden])),
    ).toBe(RESTRICT);
  });

  // Gegenprobe: Trigger `messages_faden_belasten` entfernen → rot.
  it("eine Nachricht mit fremdem Inhalt belastet den Faden", async () => {
    await q(
      "insert into messages (id, conversation_id, role, content, untrusted) values ($1, $2, 'user', 'x', true)",
      [newId("message"), faden],
    );
    expect(
      (await eins("select belastet from faeden where conversation_id = $1", [faden])).belastet,
    ).toBe(true);
  });

  // Gegenprobe: die Autor-Pflicht in `messages_bezuege` entfernen → rot.
  it("eine Antwort in einem Faden nennt ihren Autor", async () => {
    expect(
      await codeOf(
        q(
          "insert into messages (id, conversation_id, role, content) values ($1, $2, 'assistant', 'x')",
          [newId("message"), faden],
        ),
      ),
    ).toBe(CHECK);
    expect(
      await codeOf(
        q(
          "insert into messages (id, conversation_id, role, content, bot_id) values ($1, $2, 'assistant', 'x', $3)",
          [newId("message"), faden, pai],
        ),
      ),
    ).toBeUndefined();
  });
});

describe("Nachrichten: Autor, Herkunft, Bezug, Inhalt", () => {
  // Gegenprobe: die Inhalt-Prüfung in `paibot_messages_unveraenderlich` entfernen → rot.
  it("Inhalt und Zustand sind nach dem Abschluss unveränderlich, beim Streamen nicht", async () => {
    const fertig = newId("message");
    await q(
      "insert into messages (id, conversation_id, role, content) values ($1, $2, 'user', 'a')",
      [fertig, chat],
    );
    expect(await codeOf(q("update messages set content = 'b' where id = $1", [fertig]))).toBe(
      RESTRICT,
    );
    expect(await codeOf(q("update messages set status = 'failed' where id = $1", [fertig]))).toBe(
      RESTRICT,
    );
    const strom = newId("message");
    await q(
      "insert into messages (id, conversation_id, role, content, status, bot_id) values ($1, $2, 'assistant', '', 'streaming', $3)",
      [strom, chat, pai],
    );
    await q("update messages set content = 'Teil' where id = $1", [strom]);
    await q("update messages set content = 'Ganz', status = 'complete' where id = $1", [strom]);
    expect(await codeOf(q("update messages set content = 'x' where id = $1", [strom]))).toBe(
      RESTRICT,
    );
    // Das Kennzeichen „fremder Inhalt“ darf weiter gesetzt werden.
    await q("update messages set untrusted = true where id = $1", [strom]);
  });

  // Gegenprobe: `bot_id`/`auftrag_id` aus der Liste der festen Spalten streichen → rot.
  it("Autor, Auftrag und Bezug bleiben nach dem Anlegen gleich", async () => {
    const m = newId("message");
    await q(
      "insert into messages (id, conversation_id, role, content, bot_id) values ($1, $2, 'assistant', 'a', $3)",
      [m, chat, pai],
    );
    expect(await codeOf(q("update messages set bot_id = $2 where id = $1", [m, zweiter]))).toBe(
      RESTRICT,
    );
    const w = await wurzel();
    expect(await codeOf(q("update messages set auftrag_id = $2 where id = $1", [m, w]))).toBe(
      RESTRICT,
    );
  });

  it("der Autor einer Antwort ist der Bot ihres Laufs, der Auftrag gehört zur Unterhaltung", async () => {
    const w = await wurzel();
    const r = await lauf(w);
    expect(
      await codeOf(
        q(
          "insert into messages (id, conversation_id, role, content, bot_id, run_id) values ($1, $2, 'assistant', 'a', $3, $4)",
          [newId("message"), chat, zweiter, r],
        ),
      ),
    ).toBe(RESTRICT);
    expect(
      await codeOf(
        q(
          "insert into messages (id, conversation_id, role, content, auftrag_id) values ($1, $2, 'user', 'a', $3)",
          [newId("message"), chat2, w],
        ),
      ),
    ).toBe(RESTRICT);
  });

  it("Herkunft: Rückmeldung nur vom Bot, Vorschlag nur von dir mit Bezug auf eine Frage", async () => {
    const frage = newId("message");
    await q(
      "insert into messages (id, conversation_id, role, content, bot_id) values ($1, $2, 'assistant', 'Welche Farbe?', $3)",
      [frage, chat, pai],
    );
    expect(
      await codeOf(
        q(
          "insert into messages (id, conversation_id, role, content, origin) values ($1, $2, 'user', 'Blau', 'vorschlag')",
          [newId("message"), chat],
        ),
      ),
    ).toBe(CHECK);
    await q(
      "insert into messages (id, conversation_id, role, content, origin, frage_bezug) values ($1, $2, 'user', 'Blau', 'vorschlag', $3)",
      [newId("message"), chat, frage],
    );
    expect(
      await codeOf(
        q(
          "insert into messages (id, conversation_id, role, content, origin) values ($1, $2, 'user', 'x', 'rueckmeldung')",
          [newId("message"), chat],
        ),
      ),
    ).toBe(CHECK);
    // Bezug auf eine Frage in einer anderen Unterhaltung scheitert.
    expect(
      await codeOf(
        q(
          "insert into messages (id, conversation_id, role, content, origin, frage_bezug) values ($1, $2, 'user', 'Blau', 'vorschlag', $3)",
          [newId("message"), chat2, frage],
        ),
      ),
    ).toBe(RESTRICT);
  });
});

describe("Läufe mit Auftrag", () => {
  // Gegenprobe: `untrusted_input` aus der Liste der festen Spalten in `runs_auftrag` streichen → rot.
  it("Auftrag, Wurzel und Kennzeichen sind unveränderlich, der Abschluss-Grund wird einmal gesetzt", async () => {
    const w = await wurzel();
    const r = await lauf(w, "running", true);
    expect(await codeOf(q("update runs set untrusted_input = false where id = $1", [r]))).toBe(
      RESTRICT,
    );
    expect(
      await codeOf(
        q("update runs set auftrag_id = null, auftrag_root_id = null where id = $1", [r]),
      ),
    ).toBe(RESTRICT);
    await q("update runs set finish_reason = 'stop' where id = $1", [r]);
    expect(await codeOf(q("update runs set finish_reason = 'length' where id = $1", [r]))).toBe(
      RESTRICT,
    );
  });

  it("ein Lauf mit Auftrag hält sein Kennzeichen fest und passt zu Bot und Wurzel", async () => {
    const w = await wurzel();
    const m = newId("message");
    await q(
      "insert into messages (id, conversation_id, role, content) values ($1, $2, 'user', 'los')",
      [m, chat],
    );
    const m2 = newId("message");
    await q(
      "insert into messages (id, conversation_id, role, content) values ($1, $2, 'user', 'los')",
      [m2, chat2],
    );
    const einfuegen = (
      bot: BotId,
      auftrag: string | null,
      root: string | null,
      untrusted: boolean | null,
      konv: ConversationId = chat,
    ) =>
      q(
        `insert into runs (id, conversation_id, trigger_message_id, bot_id, auftrag_id, auftrag_root_id, untrusted_input)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [newId("run"), konv, konv === chat ? m : m2, bot, auftrag, root, untrusted],
      );
    expect(await codeOf(einfuegen(pai, w, w, null))).toBe(CHECK);
    expect(await codeOf(einfuegen(pai, null, w, false))).toBe(CHECK);
    expect(await codeOf(einfuegen(zweiter, w, w, false))).toBe(RESTRICT);
    // Gegenprobe: die Bindung an die Unterhaltung in `runs_auftrag` entfernen → rot.
    expect(await codeOf(einfuegen(pai, w, w, false, chat2))).toBe(RESTRICT);
    expect(await codeOf(einfuegen(pai, w, w, false))).toBeUndefined();
  });

  // Gegenprobe: den Teil-Index `runs_ein_aktiver_lauf_je_auftragsbaum` entfernen → rot.
  it("je Auftragsbaum höchstens ein aktiver Lauf, auch über Unterhaltungen hinweg", async () => {
    const w = await wurzel();
    const kind = await uebergabe(w, pai, zweiter, chat2);
    const r = await lauf(w);
    expect(await codeOf(lauf(kind, "queued"))).toBe(EINDEUTIG);
    await laufEnde(r);
    expect(await codeOf(lauf(kind, "queued"))).toBeUndefined();
  });
});

describe("Grenzen in den Einstellungen", () => {
  it("haben die Startwerte des Bauplans", async () => {
    expect(
      await eins(
        `select auftrag_max_tiefe, auftrag_max_anzahl, auftrag_max_tokens, auftrag_max_minuten,
                auftrag_max_breite, auftraege_je_mitglied, rueckfragen_je_faden, bitten_je_auftrag,
                zuschlaege_je_baum, erwaehnungen_je_nachricht, notaus_epoche from settings`,
      ),
    ).toEqual({
      auftrag_max_tiefe: 3,
      auftrag_max_anzahl: 20,
      auftrag_max_tokens: 200000,
      auftrag_max_minuten: 30,
      auftrag_max_breite: 6,
      auftraege_je_mitglied: 3,
      rueckfragen_je_faden: 3,
      bitten_je_auftrag: 1,
      zuschlaege_je_baum: 5,
      erwaehnungen_je_nachricht: 6,
      notaus_epoche: 0,
    });
  });

  // Gegenprobe: eine der CHECK-Regeln `settings_*_bereich` entfernen → rot.
  it.each([
    ["auftrag_max_tiefe", 0, 6],
    ["auftrag_max_anzahl", 0, 101],
    ["auftrag_max_tokens", 999, 2000001],
    ["auftrag_max_minuten", 0, 241],
    ["auftrag_max_breite", 0, 13],
    ["auftraege_je_mitglied", 0, 11],
    ["rueckfragen_je_faden", 0, 11],
    ["bitten_je_auftrag", 0, 4],
    ["zuschlaege_je_baum", 4, 6],
    ["erwaehnungen_je_nachricht", 0, 13],
  ])("%s bleibt in seinem Bereich", async (spalte, unten, oben) => {
    expect(await codeOf(q(`update settings set ${spalte} = $1`, [unten]))).toBe(CHECK);
    expect(await codeOf(q(`update settings set ${spalte} = $1`, [oben]))).toBe(CHECK);
  });
});
