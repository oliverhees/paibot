/**
 * PaiBot – Tests der Auftrags-Bearbeitung gegen eine Datenbank im Speicher: Fehler der
 * Lauf-Steuerung führen zu „fehlgeschlagen“ mit Ereignis, die Bearbeitung läuft weiter.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { executeRun, RunDeps } from "@paibot/agents";
import { type Database, repo } from "@paibot/db";
import { createTestDb } from "@paibot/db/testing";
import type { RunJob } from "@paibot/jobs";
import { errorText } from "@paibot/shared/texte";
import { beforeEach, describe, expect, it } from "vitest";
import { createRunHandler } from "./lauf";
import type { WorkerLog } from "./protokoll";

const GEHEIMER_TEXT = "Mein Kontostand ist streng vertraulich";

let db: Database;
let botCount = 0;
let lines: string[];
let log: WorkerLog;

beforeEach(async () => {
  db = (await createTestDb()).db;
  lines = [];
  log = {
    info: (m) => lines.push(`info ${m}`),
    warn: (m) => lines.push(`warn ${m}`),
    error: (m) => lines.push(`error ${m}`),
  };
});

async function queuedRun(): Promise<RunJob> {
  const bot = await repo.bots.create(db, {
    name: `Pai ${++botCount}`,
    avatarShape: "blatt",
    color: "blau",
  });
  const conversation = await repo.conversations.create(db, { botId: bot.id, title: "U" });
  const message = await repo.messages.insert(db, {
    conversationId: conversation.id,
    role: "user",
    content: GEHEIMER_TEXT,
  });
  const run = await repo.runs.create(db, {
    conversationId: conversation.id,
    triggerMessageId: message.id,
    botId: bot.id,
  });
  return { runId: run.id, conversationId: conversation.id };
}

const fakeRunDeps = async () => ({}) as RunDeps;
/** Eine Lauf-Steuerung, die wirft (wie bei einem Fehler der Datenbank). */
const broken: typeof executeRun = async () => {
  throw new Error("connection terminated");
};
const signal = () => new AbortController().signal;

