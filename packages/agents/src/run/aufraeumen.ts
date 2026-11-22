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
import { denialCode, type ReceiptWriter } from "@paibot/gate";
import type { ActionRequest } from "@paibot/shared/aktionen";
import type { ErrorCode } from "@paibot/shared/fehler";
import type { ActionId, MessageId, ReceiptId, RunId } from "@paibot/shared/ids";
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
  /**
   * Ein Lauf in `running` mit Stopp-Wunsch und ohne Herzschlag seit so vielen Millisekunden
   * (Standard: drei Herzschläge). Dann arbeitet niemand mehr an ihm, und „Stopp“ soll wirken.
   */
  cancelledStaleAfterMs?: number;
}

/**
 * Sucht Läufe in `running`, deren Herzschlag älter als `staleAfterMs` ist (mit Stopp-Wunsch schon
 * nach `cancelledStaleAfterMs`), und Läufe, die länger
 * als `queuedStaleAfterMs` in `queued` stehen (z. B. weil ihr Auftrag verloren ging). Jeder wird
 * auf `failed` mit Code `unterbrochen` gesetzt; eine noch streamende Antwort wird mit dem bis dahin
 * gestreamten Text als `failed` abgeschlossen; offene Werkzeug-Aufrufe enden als `cancelled`
 * (`repo.toolCalls.endOpenForRun`); Ereignis `run.failed`. Gibt es zu einer schon belegten
 * Entscheidung `modell.anfragen` oder `werkzeug.aufrufen` dieses Laufs noch kein Ergebnis, schreibt
 * der Beleg-Schreiber (`deps.receipts`) ein passendes Ergebnis (`closeOpenDecisions`). Für den
 * Start des Workers und danach regelmäßig (etwa nach einem Ausfall der Datenbank). Liefert die
 * betroffenen Läufe.
 */
export async function failStaleRuns(
  deps: Pick<RunDeps, "db" | "clock"> & Partial<Pick<RunDeps, "receipts">>,
  options: StaleRunOptions = {},
): Promise<RunId[]> {
  const { db, clock } = deps;
  const now = clock.now();
  // Herzschlag (sonst Start bzw. Anlegen) bei `running`, Anlegen bei `queued`.
  const staleBefore = now.getTime() - (options.staleAfterMs ?? RUN_TUNING.staleAfterMs);
  const cancelledBefore =
    now.getTime() - (options.cancelledStaleAfterMs ?? 3 * RUN_TUNING.heartbeatMs);
  const running = (
    await repo.runs.findStale(db, {
      before: new Date(Math.max(staleBefore, cancelledBefore)),
      statuses: ["running"],
    })
  ).filter((run) => {
    const lastSign = Date.parse(run.heartbeatAt ?? run.startedAt ?? run.createdAt);
    return lastSign < staleBefore || run.cancelRequestedAt !== undefined;
  });
  const queued = await repo.runs.findStale(db, {
    before: new Date(now.getTime() - (options.queuedStaleAfterMs ?? RUN_TUNING.queuedStaleAfterMs)),
    statuses: ["queued"],
  });

  const failed: RunId[] = [];
  for (const run of [...running, ...queued]) {
    if (!(await failRun(db, run, now))) continue;
    failed.push(run.id);
    if (deps.receipts !== undefined) await closeRunDecisions(db, deps.receipts, run, now);
  }
  // Nachlauf: Stürzte ein Worker zwischen dem Beenden eines Laufs und dem Schließen seiner
  // Entscheidungen ab, ist der Lauf schon beendet und kommt oben nicht mehr vor.
  if (deps.receipts !== undefined) {
    for (const run of await finishedRunsWithOpenToolDecisions(db)) {
      if (failed.includes(run.id)) continue;
      await closeRunDecisions(db, deps.receipts, run, now);
    }
  }
  return failed;
}

/** Entscheidungen eines beendeten Laufs schließen und Ergebnis-Belege an seinen Aufrufen vermerken. */
async function closeRunDecisions(
  db: Database,
  receipts: ReceiptWriter,
  run: Run,
  now: Date,
): Promise<void> {
  const written = await closeOpenDecisions(db, receipts, run, now);
  if (written.size > 0) await repo.toolCalls.endOpenForRun(db, run.id, { now, results: written });
}

