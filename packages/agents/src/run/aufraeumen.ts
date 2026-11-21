/**
 * PaiBot – Aufräumen hängender Läufe: Läufe ohne Herzschlag und nie abgeholte Läufe beenden,
 * damit die Unterhaltung wieder frei ist.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { type Database, repo } from "@paibot/db";
import type { ReceiptWriter } from "@paibot/gate";
import type { ActionRequest } from "@paibot/shared/aktionen";
import type { ErrorCode } from "@paibot/shared/fehler";
import type { MessageId, RunId } from "@paibot/shared/ids";
import type { Run } from "@paibot/shared/objekte";
import { errorText } from "@paibot/shared/texte";
import { RUN_TUNING, type RunDeps } from "./vertrag";

/** Code, mit dem ein hängender Lauf endet. */
const STALE_CODE: ErrorCode = "unterbrochen";

export interface StaleRunOptions {
  /** Ein Lauf in `running` ohne Herzschlag seit so vielen Millisekunden gilt als hängend. */
  staleAfterMs?: number;
  /** Ein Lauf, der so lange in `queued` steht, wurde nie abgeholt. */
  queuedStaleAfterMs?: number;
}

/**
 * Sucht Läufe in `running`, deren Herzschlag älter als `staleAfterMs` ist, und Läufe, die länger
 * als `queuedStaleAfterMs` in `queued` stehen (z. B. weil ihr Auftrag verloren ging). Jeder wird
 * auf `failed` mit Code `unterbrochen` gesetzt; eine noch streamende Antwort wird mit dem bis dahin
 * gestreamten Text als `failed` abgeschlossen; Ereignis `run.failed`. Gibt es zu einer schon
 * belegten Entscheidung `modell.anfragen` dieses Laufs noch kein Ergebnis, schreibt der
 * Beleg-Schreiber (`deps.receipts`) das Ergebnis `error`/`unterbrochen`. Für den Start des
 * Workers. Liefert die betroffenen Läufe.
 */
export async function failStaleRuns(
  deps: Pick<RunDeps, "db" | "clock"> & Partial<Pick<RunDeps, "receipts">>,
  options: StaleRunOptions = {},
): Promise<RunId[]> {
  const { db, clock } = deps;
  const now = clock.now();
  // Herzschlag (sonst Start bzw. Anlegen) bei `running`, Anlegen bei `queued`.
  const running = await repo.runs.findStale(db, {
    before: new Date(now.getTime() - (options.staleAfterMs ?? RUN_TUNING.staleAfterMs)),
    statuses: ["running"],
  });
  const queued = await repo.runs.findStale(db, {
    before: new Date(now.getTime() - (options.queuedStaleAfterMs ?? RUN_TUNING.queuedStaleAfterMs)),
    statuses: ["queued"],
  });

  const failed: RunId[] = [];
  for (const run of [...running, ...queued]) {
    if (!(await failRun(db, run, now))) continue;
    failed.push(run.id);
    if (deps.receipts !== undefined) await closeOpenDecisions(db, deps.receipts, run, now);
  }
  return failed;
}

/** Beendet einen Lauf als fehlgeschlagen; `false`, wenn ihn inzwischen ein anderer beendet hat. */
async function failRun(db: Database, run: Run, now: Date): Promise<boolean> {
  try {
    await repo.withTransaction(db, async (tx) => {
      await repo.runs.finish(tx, run.id, { status: "failed", errorCode: STALE_CODE, now });
      const streaming = await tx.query.messages.findMany({
        columns: { id: true },
        where: (t, { and, eq }) => and(eq(t.runId, run.id), eq(t.status, "streaming")),
      });
      for (const message of streaming) {
        await repo.messages.finalize(tx, message.id, {
          status: "failed",
          content: await streamedText(tx, run, message.id),
          errorCode: STALE_CODE,
        });
      }
      await repo.events.append(tx, {
        conversationId: run.conversationId,
        type: "run.failed",
        data: { runId: run.id, code: STALE_CODE, text: errorText(STALE_CODE) },
      });
    });
    return true;
  } catch (error) {
    if (error instanceof repo.StatuswechselError) return false;
    throw error;
  }
}

/** Text, der für eine Nachricht schon als `text.delta` geschrieben wurde. */
async function streamedText(db: Database, run: Run, messageId: MessageId): Promise<string> {
  let text = "";
  let afterSeq = 0;
  for (;;) {
    const page = await repo.events.listSince(db, run.conversationId, { afterSeq, limit: 1000 });
    for (const event of page) {
      if (event.type === "text.delta" && event.data.messageId === messageId) {
        text += event.data.text;
      }
    }
    const last = page.at(-1);
    if (last === undefined || page.length < 1000) return text;
    afterSeq = last.seq;
  }
}

/** Schreibt für jede Entscheidung `modell.anfragen` des Laufs ohne Ergebnis das Ergebnis „unterbrochen“. */
async function closeOpenDecisions(
  db: Database,
  receipts: ReceiptWriter,
  run: Run,
  now: Date,
): Promise<void> {
  const decisions = await db.query.belege.findMany({
    columns: { actionId: true, body: true },
    where: (t, { and, eq, sql }) =>
      and(
        eq(t.entryType, "decision"),
        eq(t.action, "modell.anfragen"),
        eq(t.conversationId, run.conversationId),
        sql`${t.body}->'action'->'target'->>'runId' = ${run.id}`,
      ),
  });
  for (const decision of decisions) {
    if (decision.actionId === null || decision.body.type !== "decision") continue;
    const actionId = decision.actionId;
    const result = await db.query.belege.findFirst({
      columns: { seq: true },
      where: (t, { and, eq }) => and(eq(t.entryType, "result"), eq(t.actionId, actionId)),
    });
    if (result !== undefined) continue;
    await receipts.appendResult({
      action: decision.body.action as ActionRequest,
      result: { status: "error", code: STALE_CODE },
      time: now,
    });
  }
}