describe("Auftrag bearbeiten", () => {
  it("Lauf-Steuerung wirft: Lauf fehlgeschlagen mit Ereignis, nichts geworfen", async () => {
    const runs = createRunHandler({
      db,
      executeRun: broken,
      prepareRunDeps: fakeRunDeps,
      log,
      secrets: [],
    });
    const job = await queuedRun();
    await expect(runs.handler(job, signal())).resolves.toBeUndefined();

    const run = await repo.runs.get(db, job.runId);
    expect(run?.status).toBe("failed");
    expect(run?.errorCode).toBe("intern");
    const events = await repo.events.listSince(db, job.conversationId);
    expect(events.map((e) => e.type)).toEqual(["run.failed"]);
    expect(events[0]?.data).toEqual({
      runId: job.runId,
      code: "intern",
      text: errorText("intern"),
    });
    expect(lines).toEqual([
      `info Lauf ${job.runId} angenommen.`,
      `error Lauf ${job.runId} gescheitert: Error: connection terminated`,
      `info Lauf ${job.runId} als fehlgeschlagen markiert (intern).`,
    ]);
    expect(runs.active()).toEqual([]);
  });

  it("die Bearbeitung läuft nach einem Fehler weiter (nächster Auftrag, gleiche und andere Unterhaltung)", async () => {
    const runs = createRunHandler({
      db,
      executeRun: broken,
      prepareRunDeps: fakeRunDeps,
      log,
      secrets: [],
    });
    const first = await queuedRun();
    await runs.handler(first, signal());
    const second = await queuedRun();
    await runs.handler(second, signal());
    const message = await repo.messages.insert(db, {
      conversationId: first.conversationId,
      role: "user",
      content: "noch eine Frage",
    });
    const run = await repo.runs.create(db, {
      conversationId: first.conversationId,
      triggerMessageId: message.id,
      botId: (await repo.runs.get(db, first.runId))?.botId as never,
    });
    await runs.handler({ runId: run.id, conversationId: first.conversationId }, signal());
    for (const id of [first.runId, second.runId, run.id]) {
      expect((await repo.runs.get(db, id))?.status).toBe("failed");
    }
  });

  it("ein Datenbank-Fehler der Lauf-Steuerung endet ebenso als „fehlgeschlagen“", async () => {
    const runs = createRunHandler({
      db,
      executeRun: async () => {
        throw new Error("deadlock detected");
      },
      prepareRunDeps: fakeRunDeps,
      log,
      secrets: [],
    });
    const job = await queuedRun();
    await runs.handler(job, signal());
    expect((await repo.runs.get(db, job.runId))?.status).toBe("failed");
    expect(lines[1]).toBe(`error Lauf ${job.runId} gescheitert: Error: deadlock detected`);
  });

  it("ein Ausgang der Lauf-Steuerung wird nur protokolliert, der Lauf bleibt, wie sie ihn setzte", async () => {
    const runs = createRunHandler({
      db,
      executeRun: async (runId) => ({ runId, status: "succeeded" }),
      prepareRunDeps: fakeRunDeps,
      log,
      secrets: [],
    });
    const job = await queuedRun();
    await runs.handler(job, signal());
    expect((await repo.runs.get(db, job.runId))?.status).toBe("queued");
    expect(lines[1]).toMatch(new RegExp(`^info Lauf ${job.runId} beendet: succeeded, \\d+ ms\\.$`));
  });

  it("schon beendete, unbekannte oder fremde Läufe bleiben unverändert", async () => {
    const runs = createRunHandler({
      db,
      executeRun: broken,
      prepareRunDeps: fakeRunDeps,
      log,
      secrets: [],
    });
    const job = await queuedRun();
    await repo.runs.finish(db, job.runId, { status: "cancelled" });
    await runs.handler(job, signal());
    expect((await repo.runs.get(db, job.runId))?.status).toBe("cancelled");

    const other = await queuedRun();
    await runs.handler({ runId: other.runId, conversationId: job.conversationId }, signal());
    expect((await repo.runs.get(db, other.runId))?.status).toBe("queued");

    const unknown = await queuedRun();
    await runs.handler({ ...unknown, runId: `${unknown.runId.slice(0, -1)}0` as never }, signal());
    expect(lines.some((l) => l.includes("nicht gefunden"))).toBe(true);
    expect(await repo.events.listSince(db, job.conversationId)).toEqual([]);
  });

  it("das Abbruch-Signal des Auftrags kommt bei der Lauf-Steuerung an", async () => {
    let seen: AbortSignal | undefined;
    const runs = createRunHandler({
      db,
      executeRun: (runId, _deps, s) =>
        new Promise((resolve) => {
          seen = s;
          s.addEventListener("abort", () => resolve({ runId, status: "cancelled" }));
        }),
      prepareRunDeps: fakeRunDeps,
      log,
      secrets: [],
    });
    const job = await queuedRun();
    const jobSignal = new AbortController();
    const done = runs.handler(job, jobSignal.signal);
    while (seen === undefined) await new Promise((r) => setTimeout(r, 5));
    expect(seen.aborted).toBe(false);
    jobSignal.abort();
    await done;
    expect(seen.aborted).toBe(true);
    expect(lines.some((l) => l.startsWith(`info Lauf ${job.runId} beendet: cancelled`))).toBe(true);
  });

  it("Abbruch-Signal kommt beim Lauf an; das Log enthält keine Inhalte und keine Schlüssel", async () => {
    let seen: AbortSignal | undefined;
    const runs = createRunHandler({
      db,
      executeRun: (runId, _deps, s) =>
        new Promise((resolve) => {
          seen = s;
          s.addEventListener("abort", () => resolve({ runId, status: "cancelled" }));
        }),
      prepareRunDeps: fakeRunDeps,
      log,
      secrets: ["schluessel-abc-123"],
    });
    const job = await queuedRun();
    const done = runs.handler(job, signal());
    while (seen === undefined) await new Promise((r) => setTimeout(r, 5));
    expect(runs.abortAll("Ende")).toBe(1);
    await done;
    await runs.idle();
    expect(seen.aborted).toBe(true);
    const all = lines.join("\n");
    expect(all).not.toContain(GEHEIMER_TEXT);
    expect(all).not.toContain("schluessel-abc-123");
  });
});
