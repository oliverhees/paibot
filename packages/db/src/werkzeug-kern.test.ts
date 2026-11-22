/**
 * PaiBot – Tests der Datenbank für Werkzeug-Aufrufe (Migration 0014): Trigger an Werkzeug-Aufrufen,
 * Nachrichten und Läufen, CHECKs und eindeutige Indizes, Startwerte, Aufräumen vorläufiger
 * Ereignisse und die Abbildung der neuen Felder. Gegen PGlite und (mit PAIBOT_TEST_DATABASE_URL)
 * gegen echtes Postgres 16 mit der Rolle der Migrationen (ohne Rechte-Sperre; die App-Rolle prüft
 * `werkzeug-kern-postgres.test.ts`).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import {
  type ConversationId,
  type MessageId,
  messageSchema,
  newId,
  type ReceiptId,
  type RunId,
  settingsSchema,
  TOOL_CALL_STATUSES,
  type ToolCallStatus,
  toolCallSchema,
  ZERO_PREV,
} from "@paibot/shared";
import { toolEnvelopeSchema } from "@paibot/shared/werkzeug";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, type Database } from "./client";
import { toolCalls as calls, events, messages as nachrichten, settings } from "./repo";
import { TOOL_CALL_TRANSITIONS } from "./repo/werkzeuge";
import { belege, bots, conversations, installationKeys, messages, runs, toolCalls } from "./schema";
import {
  belegRow,
  botRow,
  conversationRow,
  keyRow,
  messageRow,
  runRow,
  toolCallRow,
} from "./testdaten";
import {
  createPostgresTestDatabase,
  createTestDb,
  createTestDbFrom,
  migrateTestDb,
  migrationsUpTo,
  TEST_DATABASE_URL_ENV,
} from "./testing";

const BASE_URL = process.env[TEST_DATABASE_URL_ENV];
const CHECK = "23514";
const UNIQUE = "23505";
const RESTRICT = "23001";

type Zeile = Record<string, unknown>;

/** Eine Datenbank im Test: Drizzle für die Zugriffs-Funktionen, rohes SQL für die Fälle. */
interface Umgebung {
  db: Database;
  q(text: string, params?: unknown[]): Promise<Zeile[]>;
  /** Wie `q`, mit abgeschalteten Triggern (`session_replication_role = replica`, nur im Test). */
  ohneTrigger(text: string, params?: unknown[]): Promise<Zeile[]>;
  schliessen(): Promise<void>;
}

async function pglite(): Promise<Umgebung> {
  const { db, client } = await createTestDb();
  const q = async (text: string, params: unknown[] = []) =>
    (await client.query<Zeile>(text, params)).rows;
  return {
    db,
    q,
    ohneTrigger: async (text, params) => {
      await client.exec("set session_replication_role = replica");
      try {
        return await q(text, params);
      } finally {
        await client.exec("set session_replication_role = origin");
      }
    },
    schliessen: () => client.close(),
  };
}

async function postgres16(): Promise<Umgebung> {
  const datenbank = await createPostgresTestDatabase(BASE_URL ?? "");
  const { db, sql } = createDb(datenbank.url);
  return {
    db: db as unknown as Database,
    q: async (text, params = []) => (await sql.unsafe(text, params as never[])) as Zeile[],
    ohneTrigger: async (text, params = []) =>
      (await sql.begin(async (tx) => {
        await tx.unsafe("set local session_replication_role = replica");
        return tx.unsafe(text, params as never[]);
      })) as unknown as Zeile[],
    schliessen: async () => {
      await sql.end({ timeout: 2 });
      await datenbank.drop();
    },
  };
}

/** Code (SQLSTATE) und Meldung des Fehlers; `undefined`, wenn die Anweisung gelingt. */
async function fehler(versuch: Promise<unknown>): Promise<{ code?: string; message?: string }> {
  try {
    await versuch;
  } catch (error) {
    const e = ((error as { cause?: unknown }).cause ?? error) as {
      code?: string;
      message?: string;
    };
    return { code: e.code, message: e.message };
  }
  return {};
}

const ERLEDIGT: readonly ToolCallStatus[] = ["succeeded", "failed", "denied", "cancelled"];
const ERGEBNIS: Partial<Record<ToolCallStatus, string>> = {
  succeeded: "ok",
  failed: "error",
  denied: "denied",
  cancelled: "error",
};

const umgebungen = [
  { name: "PGlite", anlegen: pglite, aktiv: true },
  { name: "Postgres 16", anlegen: postgres16, aktiv: BASE_URL !== undefined },
] as const;

