/**
 * PaiBot – Test: Tabelle der Werkzeug-Aufrufe (CHECKs, Fremdschlüssel, eindeutige Indizes) und
 * die Zugriffsfunktionen mit allen Zustandswechseln.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import {
  type ActionId,
  type ConversationId,
  type KeyId,
  newId,
  type ReceiptId,
  TOOL_CALL_STATUSES,
  toolCallSchema,
  ZERO_PREV,
} from "@paibot/shared";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "./client";
import { toolCalls as calls, StatuswechselError } from "./repo";
import { belege, bots, conversations, installationKeys, messages, runs, toolCalls } from "./schema";
import {
  belegRow,
  botRow,
  conversationRow,
  hmacDigest,
  keyRow,
  messageRow,
  runRow,
  sha256Digest,
  toolCallRow,
} from "./testdaten";
import { createTestDb, type TestDb } from "./testing";

const CHECK = "23514";
const UNIQUE = "23505";
const FOREIGN_KEY = "23503";

type Ids = Parameters<typeof toolCallRow>[0];

/** Datenbank-Attrappe: jede Abfrage (jeder Zugriff) scheitert sofort. */
const OHNE_DATENBANK = new Proxy(
  {},
  {
    get() {
      throw new Error("Hier darf keine Abfrage laufen.");
    },
  },
) as Database;

let ctx: TestDb;
let ids: Ids;
let belegIds: ReceiptId[];

async function fehler(
  statement: PromiseLike<unknown>,
): Promise<{ code?: string; constraint?: string }> {
  try {
    await statement;
  } catch (error) {
    return ((error as { cause?: unknown }).cause ?? error) as {
      code?: string;
      constraint?: string;
    };
  }
  throw new Error("Die Anweisung hätte scheitern müssen.");
}

async function weistAb(row: object, code: string, constraint: string) {
  const f = await fehler(ctx.db.insert(toolCalls).values(row as never));
  expect({ code: f.code, constraint: f.constraint }).toEqual({ code, constraint });
}

/**
 * Wie `weistAb`, aber mit abgeschalteten Triggern (`session_replication_role = replica`, nur in
 * diesem Test): Zeilen in späteren Zuständen lässt der Trigger `tool_calls_regeln` nie direkt zu;
 * so bleibt sichtbar, dass auch der CHECK sie abweist. CHECKs gelten weiter.
 */
async function weistAbOhneTrigger(row: object, code: string, constraint: string) {
  await ctx.client.exec("set session_replication_role = replica");
  try {
    await weistAb(row, code, constraint);
  } finally {
    await ctx.client.exec("set session_replication_role = origin");
  }
}

beforeEach(async () => {
  ctx = await createTestDb();
  const bot = botRow();
  await ctx.db.insert(bots).values(bot);
  const conversation = conversationRow(bot.id);
  await ctx.db.insert(conversations).values(conversation);
  const frage = messageRow(conversation.id);
  await ctx.db.insert(messages).values(frage);
  const run = runRow({
    conversationId: conversation.id,
    triggerMessageId: frage.id,
    botId: bot.id,
  });
  await ctx.db.insert(runs).values(run);
  const antwort = messageRow(conversation.id, { role: "assistant", content: "", runId: run.id });
  await ctx.db.insert(messages).values(antwort);
  ids = { conversationId: conversation.id, runId: run.id, messageId: antwort.id };

  const key = keyRow();
  await ctx.db.insert(installationKeys).values(key);
  belegIds = [];
  kette = { keyId: key.id, seq: 0, prevHash: ZERO_PREV, conversationId: conversation.id };
  for (let i = 1; i <= 4; i++) belegIds.push(await beleg({ type: "decision" }));
});

/** Stand der Beleg-Kette im Test. */
let kette: { keyId: KeyId; seq: number; prevHash: string; conversationId: ConversationId };

/** Hängt einen Beleg an (Entscheidung oder Ergebnis, optional zu einer bestimmten Aktion). */
async function beleg(options: {
  type: "decision" | "result";
  actionId?: ActionId;
  outcome?: "allow" | "deny";
  status?: "ok" | "denied";
}): Promise<ReceiptId> {
  kette.seq += 1;
  const row = belegRow(kette.keyId, {
    seq: kette.seq,
    prevHash: kette.prevHash,
    conversationId: kette.conversationId,
    ...options,
  });
  await ctx.db.insert(belege).values(row);
  kette.prevHash = row.hash;
  return row.id as ReceiptId;
}

