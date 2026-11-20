/**
 * PaiBot – Ereignis-Strom je Unterhaltung: Anhängen mit fortlaufender Nummer und Meldung, Lesen ab Nummer, Aufräumen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import {
  type ConversationEvent,
  type ConversationEventType,
  type ConversationId,
  EVENT_DATA,
  EVENT_NOTIFY_CHANNEL,
  invalidInput,
  PaiBotError,
  type RunId,
} from "@paibot/shared";
import { and, asc, eq, gt, lt, max, notExists, sql } from "drizzle-orm";
import type { Database } from "../client";
import { ACTIVE_RUN_STATUSES, conversationEvents, conversations, runs } from "../schema";
import { toEvent } from "./abbildung";
import { standardFehler, uebersetzen } from "./fehler";
import { withTransaction } from "./transaktion";

/** So lange bleiben `text.delta`-Ereignisse abgeschlossener Läufe erhalten. */
export const TEXT_DELTA_RETENTION_DAYS = 7;

const TAG_MS = 24 * 60 * 60 * 1000;

interface DatenSchema {
  safeParse(
    daten: unknown,
  ):
    | { success: true; data: Record<string, unknown> }
    | { success: false; error: Parameters<typeof invalidInput>[0] };
}

export interface EventAppend<T extends ConversationEventType> {
  conversationId: ConversationId;
  type: T;
  /** Daten genau wie im Vertrag des Ereignis-Typs; sie werden geprüft. */
  data: ConversationEvent<T>["data"];
  /** Lauf des Ereignisses; ohne Angabe wird `runId` aus den Daten übernommen, falls vorhanden. */
  runId?: RunId;
}

/**
 * Hängt ein Ereignis an und vergibt die nächste Nummer der Unterhaltung (ab 1, ohne Lücke).
 *
 * Ablauf in einer Transaktion: Zeile der Unterhaltung sperren (`FOR NO KEY UPDATE`, so schreiben
 * parallele Aufrufe nacheinander), höchste Nummer lesen, einfügen, `pg_notify` auf dem Kanal
 * `EVENT_NOTIFY_CHANNEL` mit der Unterhaltungs-ID. Die Meldung geht erst mit dem Bestätigen
 * der (äußeren) Transaktion hinaus. Gibt es die Unterhaltung nicht: `nicht_gefunden`.
 */
export async function append<T extends ConversationEventType>(
  db: Database,
  input: EventAppend<T>,
): Promise<ConversationEvent<T>> {
  const schema = EVENT_DATA[input.type] as unknown as DatenSchema;
  const geprueft = schema.safeParse(input.data);
  if (!geprueft.success) throw invalidInput(geprueft.error, input.data);
  const daten = geprueft.data;
  const runId =
    input.runId ?? (typeof daten.runId === "string" ? (daten.runId as RunId) : undefined);

  return uebersetzen(
    () =>
      withTransaction(db, async (tx) => {
        const gesperrt = await tx
          .select({ id: conversations.id })
          .from(conversations)
          .where(eq(conversations.id, input.conversationId))
          .for("no key update");
        if (gesperrt.length === 0) throw new PaiBotError("nicht_gefunden");

        const [letzte] = await tx
          .select({ seq: max(conversationEvents.seq) })
          .from(conversationEvents)
          .where(eq(conversationEvents.conversationId, input.conversationId));
        const seq = Number(letzte?.seq ?? 0) + 1;

        const [row] = await tx
          .insert(conversationEvents)
          .values({
            conversationId: input.conversationId,
            seq,
            runId: runId ?? null,
            type: input.type,
            payload: daten,
          })
          .returning();
        if (row === undefined) throw new PaiBotError("intern");

        await tx.execute(sql`select pg_notify(${EVENT_NOTIFY_CHANNEL}, ${input.conversationId})`);
        return toEvent(row) as ConversationEvent<T>;
      }),
    standardFehler,
  );
}

/** Ereignisse mit Nummer größer als `afterSeq` (0 = von Anfang an), aufsteigend. */
export async function listSince(
  db: Database,
  conversationId: ConversationId,
  options: { afterSeq?: number; limit?: number } = {},
): Promise<ConversationEvent[]> {
  const rows = await db
    .select()
    .from(conversationEvents)
    .where(
      and(
        eq(conversationEvents.conversationId, conversationId),
        gt(conversationEvents.seq, options.afterSeq ?? 0),
      ),
    )
    .orderBy(asc(conversationEvents.seq))
    .limit(options.limit ?? 1000);
  return rows.map(toEvent);
}

/** Höchste vergebene Nummer der Unterhaltung, 0 wenn es noch kein Ereignis gibt. */
export async function lastSeq(db: Database, conversationId: ConversationId): Promise<number> {
  const [row] = await db
    .select({ seq: max(conversationEvents.seq) })
    .from(conversationEvents)
    .where(eq(conversationEvents.conversationId, conversationId));
  return Number(row?.seq ?? 0);
}

/**
 * Löscht `text.delta`-Ereignisse, die vor `olderThan` entstanden sind und zu keinem aktiven
 * Lauf gehören (die fertige Nachricht steht in `messages`). Nur das erlaubt der Trigger;
 * andere Ereignisse bleiben. Ohne Angabe gilt `TEXT_DELTA_RETENTION_DAYS`. Gibt die Anzahl zurück.
 */
export async function pruneTextDeltas(
  db: Database,
  options: { olderThan?: Date; now?: Date } = {},
): Promise<number> {
  const grenze =
    options.olderThan ??
    new Date((options.now ?? new Date()).getTime() - TEXT_DELTA_RETENTION_DAYS * TAG_MS);
  const geloescht = await db
    .delete(conversationEvents)
    .where(
      and(
        eq(conversationEvents.type, "text.delta"),
        lt(conversationEvents.createdAt, grenze),
        notExists(
          db
            .select({ one: sql`1` })
            .from(runs)
            .where(
              and(
                eq(runs.id, conversationEvents.runId),
                sql`${runs.status} in (${sql.join(
                  ACTIVE_RUN_STATUSES.map((status) => sql`${status}`),
                  sql`, `,
                )})`,
              ),
            ),
        ),
      ),
    )
    .returning({ seq: conversationEvents.seq });
  return geloescht.length;
}
