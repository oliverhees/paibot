/**
 * PaiBot – Tests der Datenbank für Werkzeug-Aufrufe mit der App-Rolle gegen echtes Postgres (nur
 * mit PAIBOT_TEST_DATABASE_URL): unveränderliche Spalten scheitern schon an den Rechten,
 * Nachrichten lassen sich nicht einzeln löschen, nur mit ihrer Unterhaltung; die CHECKs und Trigger
 * gelten auch für die App.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { randomBytes } from "node:crypto";
import { type ActionId, newId, type ReceiptId, ZERO_PREV } from "@paibot/shared";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Database } from "./client";
import { runMigrations } from "./migrate";
import { bots, conversations, events, messages, rules, runs, settings, toolCalls } from "./repo";
import { checkMigrationState } from "./rollen";
import { belege, installationKeys } from "./schema";
import { belegRow, hmacDigest, keyRow, sha256Digest } from "./testdaten";
import {
  createPostgresTestDatabase,
  MIGRATIONS_FOLDER,
  migrationsUpTo,
  type PostgresTestDatabase,
  TEST_DATABASE_URL_ENV,
} from "./testing";

const BASE_URL = process.env[TEST_DATABASE_URL_ENV];
const RECHTE = "42501";
const CHECK = "23514";
const RESTRICT = "23001";

async function codeOf(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    const e = error as { code?: string; cause?: { code?: string } };
    return e.code ?? e.cause?.code;
  }
}

describe.skipIf(BASE_URL === undefined)("Werkzeug-Aufrufe mit der App-Rolle (Postgres)", () => {
  const roleName = `paibot_app_test_${randomBytes(4).toString("hex")}`;
  const password = randomBytes(24).toString("hex");
  let database: PostgresTestDatabase;
  let app: postgres.Sql;
  let db: Database;
  let schliessen: () => Promise<void>;
  let freieBelege: ReceiptId[] = [];

  beforeAll(async () => {
    database = await createPostgresTestDatabase(BASE_URL ?? "", { migrate: false });
    const url = new URL(database.url);
    url.username = roleName;
    url.password = password;
    await runMigrations(database.url, MIGRATIONS_FOLDER, { appUrl: url.toString() });
    app = postgres(url.toString(), { max: 2, onnotice: () => undefined });
    const verbindung = createDb(url.toString());
    db = verbindung.db as unknown as Database;
    schliessen = () => verbindung.sql.end({ timeout: 2 });
    await settings.ensure(db);
    const key = keyRow();
    await db.insert(installationKeys).values(key);
    let prevHash = ZERO_PREV;
    for (let seq = 1; seq <= 40; seq++) {
      const row = belegRow(key.id, { seq, prevHash, type: seq === 1 ? "start" : "decision" });
      await db.insert(belege).values(row);
      if (seq > 1) freieBelege.push(row.id);
      prevHash = row.hash;
    }
  }, 60_000);

  afterAll(async () => {
    await app?.end({ timeout: 2 });
    await schliessen?.();
    await database?.drop();
    const cleanup = postgres(BASE_URL ?? "", { max: 1, onnotice: () => undefined });
    try {
      await cleanup.unsafe(`drop role if exists ${roleName}`);
    } finally {
      await cleanup.end({ timeout: 2 });
    }
  });

  const beleg = (): ReceiptId => {
    const [id, ...rest] = freieBelege;
    if (id === undefined) throw new Error("keine Belege mehr");
    freieBelege = rest;
    return id;
  };

  /** Unterhaltung mit Nachricht der Person, laufendem Lauf und Antwort, alles als App-Rolle. */
  async function lauf() {
    const bot = await bots.create(db, {
      name: `Pai ${randomBytes(3).toString("hex")}`,
      avatarShape: "blatt",
      color: "blau",
    });
    const conversation = await conversations.create(db, { botId: bot.id, title: "Werkzeuge" });
    const frage = await messages.insert(db, {
      conversationId: conversation.id,
      role: "user",
      content: "Wie geht der Not-Aus?",
    });
    const run = await runs.create(db, {
      conversationId: conversation.id,
      triggerMessageId: frage.id,
      botId: bot.id,
    });
    await runs.markRunning(db, run.id);
    const antwort = await messages.insert(db, {
      conversationId: conversation.id,
      role: "assistant",
      status: "streaming",
      runId: run.id,
    });
    return { bot, conversation, frage, run, antwort };
  }

  async function aufruf(l: Awaited<ReturnType<typeof lauf>>, position: number): Promise<ActionId> {
    const record = await toolCalls.create(db, {
      actionId: newId("action"),
      conversationId: l.conversation.id,
      runId: l.run.id,
      messageId: l.antwort.id,
      position,
      callId: `c${position}`,
      name: "doku_nachschlagen",
      source: "eingebaut",
      kind: "lesen",
      input: { frage: "Not-Aus" },
      argsDigest: hmacDigest() as never,
      toolKey: "eingebaut/doku.nachschlagen",
      toolDigest: sha256Digest() as never,
      reach: "intern",
      foreignContent: false,
      step: 0,
      untrustedInput: true,
      rawName: "Doku",
    });
    return record.actionId;
  }

  it.each([
    ["tool_key", "'eingebaut/anders'"],
    ["tool_digest", `'sha256:${"0".repeat(64)}'`],
    ["reach", "'nach_aussen'"],
    ["foreign_content", "true"],
    ["step", "1"],
    ["untrusted_input", "false"],
    ["raw_name", "'anders'"],
  ])("%s: die App-Rolle darf es nicht ändern (Rechte)", async (spalte, wert) => {
    const l = await lauf();
    const id = await aufruf(l, 0);
    expect(
      await codeOf(
        app.unsafe(
          `update tool_calls set ${spalte} = ${wert}, status = 'running', decision_receipt_id = $2 where action_id = $1`,
          [id, beleg()],
        ),
      ),
    ).toBe(RECHTE);
  });

  it("Kürzung und Länge des Ergebnisses schreibt die App-Rolle mit dem Ende fort", async () => {
    const l = await lauf();
    const id = await aufruf(l, 0);
    await toolCalls.recordDecision(db, id, { outcome: "allow", decisionReceiptId: beleg() });
    await app.unsafe(
      "update tool_calls set status = 'succeeded', result_status = 'ok', finished_at = now(), output_truncated = true, output_chars = 30000 where action_id = $1",
      [id],
    );
    expect(await toolCalls.get(db, id)).toMatchObject({
      status: "succeeded",
      outputTruncated: true,
      outputChars: 30000,
      untrustedInput: true,
    });
  });

  it("Nachrichten: kein einzelnes Löschen; mit der Unterhaltung geht alles, die Belege bleiben", async () => {
    const l = await lauf();
    expect(await codeOf(app`delete from messages where id = ${l.frage.id}`)).toBe(RECHTE);

    // Zwischentexte, Aufrufe in allen Zuständen dieser Fassung, ein zweiter Lauf mit resumes_run_id.
    for (const step of [0, 1]) {
      await app`insert into messages (id, conversation_id, role, run_id, step) values (${newId("message")}, ${l.conversation.id}, 'assistant', ${l.run.id}, ${step})`;
    }
    const angefragt = await aufruf(l, 0);
    const laeuft = await aufruf(l, 1);
    await toolCalls.recordDecision(db, laeuft, { outcome: "allow", decisionReceiptId: beleg() });
    for (const [position, status] of [
      [2, "succeeded"],
      [3, "failed"],
    ] as const) {
      const id = await aufruf(l, position);
      await toolCalls.recordDecision(db, id, { outcome: "allow", decisionReceiptId: beleg() });
      await toolCalls.finish(db, id, { status, output: null, resultReceiptId: beleg() });
    }
    const abgelehnt = await aufruf(l, 4);
    await toolCalls.recordDecision(db, abgelehnt, {
      outcome: "deny",
      decisionReceiptId: beleg(),
      output: "Abgelehnt.",
    });
    const abgebrochen = await aufruf(l, 5);
    await toolCalls.cancel(db, abgebrochen, { output: null });
    void angefragt;
    const status = await app<{ status: string }[]>`
      select status from tool_calls where conversation_id = ${l.conversation.id} order by position`;
    expect(status.map((z) => z.status)).toEqual([
      "requested",
      "running",
      "succeeded",
      "failed",
      "denied",
      "cancelled",
    ]);
    await messages.finalize(db, l.antwort.id, { status: "complete", content: "Fertig." });
    await runs.finish(db, l.run.id, { status: "succeeded" });
    await runs.create(db, {
      conversationId: l.conversation.id,
      triggerMessageId: l.frage.id,
      botId: l.bot.id,
      resumesRunId: l.run.id,
    });
    const belegeVorher = (await app<{ n: number }[]>`select count(*)::int as n from belege`)[0]?.n;

    expect(await conversations.remove(db, l.conversation.id)).toBe(true);
    for (const tabelle of ["messages", "runs", "tool_calls", "conversation_events"]) {
      const [zeile] = await app.unsafe<{ n: number }[]>(
        `select count(*)::int as n from ${tabelle} where conversation_id = $1`,
        [l.conversation.id],
      );
      expect(zeile?.n, tabelle).toBe(0);
    }
    expect((await app<{ n: number }[]>`select count(*)::int as n from belege`)[0]?.n).toBe(
      belegeVorher,
    );
  });

  it("Grenzen und Ausgabegrenze gelten auch für die App-Rolle", async () => {
    for (const [spalte, wert] of [
      ["max_steps_per_run", 17],
      ["max_tool_calls_per_step", 0],
      ["max_tool_calls_per_run", 65],
      ["max_tokens_per_run", 500001],
      ["tool_result_max_chars", 999],
      ["tool_results_max_chars_per_step", 24001],
    ] as const) {
      expect(await codeOf(app.unsafe(`update settings set ${spalte} = $1`, [wert])), spalte).toBe(
        CHECK,
      );
    }
    const l = await lauf();
    expect(
      await codeOf(app`update bots set max_output_tokens = 200001 where id = ${l.bot.id}`),
    ).toBe(CHECK);
    expect(
      await codeOf(app`update bots set max_output_tokens = 200000 where id = ${l.bot.id}`),
    ).toBe(undefined);
  });

  it("die App-Rolle bringt keinen Lauf in waiting_approval; Herzschlag und Ende gehen", async () => {
    const l = await lauf();
    expect(
      await codeOf(app`update runs set status = 'waiting_approval' where id = ${l.run.id}`),
    ).toBe(RESTRICT);
    expect(await runs.heartbeat(db, l.run.id)).toBe(true);
    await runs.requestCancel(db, l.run.id);
    await runs.finish(db, l.run.id, { status: "cancelled" });
  });

  it("Ereignisse: draft.delta löscht die App-Rolle, step.finished nicht", async () => {
    const l = await lauf();
    await events.append(db, {
      conversationId: l.conversation.id,
      type: "draft.delta",
      data: { runId: l.run.id, step: 0, text: "Ich schaue nach" },
    });
    await events.append(db, {
      conversationId: l.conversation.id,
      type: "step.finished",
      data: { runId: l.run.id, step: 0, ending: "zwischentext" },
    });
    expect(
      await codeOf(
        app`delete from conversation_events where conversation_id = ${l.conversation.id} and type = 'step.finished'`,
      ),
    ).toBe(RESTRICT);
    await app`delete from conversation_events where conversation_id = ${l.conversation.id} and type = 'draft.delta'`;
    const rest = await app<{ type: string }[]>`
      select type from conversation_events where conversation_id = ${l.conversation.id}`;
    expect(rest.map((z) => z.type)).toEqual(["step.finished"]);
  });
});

