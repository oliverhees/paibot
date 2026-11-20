/**
 * PaiBot – Test: Trigger machen Belege unveränderlich und halten den Ereignis-Strom und die Installations-ID fest.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { newId, ZERO_PREV } from "@paibot/shared";
import { beforeAll, describe, expect, it } from "vitest";
import { belege, bots, conversationEvents, conversations, installationKeys } from "./schema";
import { belegRow, botRow, conversationRow, keyRow } from "./testdaten";
import { createTestDb } from "./testing";

type Fehler = { code?: string; message?: string };

async function fehler(statement: PromiseLike<unknown>): Promise<Fehler> {
  try {
    await statement;
  } catch (error) {
    return ((error as { cause?: unknown }).cause ?? error) as Fehler;
  }
  throw new Error("Die Anweisung hätte scheitern müssen.");
}

const RESTRICT = "23001";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let belegId: string;

beforeAll(async () => {
  ctx = await createTestDb();
  const key = keyRow();
  await ctx.db.insert(installationKeys).values(key);
  const eins = belegRow(key.id, { seq: 1, prevHash: ZERO_PREV });
  const zwei = belegRow(key.id, { seq: 2, prevHash: eins.hash });
  await ctx.db.insert(belege).values(eins);
  await ctx.db.insert(belege).values(zwei);
  belegId = eins.id;
});

describe("Belege sind unveränderlich", () => {
  it("weist UPDATE ab", async () => {
    const f = await fehler(ctx.client.query("update belege set actor = 'besitzer' where seq = 2"));
    expect(f.code).toBe(RESTRICT);
    expect(f.message).toContain("Belege sind unveränderlich");
  });

  it("weist jede Änderung ab, auch an der Signatur", async () => {
    const f = await fehler(ctx.client.query("update belege set signature = signature"));
    expect(f.code).toBe(RESTRICT);
  });

  it("weist DELETE ab", async () => {
    const f = await fehler(ctx.client.query("delete from belege where id = $1", [belegId]));
    expect(f.code).toBe(RESTRICT);
    expect(f.message).toContain("Belege sind unveränderlich");
  });

  it("weist TRUNCATE ab", async () => {
    const f = await fehler(ctx.client.query("truncate belege"));
    expect(f.code).toBe(RESTRICT);
  });

  it("lässt die Zeilen unverändert zurück", async () => {
    const result = await ctx.client.query<{ n: number }>("select count(*)::int as n from belege");
    expect(result.rows).toEqual([{ n: 2 }]);
  });

  it("neue Belege lassen sich weiter anhängen", async () => {
    const [letzter] = (
      await ctx.client.query<{ hash: string; key_id: string }>(
        "select hash, key_id from belege order by seq desc limit 1",
      )
    ).rows;
    const drei = belegRow(letzter?.key_id as never, { seq: 3, prevHash: letzter?.hash as string });
    await ctx.db.insert(belege).values(drei);
  });

  it("bleiben bestehen, wenn eine Unterhaltung gelöscht wird", async () => {
    const [letzter] = (
      await ctx.client.query<{ hash: string; key_id: string }>(
        "select hash, key_id from belege order by seq desc limit 1",
      )
    ).rows;
    const conversationId = newId("conversation");
    const vier = {
      ...belegRow(letzter?.key_id as never, { seq: 4, prevHash: letzter?.hash as string }),
      conversationId,
    };
    await ctx.db.insert(belege).values(vier);

    const bot = botRow();
    await ctx.db.insert(bots).values(bot);
    await ctx.db.insert(conversations).values({ ...conversationRow(bot.id), id: conversationId });
    await ctx.client.query("delete from conversations where id = $1", [conversationId]);

    const result = await ctx.client.query<{ n: number }>(
      "select count(*)::int as n from belege where conversation_id = $1",
      [conversationId],
    );
    expect(result.rows).toEqual([{ n: 1 }]);
  });
});

describe("Ereignis-Strom wird nur angehängt", () => {
  async function unterhaltungMitEreignissen() {
    const bot = botRow();
    await ctx.db.insert(bots).values(bot);
    const conversation = conversationRow(bot.id);
    await ctx.db.insert(conversations).values(conversation);
    const runId = newId("run");
    const messageId = newId("message");
    await ctx.db.insert(conversationEvents).values([
      {
        conversationId: conversation.id,
        seq: 1,
        type: "message.created",
        payload: { messageId, role: "user", text: "Hallo" },
      },
      { conversationId: conversation.id, seq: 2, runId, type: "run.started", payload: { runId } },
      {
        conversationId: conversation.id,
        seq: 3,
        runId,
        type: "text.delta",
        payload: { runId, messageId, text: "Hal" },
      },
    ]);
    return conversation.id;
  }

  it("weist UPDATE ab", async () => {
    const id = await unterhaltungMitEreignissen();
    const f = await fehler(
      ctx.client.query("update conversation_events set payload = '{}' where conversation_id = $1", [
        id,
      ]),
    );
    expect(f.code).toBe(RESTRICT);
  });

  it("weist DELETE ab, außer für text.delta", async () => {
    const id = await unterhaltungMitEreignissen();
    const f = await fehler(
      ctx.client.query("delete from conversation_events where conversation_id = $1 and seq = 1", [
        id,
      ]),
    );
    expect(f.code).toBe(RESTRICT);

    await ctx.client.query(
      "delete from conversation_events where type = 'text.delta' and conversation_id = $1",
      [id],
    );
    const result = await ctx.client.query<{ seq: number }>(
      "select seq::int as seq from conversation_events where conversation_id = $1 order by seq",
      [id],
    );
    expect(result.rows.map((r) => r.seq)).toEqual([1, 2]);
  });

  it("alle Ereignisse verschwinden mit der Unterhaltung", async () => {
    const id = await unterhaltungMitEreignissen();
    await ctx.client.query("delete from conversations where id = $1", [id]);
    const result = await ctx.client.query<{ n: number }>(
      "select count(*)::int as n from conversation_events where conversation_id = $1",
      [id],
    );
    expect(result.rows).toEqual([{ n: 0 }]);
  });
});

describe("Installations-ID", () => {
  it("lässt sich einmal setzen und danach nicht mehr ändern", async () => {
    await ctx.client.query("insert into settings default values");
    const id = newId("installation");

    await ctx.client.query("update settings set installation_id = $1", [id]);
    await ctx.client.query("update settings set locale = 'en'");
    await ctx.client.query("update settings set installation_id = $1", [id]);

    const andere = await fehler(
      ctx.client.query("update settings set installation_id = $1", [newId("installation")]),
    );
    expect(andere.code).toBe(RESTRICT);
    const leer = await fehler(ctx.client.query("update settings set installation_id = null"));
    expect(leer.code).toBe(RESTRICT);

    const result = await ctx.client.query<{ installation_id: string }>(
      "select installation_id from settings",
    );
    expect(result.rows).toEqual([{ installation_id: id }]);
  });
});
