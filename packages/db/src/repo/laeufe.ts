/**
 * PaiBot – Zugriff auf Läufe: anlegen nur ohne aktiven Lauf, Statuswechsel nur auf erlaubten Wegen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import {
  type BotId,
  type ConversationId,
  type ErrorCode,
  type MessageId,
  newId,
  PaiBotError,
  type Run,
  type RunId,
  type RunStatus,
} from "@paibot/shared";
import { and, asc, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import type { Database } from "../client";
import { ACTIVE_RUN_STATUSES, type AuftragId, runs } from "../schema";
import { toRun } from "./abbildung";
import {
  AKTIVER_LAUF_INDEX,
  AKTIVER_LAUF_JE_BAUM_INDEX,
  SQLSTATE,
  StatuswechselError,
  standardFehler,
  uebersetzen,
} from "./fehler";

export type FinalRunStatus = Extract<RunStatus, "succeeded" | "failed" | "cancelled" | "denied">;

/**
 * Erlaubte Wege: Zielstatus → Status, aus denen man dorthin wechseln darf. In dieser Fassung führt
 * kein Weg nach `waiting_approval` (wie der Trigger `runs_regeln`, Migration 0014); die Wege
 * hinaus bleiben für Läufe aus der Zeit davor.
 */
export const RUN_TRANSITIONS: Readonly<Record<RunStatus, readonly RunStatus[]>> = {
  queued: [],
  running: ["queued"],
  waiting_approval: [],
  succeeded: ["running", "waiting_approval"],
  failed: ["queued", "running", "waiting_approval"],
  cancelled: ["queued", "running", "waiting_approval"],
  denied: ["queued", "running", "waiting_approval"],
};

export function canTransition(from: RunStatus, to: RunStatus): boolean {
  return RUN_TRANSITIONS[to].includes(from);
}

export interface RunCreate {
  id?: RunId;
  conversationId: ConversationId;
  triggerMessageId: MessageId;
  botId: BotId;
  /** Wartender Lauf, den dieser Lauf fortsetzt (siehe `resume`). */
  resumesRunId?: RunId;
  /**
   * Auftrag, unter dem der Lauf arbeitet, mit der Wurzel seines Baums und dem Kennzeichen, ob die
   * Eingabe fremde Inhalte enthält (beim Anlegen festgehalten, danach unveränderlich).
   */
  auftrag?: { id: AuftragId; rootId: AuftragId; untrustedInput: boolean };
}

function anlegenFehler(fehler: Parameters<typeof standardFehler>[0]) {
  if (
    fehler.code === SQLSTATE.eindeutig &&
    (fehler.constraint === AKTIVER_LAUF_INDEX || fehler.constraint === AKTIVER_LAUF_JE_BAUM_INDEX)
  ) {
    return new PaiBotError("lauf_aktiv");
  }
  return standardFehler(fehler);
}

/**
 * Legt einen Lauf an (Status `queued`). Gibt es in der Unterhaltung schon einen aktiven Lauf
 * (`queued`, `running` oder `waiting_approval`) oder mit Auftrag schon einen aktiven Lauf in
 * demselben Auftragsbaum, weist ein Teil-Index der Datenbank das ab; das wird zu `lauf_aktiv`. Es gibt bewusst keine Vorab-Prüfung, die Datenbank entscheidet.
 */
export async function create(db: Database, input: RunCreate): Promise<Run> {
  const [row] = await uebersetzen(
    () =>
      db
        .insert(runs)
        .values({
          id: input.id ?? newId("run"),
          conversationId: input.conversationId,
          triggerMessageId: input.triggerMessageId,
          botId: input.botId,
          resumesRunId: input.resumesRunId ?? null,
          ...(input.auftrag === undefined
            ? {}
            : {
                auftragId: input.auftrag.id,
                auftragRootId: input.auftrag.rootId,
                untrustedInput: input.auftrag.untrustedInput,
              }),
          createdAt: sql`pg_catalog.clock_timestamp()`,
        })
        .returning(),
    anlegenFehler,
  );
  if (row === undefined) throw new PaiBotError("intern");
  return toRun(row);
}

export async function get(db: Database, id: RunId): Promise<Run | undefined> {
  const [row] = await db.select().from(runs).where(eq(runs.id, id));
  return row === undefined ? undefined : toRun(row);
}

/** Der aktive Lauf der Unterhaltung, falls es einen gibt. */
export async function getActive(
  db: Database,
  conversationId: ConversationId,
): Promise<Run | undefined> {
  const [row] = await db
    .select()
    .from(runs)
    .where(
      and(eq(runs.conversationId, conversationId), inArray(runs.status, [...ACTIVE_RUN_STATUSES])),
    );
  return row === undefined ? undefined : toRun(row);
}

/**
 * Hat dieser Bot gerade einen aktiven Lauf? Fakt `botRunActive` der Aktion `bot.loeschen`
 * (Vorbedingung „kein Lauf des Bots“).
 */
export async function hatAktivenLauf(db: Database, botId: BotId): Promise<boolean> {
  const [row] = await db
    .select({ id: runs.id })
    .from(runs)
    .where(and(eq(runs.botId, botId), inArray(runs.status, [...ACTIVE_RUN_STATUSES])))
    .limit(1);
  return row !== undefined;
}

/** Läufe einer Unterhaltung, neueste zuerst. */
export async function listForConversation(
  db: Database,
  conversationId: ConversationId,
  options: { limit?: number } = {},
): Promise<Run[]> {
  const rows = await db
    .select()
    .from(runs)
    .where(eq(runs.conversationId, conversationId))
    .orderBy(desc(runs.createdAt), desc(runs.id))
    .limit(options.limit ?? 50);
  return rows.map(toRun);
}