/** Belege genau dieser Aktion: Entscheidung (Standard „erlaubt“) und Ergebnis. */
async function gebunden(actionId: ActionId, outcome: "allow" | "deny" = "allow") {
  return {
    entscheidung: (await beleg({ type: "decision", actionId, outcome })) as ReceiptId,
    ergebnis: await beleg({
      type: "result",
      actionId,
      status: outcome === "allow" ? "ok" : "denied",
    }),
  };
}

describe("tool_calls (Schema)", () => {
  it("nimmt einen angefragten Aufruf an", async () => {
    await ctx.db.insert(toolCalls).values(toolCallRow(ids));
  });

  it.each([
    ["Aktions-ID im falschen Format", { actionId: "akt_x" }, CHECK, "tool_calls_action_id_format"],
    ["negative Stelle", { position: -1 }, CHECK, "tool_calls_position_nicht_negativ"],
    ["leere Aufruf-Kennung", { callId: "" }, CHECK, "tool_calls_call_id_laenge"],
    ["Werkzeug-Name mit Leerzeichen", { name: "rm -rf" }, CHECK, "tool_calls_name_format"],
    ["unbekannte Quelle", { source: "netz" }, CHECK, "tool_calls_source_werte"],
    ["Server ohne MCP", { server: "notizen" }, CHECK, "tool_calls_server_nur_bei_mcp"],
    ["MCP ohne Server", { source: "mcp" }, CHECK, "tool_calls_server_nur_bei_mcp"],
    ["unbekannte Art", { kind: "loeschen" }, CHECK, "tool_calls_kind_werte"],
    [
      "Argumente im Klartext statt Abdruck",
      { argsDigest: "datum=heute" },
      CHECK,
      "tool_calls_args_digest_format",
    ],
    [
      "unbekannter Zustand",
      { status: "fertig", decisionReceiptId: newId("receipt") },
      CHECK,
      "tool_calls_status_werte",
    ],
    [
      "Ausführung ohne Entscheidung",
      { status: "running" },
      CHECK,
      "tool_calls_entscheidung_nach_dem_tor",
    ],
    [
      "wartet ohne Entscheidung",
      { status: "waiting_approval" },
      CHECK,
      "tool_calls_entscheidung_nach_dem_tor",
    ],
    [
      "Ergebnis vor dem Ende",
      { resultStatus: "ok" },
      CHECK,
      "tool_calls_ergebnis_nur_wenn_erledigt",
    ],
    [
      "unbekannte Ergebnis-Art",
      {
        status: "succeeded",
        decisionReceiptId: newId("receipt"),
        finishedAt: new Date(),
        resultStatus: "vielleicht",
      },
      CHECK,
      "tool_calls_result_status_werte",
    ],
    [
      "Fehlercode im falschen Format",
      { errorCode: "Kaputt" },
      CHECK,
      "tool_calls_error_code_format",
    ],
    [
      "Beleg-ID im falschen Format",
      { decisionReceiptId: "blg_x" },
      CHECK,
      "tool_calls_decision_receipt_id_format",
    ],
  ])("weist ab: %s", async (_name, abweichung, code, constraint) => {
    await weistAbOhneTrigger(toolCallRow(ids, abweichung as never), code, constraint);
  });

  it("weist ein Ende ohne Ergebnis und ein Ergebnis ohne Ende ab", async () => {
    const entschieden = { decisionReceiptId: belegIds[0] };
    await weistAbOhneTrigger(
      toolCallRow(ids, { ...entschieden, status: "succeeded", finishedAt: new Date() }),
      CHECK,
      "tool_calls_ergebnis_nur_wenn_erledigt",
    );
    await weistAbOhneTrigger(
      toolCallRow(ids, { ...entschieden, status: "succeeded", resultStatus: "ok" }),
      CHECK,
      "tool_calls_ergebnis_nur_wenn_erledigt",
    );
  });

  it("Fremdschlüssel: Lauf, Antwort, Unterhaltung und Belege müssen existieren", async () => {
    await weistAb(
      toolCallRow({ ...ids, runId: newId("run") }),
      FOREIGN_KEY,
      "tool_calls_run_id_runs_id_fk",
    );
    await weistAb(
      toolCallRow({ ...ids, messageId: newId("message") }),
      FOREIGN_KEY,
      "tool_calls_message_id_messages_id_fk",
    );
    await weistAb(
      toolCallRow({ ...ids, conversationId: newId("conversation") }),
      FOREIGN_KEY,
      "tool_calls_conversation_id_conversations_id_fk",
    );
    await weistAb(
      toolCallRow(ids, { decisionReceiptId: newId("receipt") }),
      FOREIGN_KEY,
      "tool_calls_decision_receipt_id_belege_id_fk",
    );
  });

  it("eindeutig: Stelle und Aufruf-Kennung je Antwort, Beleg je Aufruf", async () => {
    const erster = toolCallRow(ids, { decisionReceiptId: belegIds[0] });
    await ctx.db.insert(toolCalls).values(erster);
    await weistAb(toolCallRow(ids, { callId: "anders" }), UNIQUE, "tool_calls_stelle_eindeutig");
    await weistAb(
      toolCallRow(ids, { position: 1, callId: erster.callId }),
      UNIQUE,
      "tool_calls_call_id_eindeutig",
    );
    await weistAb(
      toolCallRow(ids, { position: 2, decisionReceiptId: belegIds[0] }),
      UNIQUE,
      "tool_calls_decision_receipt_id_eindeutig",
    );
    await weistAb(
      toolCallRow(ids, { actionId: erster.actionId, position: 3 }),
      UNIQUE,
      "tool_calls_pkey",
    );
  });

  it("verschwinden mit ihrer Unterhaltung, die Belege bleiben", async () => {
    await ctx.db.insert(toolCalls).values(toolCallRow(ids, { decisionReceiptId: belegIds[0] }));
    await ctx.db.delete(conversations).where(eq(conversations.id, ids.conversationId));
    expect(await ctx.db.select().from(toolCalls)).toEqual([]);
    expect(await ctx.db.select().from(belege)).toHaveLength(4);
  });
});