for (const umgebung of umgebungen) {
  describe.skipIf(!umgebung.aktiv)(`Datenbank für Werkzeug-Aufrufe (${umgebung.name})`, () => {
    let u: Umgebung;
    let botId: ReturnType<typeof botRow>["id"];
    let freieBelege: ReceiptId[] = [];

    beforeAll(async () => {
      u = await umgebung.anlegen();
      const bot = botRow();
      botId = bot.id;
      await u.db.insert(bots).values(bot);
      const key = keyRow();
      await u.db.insert(installationKeys).values(key);
      let prevHash = ZERO_PREV;
      for (let seq = 1; seq <= 400; seq++) {
        const row = belegRow(key.id, { seq, prevHash, type: seq === 1 ? "start" : "decision" });
        await u.db.insert(belege).values(row);
        if (seq > 1) freieBelege.push(row.id);
        prevHash = row.hash;
      }
      kette = { keyId: key.id, seq: 400, prevHash };
    }, 120_000);

    /** Unterhaltung im Körper der angehängten Belege (Entscheidung und Ergebnis müssen gleich sein). */
    const BELEG_UNTERHALTUNG = newId("conversation") as ConversationId;
    /** Aktionen, für die schon eine Entscheidung in der Kette steht. */
    const entschieden = new Set<string>();
    /** Stand der Kette, um Belege genau einer Aktion anzuhängen. */
    let kette: { keyId: ReturnType<typeof keyRow>["id"]; seq: number; prevHash: string };

    /**
     * Beleg genau dieser Aktion: Entscheidung (Standard „erlaubt“) bzw. Ergebnis. Ein Aufruf läuft
     * nur mit der Entscheidung „erlaubt“ seiner Aktion und endet nur mit seinem Ergebnis-Beleg.
     */
    async function belegFuer(
      actionId: unknown,
      type: "decision" | "result",
      option: { outcome?: "allow" | "deny"; status?: "ok" | "error" | "denied" } = {},
    ): Promise<ReceiptId> {
      // Ein Ergebnis folgt immer einer Entscheidung derselben Aktion (Trigger der Belege).
      if (type === "result" && !entschieden.has(String(actionId))) {
        await belegFuer(actionId, "decision");
      }
      if (type === "decision") entschieden.add(String(actionId));
      kette.seq += 1;
      const row = belegRow(kette.keyId, {
        seq: kette.seq,
        prevHash: kette.prevHash,
        type,
        actionId: actionId as never,
        conversationId: BELEG_UNTERHALTUNG,
        ...option,
      });
      await u.db.insert(belege).values(row);
      kette.prevHash = row.hash;
      return row.id as ReceiptId;
    }
    afterAll(async () => {
      await u?.schliessen();
    });

    const beleg = (): ReceiptId => {
      const [id, ...rest] = freieBelege;
      if (id === undefined) throw new Error("keine Belege mehr");
      freieBelege = rest;
      return id;
    };

    /** Unterhaltung mit Nachricht der Person, laufendem Lauf und Antwort des Bots. */
    async function lauf(): Promise<{
      conversationId: ConversationId;
      runId: RunId;
      messageId: MessageId;
      frageId: MessageId;
    }> {
      const conversation = conversationRow(botId);
      await u.db.insert(conversations).values(conversation);
      const frage = messageRow(conversation.id);
      await u.db.insert(messages).values(frage);
      const run = runRow(
        { conversationId: conversation.id, triggerMessageId: frage.id, botId },
        { status: "running" },
      );
      await u.db.insert(runs).values(run);
      const antwort = messageRow(conversation.id, { role: "assistant", runId: run.id });
      await u.db.insert(messages).values(antwort);
      return {
        conversationId: conversation.id,
        runId: run.id,
        messageId: antwort.id,
        frageId: frage.id,
      };
    }

    /** Werkzeug-Aufruf als SQL-Parameter (ohne Trigger direkt in jedem Zustand einfügbar). */
    async function aufrufEinfuegen(
      status: ToolCallStatus,
      abweichung: Record<string, unknown> = {},
      direkt = false,
    ): Promise<string> {
      const ids = await lauf();
      const row = { ...toolCallRow(ids), ...abweichung } as Record<string, unknown>;
      const erledigt = ERLEDIGT.includes(status);
      const werte = {
        action_id: row.actionId,
        conversation_id: row.conversationId,
        run_id: row.runId,
        message_id: row.messageId,
        position: row.position,
        call_id: row.callId,
        name: row.name,
        source: row.source,
        kind: row.kind,
        input: JSON.stringify(row.input),
        args_digest: row.argsDigest,
        status,
        decision_receipt_id: status === "requested" ? null : beleg(),
        result_status: erledigt ? ERGEBNIS[status] : null,
        finished_at: erledigt ? new Date().toISOString() : null,
        tool_key: row.toolKey,
        tool_digest: row.toolDigest,
        reach: row.reach,
        foreign_content: row.foreignContent,
        step: row.step,
        untrusted_input: row.untrustedInput,
        raw_name: row.rawName ?? null,
      };
      const spalten = Object.keys(werte);
      const text = `insert into tool_calls (${spalten.join(", ")}) values (${spalten
        .map((s, i) => (s === "input" ? `$${i + 1}::jsonb` : `$${i + 1}`))
        .join(", ")})`;
      await (direkt ? u.q : u.ohneTrigger)(text, Object.values(werte));
      return String(row.actionId);
    }

    describe("Trigger tool_calls_regeln", () => {
      it("ein Aufruf beginnt immer als angefragt", async () => {
        for (const status of TOOL_CALL_STATUSES.filter((s) => s !== "requested")) {
          const f = await fehler(aufrufEinfuegen(status, {}, true));
          expect(f.code, status).toBe(CHECK);
          expect(f.message, status).toContain("beginnt immer als angefragt");
        }
        await aufrufEinfuegen("requested", {}, true);
      });

      it.each(["toolKey", "toolDigest", "reach", "foreignContent", "step", "untrustedInput"])(
        "ein Aufruf ohne %s wird abgewiesen",
        async (feld) => {
          const f = await fehler(aufrufEinfuegen("requested", { [feld]: null }, true));
          expect(f.code).toBe(CHECK);
          expect(f.message).toContain("braucht Kennung, Abdruck, Wirkung");
        },
      );

      it.each([
        ["untrusted_input", "false"],
        ["step", "3"],
        ["tool_key", "'eingebaut/anders'"],
        ["tool_digest", `'sha256:${"0".repeat(64)}'`],
        ["reach", "'nach_aussen'"],
        ["foreign_content", "true"],
        ["raw_name", "'anders'"],
        ["input", `'{"datum":"morgen"}'::jsonb`],
        ["args_digest", `'hmac-sha256:${"1".repeat(64)}'`],
        ["name", "'anders'"],
        ["source", "'mcp', server = 'notizen'"],
        ["server", "'notizen'"],
        ["kind", "'schreiben'"],
      ])("%s bleibt nach dem Anlegen gleich (auch ohne Rechte-Sperre)", async (spalte, wert) => {
        const id = await aufrufEinfuegen(
          "requested",
          { untrustedInput: true, rawName: "roh" },
          true,
        );
        const f = await fehler(
          u.q(
            `update tool_calls set ${spalte} = ${wert}, status = 'running', decision_receipt_id = $2 where action_id = $1`,
            [id, beleg()],
          ),
        );
        expect(f.code).toBe(RESTRICT);
        expect(f.message).toContain("unveränderlich");
      });

      it("ein Update ohne Zustandswechsel wird abgewiesen", async () => {
        const id = await aufrufEinfuegen("requested", {}, true);
        const f = await fehler(
          u.q("update tool_calls set updated_at = now() where action_id = $1", [id]),
        );
        expect(f.code).toBe(RESTRICT);
      });

      it("die Übergangstabelle im Code ist genau der Trigger (alle Paare)", async () => {
        const erlaubt: string[] = [];
        for (const alt of TOOL_CALL_STATUSES) {
          for (const neu of TOOL_CALL_STATUSES) {
            const id = await aufrufEinfuegen(alt);
            const erledigt = ERLEDIGT.includes(neu);
            // Belege genau dieser Aktion, damit nur der Zustandswechsel geprüft wird.
            const entscheidung =
              alt === "requested"
                ? await belegFuer(id, "decision", { outcome: neu === "denied" ? "deny" : "allow" })
                : null;
            const ergebnis =
              neu === "succeeded" || neu === "failed"
                ? await belegFuer(id, "result", { status: neu === "succeeded" ? "ok" : "error" })
                : null;
            const f = await fehler(
              u.q(
                "update tool_calls set status = $2, result_status = $3, finished_at = $4, decision_receipt_id = coalesce(decision_receipt_id, $5), result_receipt_id = coalesce(result_receipt_id, $6) where action_id = $1",
                [
                  id,
                  neu,
                  erledigt ? ERGEBNIS[neu] : null,
                  erledigt ? new Date().toISOString() : null,
                  entscheidung,
                  ergebnis,
                ],
              ),
            );
            if (f.code === undefined) erlaubt.push(`${alt}>${neu}`);
            else expect(f.code, `${alt}>${neu}`).toBe(RESTRICT);
          }
        }
        const imCode = TOOL_CALL_STATUSES.flatMap((neu) =>
          TOOL_CALL_TRANSITIONS[neu].map((alt) => `${alt}>${neu}`),
        );
        expect(erlaubt.sort()).toEqual(imCode.sort());
        expect(erlaubt.sort()).toEqual(
          [
            "requested>running",
            "requested>denied",
            "requested>cancelled",
            "running>succeeded",
            "running>failed",
            "running>cancelled",
          ].sort(),
        );
      }, 120_000);

      it("die Zugriffs-Funktionen gehen die erlaubten Wege", async () => {
        const ids = await lauf();
        const neu = (position: number) =>
          calls.create(u.db, {
            ...ids,
            actionId: newId("action"),
            position,
            callId: `c${position}`,
            name: "doku_nachschlagen",
            source: "eingebaut",
            kind: "lesen",
            input: { frage: "Not-Aus" },
            argsDigest: `hmac-sha256:${"a".repeat(64)}` as never,
            toolKey: "eingebaut/doku.nachschlagen",
            toolDigest: `sha256:${"b".repeat(64)}` as never,
            reach: "intern",
            foreignContent: false,
            step: 0,
            untrustedInput: false,
          });
        const a = await neu(0);
        await calls.recordDecision(u.db, a.actionId, {
          outcome: "allow",
          decisionReceiptId: await belegFuer(a.actionId, "decision"),
        });
        const fertig = await calls.finish(u.db, a.actionId, {
          status: "succeeded",
          output: { text: "gefunden" },
          resultReceiptId: await belegFuer(a.actionId, "result"),
        });
        expect(fertig.status).toBe("succeeded");
        const b = await neu(1);
        expect((await calls.cancel(u.db, b.actionId, { output: null })).status).toBe("cancelled");
      });
    });

    describe("Offene Aufrufe eines Laufs beenden (Aufräumen)", () => {
      it("angefragt → unterbrochen, laufend je nach Wirkung, ohne Wirkung wie nach außen; nie wiederholt", async () => {
        const ids = await lauf();
        const zeile = async (
          position: number,
          status: "requested" | "running",
          abweichung: Record<string, unknown> = {},
        ) => {
          const row = { ...toolCallRow(ids, { position, callId: `c${position}` }), ...abweichung };
          await u.db.insert(toolCalls).values(row);
          if (status === "running") {
            await u.q(
              "update tool_calls set status = 'running', decision_receipt_id = $2 where action_id = $1",
              [row.actionId, await belegFuer(row.actionId, "decision")],
            );
          }
          return row.actionId;
        };
        const a = await zeile(0, "requested");
        const b = await zeile(1, "running");
        const c = await zeile(2, "running", {
          kind: "schreiben",
          toolKey: "eingebaut/notiz.schreiben",
        });
        const d = await zeile(3, "running", { reach: "nach_aussen" });
        // Zeile aus der Zeit vor den Pflicht-Angaben (ohne Kennung und Wirkung).
        const e = await aufrufEinfuegen("running", { toolKey: null, reach: null });
        await u.ohneTrigger(
          "update tool_calls set run_id = $2, message_id = $3, position = 4 where action_id = $1",
          [e, ids.runId, ids.messageId],
        );
        expect(await calls.endOpenForRun(u.db, ids.runId)).toBe(5);
        const ende = Object.fromEntries(
          (await calls.listForRun(u.db, ids.runId)).map((x) => [
            x.actionId,
            [
              x.status,
              x.resultStatus,
              x.errorCode,
              (x.output as { code?: string } | undefined)?.code ?? null,
            ],
          ]),
        );
        expect(ende).toEqual({
          [a]: ["cancelled", "error", "unterbrochen", "unterbrochen"],
          [b]: ["cancelled", "error", "unterbrochen", "unterbrochen"],
          [c]: ["cancelled", "error", "ausgang_unbekannt", "ausgang_unbekannt"],
          [d]: ["cancelled", "error", "ausgang_unbekannt", "ausgang_unbekannt"],
          [e]: ["cancelled", "error", "ausgang_unbekannt", null],
        });
        const huelle = (await calls.get(u.db, c))?.output;
        expect(toolEnvelopeSchema.safeParse(huelle).success).toBe(true);
        expect(await calls.endOpenForRun(u.db, ids.runId)).toBe(0);
        const f = await fehler(
          u.q("update tool_calls set status = 'running' where action_id = $1", [a]),
        );
        expect(f.code).toBe(RESTRICT);
      });
    });

    describe("Trigger messages_unveraenderlich", () => {
      it.each([
        ["step von einer Zahl auf leer", "step = null", 1],
        ["step von leer auf eine Zahl", "step = 2", null],
        ["Herkunft auf fest", "origin = 'fest'", null],
        ["Rolle", "role = 'system'", null],
        ["Lauf", "run_id = null", null],
      ])("%s wird abgewiesen", async (_name, set, step) => {
        const ids = await lauf();
        // Ohne Schritt: die End-Antwort des Laufs; mit Schritt: ein Zwischentext.
        let id: MessageId = ids.messageId;
        if (step !== null) {
          const zwischen = messageRow(ids.conversationId, {
            role: "assistant",
            runId: ids.runId,
            step,
          });
          await u.db.insert(messages).values(zwischen);
          id = zwischen.id;
        }
        const f = await fehler(u.q(`update messages set ${set} where id = $1`, [id]));
        expect(f.code).toBe(RESTRICT);
        expect(f.message).toContain("unveränderlich");
      });

      it("die Unterhaltung einer Nachricht bleibt gleich", async () => {
        const a = await lauf();
        const b = await lauf();
        const f = await fehler(
          u.q("update messages set conversation_id = $2 where id = $1", [
            a.frageId,
            b.conversationId,
          ]),
        );
        expect(f.code).toBe(RESTRICT);
      });

      it("Abschließen einer streamenden Antwort geht weiter", async () => {
        const ids = await lauf();
        const antwort = await nachrichten.insert(u.db, {
          conversationId: ids.conversationId,
          role: "assistant",
          status: "streaming",
          runId: newId("run"),
        });
        const fertig = await nachrichten.finalize(u.db, antwort.id, {
          status: "complete",
          content: "Fertig.",
          tokensIn: 10,
          tokensOut: 2,
          servedBy: { provider: "beispiel", model: "m-1" },
        });
        expect(fertig).toMatchObject({ status: "complete", content: "Fertig.", origin: "modell" });
      });
    });

    describe("Nachrichten: Schritt, Herkunft, eine End-Antwort je Lauf", () => {
      async function einfuegen(werte: Record<string, unknown>) {
        const ids = await lauf();
        return fehler(
          u.db
            .insert(messages)
            .values(
              messageRow(ids.conversationId, { role: "assistant", runId: ids.runId, ...werte }),
            ),
        );
      }

      it("zweite End-Antwort im selben Lauf wird abgewiesen", async () => {
        const f = await einfuegen({});
        expect(f.code).toBe(UNIQUE);
        expect(f.message).toContain("messages_eine_antwort_je_lauf");
      });

      it("zweiter Zwischentext mit gleichem Schritt im selben Lauf wird abgewiesen", async () => {
        const ids = await lauf();
        const zwischen = (step: number) =>
          u.db
            .insert(messages)
            .values(messageRow(ids.conversationId, { role: "assistant", runId: ids.runId, step }));
        await zwischen(0);
        await zwischen(1);
        const f = await fehler(zwischen(1));
        expect(f.code).toBe(UNIQUE);
        expect(f.message).toContain("messages_ein_schritt");
      });

      it.each([
        [
          "fester Text der Person",
          { role: "user", runId: null, origin: "fest" },
          "messages_fest_nur_bot",
        ],
        [
          "Schritt bei der Person",
          { role: "user", runId: null, step: 0 },
          "messages_schritt_nur_bot",
        ],
        ["Schritt ohne Lauf", { runId: null, step: 0 }, "messages_schritt_nur_bot"],
        ["negativer Schritt", { step: -1 }, "messages_step_nicht_negativ"],
        ["unbekannte Herkunft", { step: 5, origin: "werkzeug" }, "messages_origin_werte"],
      ])("%s wird abgewiesen", async (_name, werte, constraint) => {
        const f = await einfuegen(werte);
        expect(f.code).toBe(CHECK);
        expect(f.message).toContain(constraint);
      });

      it("End-Antwort, Zwischentexte und „neu erzeugen“ (zwei Läufe zu einer Frage) gehen", async () => {
        const ids = await lauf();
        for (const step of [0, 1]) {
          await u.db
            .insert(messages)
            .values(messageRow(ids.conversationId, { role: "assistant", runId: ids.runId, step }));
        }
        await u.q("update runs set status = 'succeeded' where id = $1", [ids.runId]);
        const zweiter = runRow({
          conversationId: ids.conversationId,
          triggerMessageId: ids.frageId,
          botId,
        });
        await u.db.insert(runs).values(zweiter);
        await u.db
          .insert(messages)
          .values(messageRow(ids.conversationId, { role: "assistant", runId: zweiter.id }));
        await u.db.insert(messages).values(
          messageRow(ids.conversationId, {
            role: "assistant",
            runId: zweiter.id,
            origin: "fest",
            step: 0,
          }),
        );
        const zeilen = await u.q(
          "select count(*)::int as n from messages where conversation_id = $1 and role = 'assistant'",
          [ids.conversationId],
        );
        expect(Number(zeilen[0]?.n)).toBe(5);
      });
    });

    describe("Grenzen in den Einstellungen und Ausgabegrenze der Bots", () => {
      beforeAll(async () => {
        await settings.ensure(u.db);
      });

      it.each([
        ["max_steps_per_run", 0, 17, [1, 16], "settings_max_steps_per_run_bereich"],
        ["max_tool_calls_per_step", 0, 17, [1, 16], "settings_max_tool_calls_per_step_bereich"],
        ["max_tool_calls_per_run", 0, 65, [1, 64], "settings_max_tool_calls_per_run_bereich"],
        ["max_tokens_per_run", 999, 500001, [1000, 500000], "settings_max_tokens_per_run_bereich"],
        [
          "tool_result_max_chars",
          999,
          24001,
          [1000, 24000],
          "settings_tool_result_max_chars_bereich",
        ],
        [
          "tool_results_max_chars_per_step",
          999,
          24001,
          [1000, 24000],
          "settings_tool_results_max_chars_per_step_bereich",
        ],
      ] as const)(
        "%s: außerhalb abgewiesen, Grenzen gehen",
        async (spalte, unten, oben, gut, constraint) => {
          for (const wert of [unten, oben]) {
            const f = await fehler(u.q(`update settings set ${spalte} = $1`, [wert]));
            expect(f.code, String(wert)).toBe(CHECK);
            expect(f.message, String(wert)).toContain(constraint);
          }
          for (const wert of gut) {
            // Die Zeichen je Ergebnis dürfen nicht über denen je Schritt liegen: dort beide setzen.
            await u.q(
              spalte === "tool_results_max_chars_per_step"
                ? `update settings set tool_result_max_chars = least(tool_result_max_chars, $1), ${spalte} = $1`
                : `update settings set ${spalte} = $1`,
              [wert],
            );
          }
          await u.q(
            "update settings set max_steps_per_run = 8, max_tool_calls_per_step = 8, max_tool_calls_per_run = 16, max_tokens_per_run = 60000, tool_result_max_chars = 16000, tool_results_max_chars_per_step = 24000",
          );
        },
      );

      it("Zeichen je Ergebnis über denen je Schritt wird abgewiesen", async () => {
        const f = await fehler(
          u.q(
            "update settings set tool_result_max_chars = 20000, tool_results_max_chars_per_step = 16000",
          ),
        );
        expect(f.code).toBe(CHECK);
        expect(f.message).toContain("settings_werkzeug_zeichen_passen");
      });

      it("Startwerte einer neuen Installation", async () => {
        const s = await settings.get(u.db);
        expect(s).toMatchObject({
          maxStepsPerRun: 8,
          maxToolCallsPerStep: 8,
          maxToolCallsPerRun: 16,
          maxTokensPerRun: 60000,
          toolResultMaxChars: 16000,
          toolResultsMaxCharsPerStep: 24000,
        });
        expect(settingsSchema.safeParse(s).success).toBe(true);
      });

      it("Ausgabegrenze eines Bots höchstens 200 000", async () => {
        const f = await fehler(
          u.q("update bots set max_output_tokens = 200001 where id = $1", [botId]),
        );
        expect(f.code).toBe(CHECK);
        expect(f.message).toContain("bots_max_output_tokens_hoechstens");
        await u.q("update bots set max_output_tokens = 200000 where id = $1", [botId]);
        await u.q("update bots set max_output_tokens = 4096 where id = $1", [botId]);
      });
    });

    describe("Trigger runs_regeln", () => {
      it("kein Weg nach waiting_approval, weder per Wechsel noch beim Anlegen", async () => {
        const ids = await lauf();
        const f = await fehler(
          u.q("update runs set status = 'waiting_approval' where id = $1", [ids.runId]),
        );
        expect(f.code).toBe(RESTRICT);
        expect(f.message).toContain("wartet kein Lauf");
        const g = await fehler(
          u.db.insert(runs).values(
            runRow(
              {
                conversationId: (await lauf()).conversationId,
                triggerMessageId: ids.frageId,
                botId,
              },
              { status: "waiting_approval" },
            ),
          ),
        );
        expect(g.code).toBe(RESTRICT);
      });

      it("Herzschlag, Stopp-Vermerk, queued → running, running → running und set null gehen", async () => {
        const ids = await lauf();
        await u.q("update runs set heartbeat_at = now() where id = $1", [ids.runId]);
        await u.q("update runs set cancel_requested_at = now() where id = $1", [ids.runId]);
        await u.q("update runs set status = 'running' where id = $1", [ids.runId]);
        await u.q("update runs set status = 'succeeded' where id = $1", [ids.runId]);
        const zweiter = runRow(
          { conversationId: ids.conversationId, triggerMessageId: ids.frageId, botId },
          { resumesRunId: ids.runId },
        );
        await u.db.insert(runs).values(zweiter);
        await u.q("update runs set status = 'running' where id = $1", [zweiter.id]);
        await u.q("delete from runs where id = $1", [ids.runId]);
        const [z] = await u.q("select resumes_run_id from runs where id = $1", [zweiter.id]);
        expect(z?.resumes_run_id).toBeNull();
      });

      it("ein wartender Lauf aus der Zeit davor kann noch enden", async () => {
        const ids = await lauf();
        await u.ohneTrigger("update runs set status = 'waiting_approval' where id = $1", [
          ids.runId,
        ]);
        await u.q("update runs set status = 'succeeded' where id = $1", [ids.runId]);
      });
    });

    describe("Ereignisse: draft.delta löschbar wie text.delta", () => {
      it("Aufräumen löscht alte text.delta und draft.delta beendeter Läufe, sonst nichts", async () => {
        const fertig = await lauf();
        const aktiv = await lauf();
        await u.q("update runs set status = 'succeeded' where id = $1", [fertig.runId]);
        for (const ids of [fertig, aktiv]) {
          await events.append(u.db, {
            conversationId: ids.conversationId,
            type: "text.delta",
            data: { runId: ids.runId, messageId: ids.messageId, text: "Hal" },
          });
          await events.append(u.db, {
            conversationId: ids.conversationId,
            type: "draft.delta",
            data: { runId: ids.runId, step: 0, text: "Ich schaue nach" },
          });
          await events.append(u.db, {
            conversationId: ids.conversationId,
            type: "step.finished",
            data: { runId: ids.runId, step: 0, ending: "zwischentext" },
          });
          await events.append(u.db, {
            conversationId: ids.conversationId,
            type: "tool.started",
            data: { runId: ids.runId, actionId: newId("action") },
          });
        }
        const zukunft = new Date(Date.now() + 60_000);
        expect(await events.pruneTextDeltas(u.db, { olderThan: zukunft })).toBeGreaterThanOrEqual(
          2,
        );
        const typen = async (conversationId: ConversationId) =>
          (
            await u.q(
              "select type from conversation_events where conversation_id = $1 order by seq",
              [conversationId],
            )
          ).map((z) => z.type);
        expect(await typen(fertig.conversationId)).toEqual(["step.finished", "tool.started"]);
        expect(await typen(aktiv.conversationId)).toEqual([
          "text.delta",
          "draft.delta",
          "step.finished",
          "tool.started",
        ]);
        const f = await fehler(
          u.q(
            "delete from conversation_events where conversation_id = $1 and type = 'step.finished'",
            [fertig.conversationId],
          ),
        );
        expect(f.code).toBe(RESTRICT);
        expect(f.message).toContain("text.delta und draft.delta");
      });

      it("die neuen Arten stehen im CHECK, tool.held nicht", async () => {
        const ids = await lauf();
        const f = await fehler(
          u.q(
            "insert into conversation_events (conversation_id, seq, type, payload) values ($1, 99, 'tool.held', '{}'::jsonb)",
            [ids.conversationId],
          ),
        );
        expect(f.code).toBe(CHECK);
      });
    });

    describe("Abbildung der neuen Felder", () => {
      it("Nachricht: Schritt und Herkunft", async () => {
        const ids = await lauf();
        const zwischen = messageRow(ids.conversationId, {
          role: "assistant",
          runId: ids.runId,
          step: 2,
          origin: "fest",
        });
        await u.db.insert(messages).values(zwischen);
        const gelesen = await nachrichten.get(u.db, zwischen.id);
        expect(gelesen).toMatchObject({ step: 2, origin: "fest" });
        expect(messageSchema.safeParse(gelesen).success).toBe(true);
        const frage = await nachrichten.get(u.db, ids.frageId);
        expect(frage?.origin).toBe("modell");
        expect(frage).not.toHaveProperty("step");
      });

      it("Werkzeug-Aufruf: alle neuen Felder", async () => {
        const id = await aufrufEinfuegen(
          "requested",
          { rawName: "Doku Suche!", untrustedInput: true },
          true,
        );
        await u.q(
          "update tool_calls set status = 'running', decision_receipt_id = $2 where action_id = $1",
          [id, await belegFuer(id, "decision")],
        );
        await u.q(
          "update tool_calls set status = 'succeeded', result_status = 'ok', finished_at = now(), output_truncated = true, output_chars = 30000, result_receipt_id = $2 where action_id = $1",
          [id, await belegFuer(id, "result")],
        );
        const gelesen = await calls.get(u.db, id as never);
        expect(gelesen).toMatchObject({
          toolKey: "eingebaut/kalender.lesen",
          reach: "intern",
          foreignContent: false,
          step: 0,
          untrustedInput: true,
          rawName: "Doku Suche!",
          outputTruncated: true,
          outputChars: 30000,
        });
        expect(gelesen?.toolDigest).toMatch(/^sha256:/);
        expect(toolCallSchema.safeParse(gelesen).success).toBe(true);
      });
    });
  });
}