/** Wechselt den Status in einer Anweisung, nur wenn der bisherige Status den Weg erlaubt. */
async function wechseln(
  db: Database,
  id: RunId,
  nach: RunStatus,
  felder: Partial<typeof runs.$inferInsert>,
): Promise<Run> {
  const [row] = await db
    .update(runs)
    .set({ status: nach, ...felder })
    .where(and(eq(runs.id, id), inArray(runs.status, [...RUN_TRANSITIONS[nach]])))
    .returning();
  if (row !== undefined) return toRun(row);
  const [vorhanden] = await db.select({ status: runs.status }).from(runs).where(eq(runs.id, id));
  if (vorhanden === undefined) throw new PaiBotError("nicht_gefunden");
  throw new StatuswechselError("lauf", id, vorhanden.status, nach);
}

/** `queued` → `running`; setzt Start und ersten Herzschlag. */
export function markRunning(db: Database, id: RunId, options: { now?: Date } = {}): Promise<Run> {
  const now = options.now ?? new Date();
  return wechseln(db, id, "running", { startedAt: now, heartbeatAt: now });
}

/**
 * In dieser Fassung stillgelegt (kein Lauf wartet auf eine Freigabe; die Datenbank verhindert es
 * mit dem Trigger `runs_regeln`): wirft sofort `intern`, ohne Abfrage. Eine spätere Fassung mit
 * Freigaben stellt den Weg `running` → `waiting_approval` wieder her.
 */
export function markWaiting(_db: Database, _id: RunId): never {
  throw new PaiBotError("intern");
}

/** Beendet den Lauf mit `succeeded`, `failed`, `cancelled` oder `denied`. */
export function finish(
  db: Database,
  id: RunId,
  input: { status: FinalRunStatus; errorCode?: ErrorCode; now?: Date },
): Promise<Run> {
  return wechseln(db, id, input.status, {
    finishedAt: input.now ?? new Date(),
    errorCode: input.errorCode ?? null,
  });
}

/**
 * In dieser Fassung stillgelegt (es gibt keine wartenden Läufe, die man fortsetzen könnte): wirft
 * sofort `intern`, ohne Abfrage. Eine spätere Fassung mit Freigaben stellt sie wieder her; die
 * Daten-Form (`resumesRunId`) bleibt dafür bestehen.
 */
export function resume(_db: Database, _waitingRunId: RunId, _options: { now?: Date } = {}): never {
  throw new PaiBotError("intern");
}

/**
 * Merkt einen Abbruchwunsch vor (nur beim ersten Mal). `undefined`, wenn es keinen aktiven
 * Lauf mit dieser ID gibt; dann ist nichts abzubrechen.
 */
export async function requestCancel(
  db: Database,
  id: RunId,
  options: { now?: Date } = {},
): Promise<Run | undefined> {
  const now = options.now ?? new Date();
  const [row] = await db
    .update(runs)
    .set({
      cancelRequestedAt: sql`coalesce(${runs.cancelRequestedAt}, ${now.toISOString()}::timestamptz)`,
    })
    .where(and(eq(runs.id, id), inArray(runs.status, [...ACTIVE_RUN_STATUSES])))
    .returning();
  return row === undefined ? undefined : toRun(row);
}

/**
 * Herzschlag eines laufenden Laufs. `false`, wenn der Lauf nicht mehr `running` ist
 * (der Worker soll dann aufhören).
 */
export async function heartbeat(
  db: Database,
  id: RunId,
  options: { now?: Date } = {},
): Promise<boolean> {
  const aktualisiert = await db
    .update(runs)
    .set({ heartbeatAt: options.now ?? new Date() })
    .where(and(eq(runs.id, id), eq(runs.status, "running")))
    .returning({ id: runs.id });
  return aktualisiert.length > 0;
}

/** Status, die `findStale` ohne Angabe prüft. */
export const STALE_RUN_STATUSES_DEFAULT = ["running"] as const;

/**
 * Läufe, deren letzter Lebenszeichen-Zeitpunkt vor `before` liegt: bei `running` der Herzschlag
 * (sonst Start bzw. Anlegen), bei `queued` das Anlegen.
 *
 * Ohne `statuses` gilt nur `running` (`STALE_RUN_STATUSES_DEFAULT`): ein Lauf in `queued` wartet
 * in der Warteschlange, bis die Unterhaltung frei ist, und hängt deshalb nicht. Wer auch alte
 * `queued`-Läufe sucht, übergibt `statuses: ["queued", "running"]`. Wartende Läufe
 * (`waiting_approval`) gelten nie als veraltet.
 */
export async function findStale(
  db: Database,
  options: { before: Date; statuses?: readonly ("queued" | "running")[] },
): Promise<Run[]> {
  const stati = options.statuses ?? STALE_RUN_STATUSES_DEFAULT;
  if (stati.length === 0) return [];
  const rows = await db
    .select()
    .from(runs)
    .where(
      and(
        inArray(runs.status, [...stati]),
        or(
          and(
            eq(runs.status, "running"),
            // Der Zeitpunkt wird als Text gebunden: Ein Vergleich mit einem rohen Ausdruck kennt
            // keinen Spalten-Typ, und postgres-js nimmt dort kein Date an.
            lt(
              sql`coalesce(${runs.heartbeatAt}, ${runs.startedAt}, ${runs.createdAt})`,
              sql`${options.before.toISOString()}::timestamptz`,
            ),
          ),
          and(eq(runs.status, "queued"), lt(runs.createdAt, options.before)),
        ),
      ),
    )
    .orderBy(asc(runs.createdAt), asc(runs.id));
  return rows.map(toRun);
}
