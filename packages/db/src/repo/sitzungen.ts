/**
 * PaiBot – Zugriff auf angemeldete Sitzungen. Gespeichert wird nur der Hash des Tokens.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import {
  type OwnerId,
  PaiBotError,
  SESSION,
  type Session,
  type SessionAuthLevel,
  type SessionMethod,
  sessionIdSchema,
} from "@paibot/shared";
import { and, desc, eq, gt, lte, ne, or, sql } from "drizzle-orm";
import type { Database } from "../client";
import { sessions } from "../schema";
import { toSession } from "./abbildung";
import { standardFehler, uebersetzen } from "./fehler";

const TAG_MS = 24 * 60 * 60 * 1000;
const MAX_USER_AGENT = 200;

export interface SessionCreate {
  /** SHA-256 des Cookie-Werts als 64 Hex-Zeichen. */
  tokenHash: string;
  ownerId: OwnerId;
  authLevel: SessionAuthLevel;
  method: SessionMethod;
  userAgent?: string;
  now?: Date;
}

function pruefeHash(tokenHash: string): void {
  if (!sessionIdSchema.safeParse(tokenHash).success) {
    throw new PaiBotError("eingabe_ungueltig", {
      felder: [{ feld: "tokenHash", code: "format" }],
    });
  }
}

/** Bedingung „noch gültig“: gleitendes Ende nicht erreicht und höchste Dauer nicht überschritten. */
function gueltig(now: Date) {
  return and(
    gt(sessions.expiresAt, now),
    gt(sessions.createdAt, new Date(now.getTime() - SESSION.maxDays * TAG_MS)),
  );
}

/** Legt eine Sitzung an; sie gilt gleitend `SESSION.slidingDays` Tage. */
export async function create(db: Database, input: SessionCreate): Promise<Session> {
  pruefeHash(input.tokenHash);
  const now = input.now ?? new Date();
  const [row] = await uebersetzen(
    () =>
      db
        .insert(sessions)
        .values({
          id: input.tokenHash,
          ownerId: input.ownerId,
          authLevel: input.authLevel,
          method: input.method,
          createdAt: now,
          lastSeenAt: now,
          expiresAt: new Date(now.getTime() + SESSION.slidingDays * TAG_MS),
          userAgent:
            input.userAgent === undefined ? null : input.userAgent.slice(0, MAX_USER_AGENT),
        })
        .returning(),
    standardFehler,
  );
  if (row === undefined) throw new PaiBotError("intern");
  return toSession(row, true);
}

/** Findet eine gültige Sitzung. Abgelaufene gelten als nicht vorhanden. */
export async function findByTokenHash(
  db: Database,
  tokenHash: string,
  options: { now?: Date } = {},
): Promise<Session | undefined> {
  if (!sessionIdSchema.safeParse(tokenHash).success) return undefined;
  const now = options.now ?? new Date();
  const [row] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.id, tokenHash), gueltig(now)));
  return row === undefined ? undefined : toSession(row, true);
}

/**
 * Verlängert eine gültige Sitzung um `SESSION.slidingDays` ab jetzt, höchstens bis
 * `SESSION.maxDays` nach dem Anlegen. `undefined`, wenn sie fehlt oder abgelaufen ist.
 */
export async function extend(
  db: Database,
  tokenHash: string,
  options: { now?: Date } = {},
): Promise<Session | undefined> {
  if (!sessionIdSchema.safeParse(tokenHash).success) return undefined;
  const now = options.now ?? new Date();
  const gleitend = new Date(now.getTime() + SESSION.slidingDays * TAG_MS).toISOString();
  const [row] = await db
    .update(sessions)
    .set({
      lastSeenAt: now,
      expiresAt: sql`least(${gleitend}::timestamptz, ${sessions.createdAt} + make_interval(days => ${SESSION.maxDays}))`,
    })
    .where(and(eq(sessions.id, tokenHash), gueltig(now)))
    .returning();
  return row === undefined ? undefined : toSession(row, true);
}

/** Beendet eine Sitzung (Abmelden). `true`, wenn es sie gab. */
export async function end(db: Database, tokenHash: string): Promise<boolean> {
  const geloescht = await db
    .delete(sessions)
    .where(eq(sessions.id, tokenHash))
    .returning({ id: sessions.id });
  return geloescht.length > 0;
}

/** Beendet alle Sitzungen des Besitzers bis auf die angegebene. Gibt die Anzahl zurück. */
export async function endAllExcept(
  db: Database,
  ownerId: OwnerId,
  keepTokenHash: string,
): Promise<number> {
  const geloescht = await db
    .delete(sessions)
    .where(and(eq(sessions.ownerId, ownerId), ne(sessions.id, keepTokenHash)))
    .returning({ id: sessions.id });
  return geloescht.length;
}

/** Beendet alle Sitzungen des Besitzers (etwa nach einem Passwortwechsel). */
export async function endAll(db: Database, ownerId: OwnerId): Promise<number> {
  const geloescht = await db
    .delete(sessions)
    .where(eq(sessions.ownerId, ownerId))
    .returning({ id: sessions.id });
  return geloescht.length;
}

/** Die gültigen Sitzungen des Besitzers, zuletzt benutzte zuerst. */
export async function list(
  db: Database,
  ownerId: OwnerId,
  options: { currentTokenHash?: string; now?: Date } = {},
): Promise<Session[]> {
  const now = options.now ?? new Date();
  const rows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.ownerId, ownerId), gueltig(now)))
    .orderBy(desc(sessions.lastSeenAt), desc(sessions.id));
  return rows.map((row) => toSession(row, row.id === options.currentTokenHash));
}

/** Löscht abgelaufene Sitzungen. Gibt die Anzahl zurück. */
export async function deleteExpired(db: Database, options: { now?: Date } = {}): Promise<number> {
  const now = options.now ?? new Date();
  const geloescht = await db
    .delete(sessions)
    .where(
      or(
        lte(sessions.expiresAt, now),
        lte(sessions.createdAt, new Date(now.getTime() - SESSION.maxDays * TAG_MS)),
      ),
    )
    .returning({ id: sessions.id });
  return geloescht.length;
}