describe("Muster der Werkzeug-Kennung in der Datenbank", () => {
  it.each([
    ["eingebaut/doku.nachschlagen", true],
    ["mcp/server/name", true],
    ["mcp/a/b/c", false],
    ["Eingebaut/doku", false],
    [`${"a".repeat(10)}/${"b".repeat(64)}/${"c".repeat(64)}`, true],
    [`${"a".repeat(11)}/${"b".repeat(64)}/${"c".repeat(64)}`, false],
  ])("%s → %s", async (key, gueltig) => {
    const { toolKeySchema } = await import("@paibot/shared");
    expect(toolKeySchema.safeParse(key).success).toBe(gueltig);
    const { client } = await createTestDb();
    const [zeile] = (
      await client.query<{ ok: boolean }>(
        "select (char_length($1::text) <= 140 and $1::text ~ '^[a-z][a-z0-9]*(/[a-z0-9][a-z0-9_.-]{0,63}){1,2}$') as ok",
        [key],
      )
    ).rows;
    expect(zeile?.ok).toBe(gueltig);
    const [check] = (
      await client.query<{ def: string }>(
        "select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'tool_calls_tool_key_format'",
      )
    ).rows;
    expect(check?.def).toContain("^[a-z][a-z0-9]*(/[a-z0-9][a-z0-9_.-]{0,63}){1,2}$");
  });
});

