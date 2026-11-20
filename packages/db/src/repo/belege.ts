/**
 * PaiBot – Belege nur lesen. Das Anhängen gehört dem Beleg-Paket.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { ActionType, ConversationId, ReceiptEntry, ReceiptId } from "@paibot/shared";
import { and, asc, desc, eq, gte, lt } from "drizzle-orm";
import type { Database } from "../client";
import { belege } from "../schema";
import { toReceiptEntry } from "./abbildung";

export interface ReceiptPageQuery {
  action?: ActionType;
  conversationId?: ConversationId;
  /** Nur Belege mit kleinerer Nummer (zum Blättern nach hinten). */
  before?: number;
  limit?: number;
}

export interface ReceiptPage {
  /** Neueste zuerst. */
  items: ReceiptEntry[];
  /** Wert für `before` der nächsten Seite; fehlt auf der letzten Seite. */
  nextBefore?: number;
}

/** Liste mit Blättern: neueste zuerst, optional nach Aktion und Unterhaltung gefiltert. */
export async function listPage(db: Database, query: ReceiptPageQuery = {}): Promise<ReceiptPage> {
  const limit = query.limit ?? 50;
  const bedingungen = [
    ...(query.action === undefined ? [] : [eq(belege.action, query.action)]),
    ...(query.conversationId === undefined
      ? []
      : [eq(belege.conversationId, query.conversationId)]),
    ...(query.before === undefined ? [] : [lt(belege.seq, query.before)]),
  ];
  const rows = await db
    .select()
    .from(belege)
    .where(bedingungen.length === 0 ? undefined : and(...bedingungen))
    .orderBy(desc(belege.seq))
    .limit(limit + 1);
  const seite = rows.slice(0, limit).map(toReceiptEntry);
  const letzte = seite[seite.length - 1];
  return {
    items: seite,
    ...(rows.length > limit && letzte !== undefined ? { nextBefore: letzte.seq } : {}),
  };
}

export async function get(db: Database, id: ReceiptId): Promise<ReceiptEntry | undefined> {
  const [row] = await db.select().from(belege).where(eq(belege.id, id));
  return row === undefined ? undefined : toReceiptEntry(row);
}

export async function getBySeq(db: Database, seq: number): Promise<ReceiptEntry | undefined> {
  const [row] = await db.select().from(belege).where(eq(belege.seq, seq));
  return row === undefined ? undefined : toReceiptEntry(row);
}

/** Der letzte Beleg der Kette, `undefined` bei leerer Kette. */
export async function head(db: Database): Promise<ReceiptEntry | undefined> {
  const [row] = await db.select().from(belege).orderBy(desc(belege.seq)).limit(1);
  return row === undefined ? undefined : toReceiptEntry(row);
}

/** Belege ab Nummer `fromSeq` (einschließlich), älteste zuerst; für Prüfung und Export. */
export async function listFrom(
  db: Database,
  options: { fromSeq?: number; limit?: number } = {},
): Promise<ReceiptEntry[]> {
  const rows = await db
    .select()
    .from(belege)
    .where(gte(belege.seq, options.fromSeq ?? 1))
    .orderBy(asc(belege.seq))
    .limit(options.limit ?? 1000);
  return rows.map(toReceiptEntry);
}