/**
 * Beendete Läufe mit einer Entscheidung `werkzeug.aufrufen` ohne Ergebnis. Bei einem laufenden
 * Lauf ist das normal (der Aufruf läuft gerade); bei einem beendeten nur nach einem Absturz.
 */
async function finishedRunsWithOpenToolDecisions(db: Database): Promise<Run[]> {
  const open = await db.query.belege.findMany({
    columns: { body: true },
    where: (t, { and, eq, sql }) =>
      and(
        eq(t.entryType, "decision"),
        eq(t.action, "werkzeug.aufrufen"),
        sql`not exists (select 1 from "public"."belege" r where r.entry_type = 'result' and r.action_id = ${t.actionId})`,
      ),
  });
  const runIds = new Set<RunId>();
  for (const decision of open) {
    if (decision.body.type !== "decision") continue;
    const target = decision.body.action.target as { runId?: RunId };
    if (target.runId !== undefined) runIds.add(target.runId);
  }
  const runs: Run[] = [];
  for (const runId of runIds) {
    const run = await repo.runs.get(db, runId);
    if (run !== undefined && run.status !== "queued" && run.status !== "running") runs.push(run);
  }
  return runs;
}

/** Beendet einen Lauf als fehlgeschlagen; `false`, wenn ihn inzwischen ein anderer beendet hat. */
async function failRun(db: Database, run: Run, now: Date): Promise<boolean> {
  try {
    await repo.withTransaction(db, async (tx) => {
      await repo.runs.finish(tx, run.id, { status: "failed", errorCode: STALE_CODE, now });
      // Offene Werkzeug-Aufrufe des toten Laufs enden mit ihm (nie wiederholt).
      await repo.toolCalls.endOpenForRun(tx, run.id, { now });
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

/** Aktionen eines Laufs, deren Entscheidungen beim Aufräumen ein Ergebnis bekommen. */
const LAUF_AKTIONEN = ["modell.anfragen", "werkzeug.aufrufen"] as const;

/**
 * Code für eine erlaubte, nie beendete Entscheidung: Nur bei einem Werkzeug, das liest und nur
 * innerhalb von PaiBot wirkt, `unterbrochen`; sonst ist nicht bekannt, ob es schon gewirkt hat
 * (`ausgang_unbekannt`) – auch wenn die Fakten die Wirkung nicht nennen (gleich streng wie
 * `repo.toolCalls.openCallEndCode`).
 */
function erlaubtOhneEnde(action: string, facts: Record<string, unknown>): ErrorCode {
  if (action !== "werkzeug.aufrufen") return STALE_CODE;
  return facts.toolKind === "lesen" && facts.toolReach === "intern"
    ? STALE_CODE
    : "ausgang_unbekannt";
}

/**
 * Schreibt für jede Entscheidung `modell.anfragen` oder `werkzeug.aufrufen` des Laufs ohne Ergebnis
 * ein Ergebnis: nach einer Ablehnung oder „fragen“ dasselbe Ergebnis „abgelehnt“ mit demselben Code
 * wie im Tor, nach einer Erlaubnis „unterbrochen“ (bei einem Werkzeug, das schreibt oder nach
 * außen wirkt, `ausgang_unbekannt`). Nur so passt das Ergebnis zur Entscheidung und die Kette
 * bleibt gültig.
 */
async function closeOpenDecisions(
  db: Database,
  receipts: ReceiptWriter,
  run: Run,
  now: Date,
): Promise<Map<ActionId, ReceiptId>> {
  const written = new Map<ActionId, ReceiptId>();
  const decisions = await db.query.belege.findMany({
    columns: { actionId: true, body: true },
    where: (t, { and, eq, inArray, sql }) =>
      and(
        eq(t.entryType, "decision"),
        inArray(t.action, [...LAUF_AKTIONEN]),
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
    const entschieden = decision.body.decision;
    const ref = await receipts.appendResult({
      action: decision.body.action as ActionRequest,
      result:
        entschieden.outcome === "allow"
          ? {
              status: "error",
              code: erlaubtOhneEnde(decision.body.action.type, decision.body.facts ?? {}),
            }
          : {
              status: "denied",
              code: denialCode({ ...entschieden, preconditions: entschieden.preconditions ?? [] }),
            },
      time: now,
    });
    if (decision.body.action.type === "werkzeug.aufrufen") written.set(actionId, ref.receiptId);
  }
  return written;
}