describe("Startwert der Token-Grenze je Lauf beim Update", () => {
  async function aufstieg(grenzen: number[]): Promise<{ tokens: number; bots: number[] }> {
    const test = await createTestDbFrom(migrationsUpTo(14));
    await test.client.query("insert into settings default values");
    for (const grenze of grenzen) {
      await test.client.query(
        "insert into bots (id, name, avatar_shape, color, max_output_tokens) values ($1, $2, 'blatt', 'blau', $3)",
        [newId("bot"), `Bot ${grenze}-${Math.random()}`, grenze],
      );
    }
    await migrateTestDb(test);
    const [s] = (
      await test.client.query<{ n: number }>("select max_tokens_per_run as n from settings")
    ).rows;
    const b = (
      await test.client.query<{ n: number }>("select max_output_tokens as n from bots order by 1")
    ).rows;
    return { tokens: Number(s?.n), bots: b.map((z) => Number(z.n)) };
  }

  it("Bots mit 4 096 und 100 000 → 130 000", async () => {
    expect((await aufstieg([4096, 100000])).tokens).toBe(130000);
  });

  it("Bot über 200 000 wird auf 200 000 gesetzt, Startwert 230 000", async () => {
    expect(await aufstieg([250000, 4096])).toEqual({ tokens: 230000, bots: [4096, 200000] });
  });

  it("ohne Bots oder nur mit 4 096 → 60 000; frische Datenbank → 60 000", async () => {
    expect((await aufstieg([])).tokens).toBe(60000);
    expect((await aufstieg([4096])).tokens).toBe(60000);
    const { db } = await createTestDb();
    expect((await settings.ensure(db)).maxTokensPerRun).toBe(60000);
  });

  it("bricht mit verständlicher Meldung ab, wenn ein Lauf zwei Antworten des Bots hat", async () => {
    const test = await createTestDbFrom(migrationsUpTo(14));
    // Stand 0013: rohes SQL, das Schema im Code kennt schon die neuen Spalten.
    const bot = newId("bot");
    const conversation = newId("conversation");
    const frage = newId("message");
    const run = { id: newId("run") };
    await test.client.query(
      "insert into bots (id, name, avatar_shape, color) values ($1, 'Pai', 'blatt', 'blau')",
      [bot],
    );
    await test.client.query("insert into conversations (id, bot_id, title) values ($1, $2, 't')", [
      conversation,
      bot,
    ]);
    await test.client.query(
      "insert into messages (id, conversation_id, role) values ($1, $2, 'user')",
      [frage, conversation],
    );
    await test.client.query(
      "insert into runs (id, conversation_id, trigger_message_id, bot_id) values ($1, $2, $3, $4)",
      [run.id, conversation, frage, bot],
    );
    for (let i = 0; i < 2; i++) {
      await test.client.query(
        "insert into messages (id, conversation_id, role, content, run_id) values ($1, $2, 'assistant', 'x', $3)",
        [newId("message"), conversation, run.id],
      );
    }
    const f = await fehler(migrateTestDb(test));
    expect(f.message).toContain("mehr als eine Antwort des Bots");
    const spalten = (
      await test.client.query<{ n: number }>(
        "select count(*)::int as n from information_schema.columns where table_name = 'messages' and column_name = 'step'",
      )
    ).rows;
    expect(Number(spalten[0]?.n)).toBe(0);
  });
});