describe("toolCalls (Zugriff)", () => {
  async function neu(position = 0): Promise<ActionId> {
    const record = await calls.create(ctx.db, {
      actionId: newId("action"),
      ...ids,
      position,
      callId: `call_${position}`,
      name: "kalender_lesen",
      source: "eingebaut",
      kind: "lesen",
      input: { datum: "2026-11-20" },
      argsDigest: hmacDigest() as never,
      toolKey: "eingebaut/kalender.lesen",
      toolDigest: sha256Digest() as never,
      reach: "intern",
      foreignContent: false,
      step: 0,
      untrustedInput: false,
    });
    expect(record.status).toBe("requested");
    expect(toolCallSchema.safeParse(record).success).toBe(true);
    return record.actionId;
  }

  it("erlaubt: angefragt → läuft → fertig, mit Belegen und Ergebnis", async () => {
    const id = await neu();
    const b = await gebunden(id);
    const laeuft = await calls.recordDecision(ctx.db, id, {
      outcome: "allow",
      decisionReceiptId: b.entscheidung,
    });
    expect(laeuft).toMatchObject({ status: "running", decisionReceiptId: b.entscheidung });
    const fertig = await calls.finish(ctx.db, id, {
      status: "succeeded",
      output: { termine: [] },
      resultReceiptId: b.ergebnis,
    });
    expect(fertig).toMatchObject({
      status: "succeeded",
      resultStatus: "ok",
      output: { termine: [] },
    });
    expect(fertig.finishedAt).toBeDefined();
    expect(toolCallSchema.safeParse(fertig).success).toBe(true);
  });

  it("fragen: in dieser Fassung abgewiesen, bevor eine Abfrage läuft; die Zeile bleibt angefragt", async () => {
    const id = await neu();
    await expect(
      calls.recordDecision(ctx.db, id, {
        // @ts-expect-error „fragen“ gibt es in dieser Fassung nicht.
        outcome: "ask",
        decisionReceiptId: belegIds[0] as ReceiptId,
      }),
    ).rejects.toMatchObject({ code: "intern" });
    await expect(
      calls.recordDecision(OHNE_DATENBANK, id, {
        // @ts-expect-error „fragen“ gibt es in dieser Fassung nicht.
        outcome: "ask",
        decisionReceiptId: belegIds[0] as ReceiptId,
      }),
    ).rejects.toMatchObject({ code: "intern" });
    expect((await calls.get(ctx.db, id))?.status).toBe("requested");
    expect(await calls.listWaiting(ctx.db, ids.conversationId)).toEqual([]);
  });

  it("Freigabe-Wege sind stillgelegt: approve, markRunning, rejectByOwner werfen ohne Abfrage", async () => {
    const id = await neu();
    for (const versuch of [
      () => calls.approve(OHNE_DATENBANK, id),
      () => calls.markRunning(OHNE_DATENBANK, id),
      () => calls.rejectByOwner(OHNE_DATENBANK, id, { output: "Nein." }),
      () => calls.approve(ctx.db, id),
      () => calls.rejectByOwner(ctx.db, id, { output: "Nein." }),
    ]) {
      expect(versuch).toThrow(expect.objectContaining({ code: "intern" }));
    }
    expect((await calls.get(ctx.db, id))?.status).toBe("requested");
  });

  it("die Daten-Form bleibt: alle Zustände, nur ohne Weg in die Warte-Zustände", () => {
    expect([...TOOL_CALL_STATUSES]).toEqual([
      "requested",
      "waiting_approval",
      "approved",
      "running",
      "succeeded",
      "failed",
      "denied",
      "cancelled",
    ]);
    expect(calls.TOOL_CALL_TRANSITIONS.waiting_approval).toEqual([]);
    expect(calls.TOOL_CALL_TRANSITIONS.approved).toEqual([]);
  });

  it("ablehnen durch das Tor gibt dem Modell ein Ergebnis denied", async () => {
    const vomTor = await neu(0);
    const b = await gebunden(vomTor, "deny");
    const abgelehnt = await calls.recordDecision(ctx.db, vomTor, {
      outcome: "deny",
      decisionReceiptId: b.entscheidung,
      resultReceiptId: b.ergebnis,
      output: "Abgelehnt.",
    });
    expect(abgelehnt).toMatchObject({
      status: "denied",
      resultStatus: "denied",
      errorCode: "abgelehnt",
    });
  });

  it("weist unerlaubte Wechsel ab und meldet unbekannte Aufrufe", async () => {
    const id = await neu();
    await expect(
      calls.finish(ctx.db, id, {
        status: "succeeded",
        output: null,
        resultReceiptId: belegIds[1] as ReceiptId,
      }),
    ).rejects.toBeInstanceOf(StatuswechselError);
    await expect(calls.cancel(ctx.db, newId("action"), { output: null })).rejects.toMatchObject({
      code: "nicht_gefunden",
    });
  });

  it("Ende mit gekürztem Ergebnis; Abbruch eines laufenden Aufrufs mit unbekanntem Ausgang", async () => {
    const id = await neu(0);
    const b = await gebunden(id);
    await calls.recordDecision(ctx.db, id, {
      outcome: "allow",
      decisionReceiptId: b.entscheidung,
    });
    expect(
      await calls.finish(ctx.db, id, {
        status: "succeeded",
        output: { text: "…" },
        resultReceiptId: b.ergebnis,
        outputTruncated: true,
        outputChars: 40000,
      }),
    ).toMatchObject({ outputTruncated: true, outputChars: 40000 });
    const laeuft = await neu(1);
    await calls.recordDecision(ctx.db, laeuft, {
      outcome: "allow",
      decisionReceiptId: (await gebunden(laeuft)).entscheidung,
    });
    expect(
      await calls.cancel(ctx.db, laeuft, { output: null, errorCode: "ausgang_unbekannt" }),
    ).toMatchObject({ status: "cancelled", errorCode: "ausgang_unbekannt" });
  });

  it("Abbruch beendet offene Aufrufe mit Fehler-Ergebnis", async () => {
    const id = await neu();
    const abgebrochen = await calls.cancel(ctx.db, id, { output: "Abgebrochen." });
    expect(abgebrochen).toMatchObject({
      status: "cancelled",
      resultStatus: "error",
      errorCode: "unterbrochen",
    });
    await expect(calls.cancel(ctx.db, id, { output: "" })).rejects.toBeInstanceOf(
      StatuswechselError,
    );
  });

  it("liest je Lauf und je Antwort in der Reihenfolge der Stellen", async () => {
    const b = await neu(1);
    const a = await neu(0);
    expect((await calls.listForMessages(ctx.db, [ids.messageId])).map((c) => c.actionId)).toEqual([
      a,
      b,
    ]);
    expect((await calls.listForRun(ctx.db, ids.runId)).map((c) => c.actionId).sort()).toEqual(
      [a, b].sort(),
    );
    expect(await calls.listForMessages(ctx.db, [])).toEqual([]);
    expect((await calls.get(ctx.db, a))?.position).toBe(0);
  });
});