describe.skipIf(BASE_URL === undefined)(
  "Neuer Code auf einer Datenbank ohne Migration 0014 (Postgres)",
  () => {
    it("der Stand gilt als veraltet, und das Tor bekommt keine Regeln (R-010 fehlt)", async () => {
      const datenbank = await createPostgresTestDatabase(BASE_URL ?? "", { migrate: false });
      const sql = postgres(datenbank.url, { max: 1, onnotice: () => undefined });
      const { db: alt, sql: altSql } = createDb(datenbank.url);
      try {
        await runMigrations(datenbank.url, migrationsUpTo(14));
        expect(await checkMigrationState(sql, MIGRATIONS_FOLDER)).toMatchObject({
          status: "veraltet",
          applied: 14,
        });
        await expect(rules.loadSnapshot(alt as unknown as Database)).rejects.toMatchObject({
          code: "intern",
        });
        await runMigrations(datenbank.url, MIGRATIONS_FOLDER);
        expect((await checkMigrationState(sql, MIGRATIONS_FOLDER)).status).toBe("aktuell");
        const snapshot = await rules.loadSnapshot(alt as unknown as Database);
        expect(snapshot.rules.map((r) => r.id)).toContain("R-010");
      } finally {
        await sql.end({ timeout: 2 });
        await altSql.end({ timeout: 2 });
        await datenbank.drop();
      }
    });
  },
);