describe("Für später nichts verbaut", () => {
  it("die Warte-Zustände stehen weiter im CHECK; eine Trigger-Funktion ist ersetzbar", async () => {
    const { client } = await createTestDb();
    const defs = (
      await client.query<{ def: string; name: string }>(
        "select conname as name, pg_get_constraintdef(oid) as def from pg_constraint where conname in ('tool_calls_status_werte', 'runs_status_werte')",
      )
    ).rows;
    for (const d of defs) expect(d.def, d.name).toContain("waiting_approval");
    expect(defs.find((d) => d.name === "tool_calls_status_werte")?.def).toContain("approved");
    // Eine spätere Migration ersetzt nur die Funktion: danach gilt ihr neues Verhalten.
    await client.exec(`CREATE OR REPLACE FUNCTION paibot_runs_regeln() RETURNS trigger
      LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$ BEGIN RETURN NEW; END; $$;`);
    const bot = botRow();
    await client.query(
      "insert into bots (id, name, avatar_shape, color) values ($1, $2, 'blatt', 'blau')",
      [bot.id, bot.name],
    );
    const conversation = conversationRow(bot.id);
    await client.query("insert into conversations (id, bot_id, title) values ($1, $2, 't')", [
      conversation.id,
      bot.id,
    ]);
    const frage = newId("message");
    await client.query("insert into messages (id, conversation_id, role) values ($1, $2, 'user')", [
      frage,
      conversation.id,
    ]);
    await client.query(
      "insert into runs (id, conversation_id, trigger_message_id, bot_id, status) values ($1, $2, $3, $4, 'waiting_approval')",
      [newId("run"), conversation.id, frage, bot.id],
    );
  });
});

/**
 * Legt eine Zeile in einer Datenbank im alten Stand an: mit rohem SQL und nur den Spalten, die in
 * diesem Stand schon da sind (das Schema im Code kennt die neueren Spalten).
 */
async function alteZeile(
  client: { query(sql: string, params?: unknown[]): Promise<unknown> },
  tabelle: string,
  zeile: Record<string, unknown>,
): Promise<void> {
  const neu = new Set(["untrusted", "appId", "appToolId", "toolVersion"]);
  const eintraege = Object.entries(zeile).filter(
    ([name, wert]) => !neu.has(name) && wert !== undefined,
  );
  const spalten = eintraege.map(([name]) => name.replace(/[A-Z]/g, (b) => `_${b.toLowerCase()}`));
  const werte = eintraege.map(([, wert]) =>
    wert instanceof Date
      ? wert.toISOString()
      : typeof wert === "object" && wert !== null
        ? JSON.stringify(wert)
        : wert,
  );
  await client.query(
    `insert into ${tabelle} (${spalten.join(", ")}) values (${werte.map((_, i) => `$${i + 1}`).join(", ")})`,
    werte,
  );
}

describe("Aufstieg auf die Bindung der Belege (Stand 0014 → neuester)", () => {
  // Gegenprobe: in der Migration Zeilen ändern (z. B. `UPDATE tool_calls SET output = null`) → rot.
  it("Bestandsdaten aus dem Stand 0014 bleiben ohne Verlust; alte Zeilen bleiben, neue Wechsel sind gebunden", async () => {
    const test = await createTestDbFrom(migrationsUpTo(15));
    const bot = botRow();
    await test.db.insert(bots).values(bot);
    const conversation = conversationRow(bot.id);
    await test.db.insert(conversations).values(conversation);
    const frage = messageRow(conversation.id);
    await alteZeile(test.client, "messages", frage);
    const run = runRow({
      conversationId: conversation.id,
      triggerMessageId: frage.id,
      botId: bot.id,
    });
    await test.db.insert(runs).values(run);
    const antwort = messageRow(conversation.id, { role: "assistant", runId: run.id, step: 0 });
    await alteZeile(test.client, "messages", antwort);
    const key = keyRow();
    await test.db.insert(installationKeys).values(key);
    const ids = { conversationId: conversation.id, runId: run.id, messageId: antwort.id };
    let prevHash = ZERO_PREV;
    const frei: string[] = [];
    for (let seq = 1; seq <= 12; seq++) {
      const row = belegRow(key.id, { seq, prevHash, type: seq === 1 ? "start" : "decision" });
      await test.db.insert(belege).values(row);
      if (seq > 1) frei.push(row.id);
      prevHash = row.hash;
    }
    // Zeilen in jedem Zustand mit Belegen, die zu anderen Aktionen gehören (vor der Bindung möglich).
    await test.client.exec("set session_replication_role = replica");
    for (const [position, status] of [
      "requested",
      "running",
      "succeeded",
      "failed",
      "denied",
      "cancelled",
    ].entries()) {
      const erledigt = !["requested", "running"].includes(status);
      await alteZeile(
        test.client,
        "tool_calls",
        toolCallRow(ids, {
          position,
          callId: `c${position}`,
          status: status as never,
          ...(status === "requested" ? {} : { decisionReceiptId: frei[position] as never }),
          ...(status === "succeeded" || status === "failed"
            ? { resultReceiptId: frei[position + 6] as never }
            : {}),
          ...(erledigt
            ? {
                resultStatus:
                  status === "succeeded" ? "ok" : status === "denied" ? "denied" : "error",
                finishedAt: new Date(),
                output: { text: `Ergebnis ${position}` },
              }
            : {}),
        }),
      );
    }
    await test.client.exec("set session_replication_role = origin");
    const lesen = async () =>
      (
        await test.client.query<{ z: unknown }>(
          "select to_jsonb(t) - 'app_id' - 'app_tool_id' - 'tool_version' as z from tool_calls t order by position",
        )
      ).rows;
    const vorher = await lesen();
    const tabellen = async () =>
      (
        await test.client.query<{ n: number }>(
          "select (select count(*) from tool_calls) + (select count(*) from messages) * 1000 + (select count(*) from belege) * 1000000 as n",
        )
      ).rows[0]?.n;
    const zahlenVorher = await tabellen();
    await migrateTestDb(test);
    expect(await lesen()).toEqual(vorher);
    expect(await tabellen()).toEqual(zahlenVorher);
    const migrationen = await test.client.query<{ n: number }>(
      "select count(*)::int as n from drizzle.__drizzle_migrations",
    );
    expect(migrationen.rows[0]?.n).toBe(17);
    // Nach dem Aufstieg ist ein neuer Wechsel mit fremder Entscheidung nicht mehr möglich.
    const neu = toolCallRow(ids, { position: 9, callId: "neu" });
    await test.db.insert(toolCalls).values(neu);
    const f = await test.client
      .query(
        "update tool_calls set status = 'running', decision_receipt_id = $2 where action_id = $1",
        [neu.actionId, frei[10]],
      )
      .then(
        () => undefined,
        (error: { code?: string }) => error.code,
      );
    expect(f).toBe("23001");
  });
});
