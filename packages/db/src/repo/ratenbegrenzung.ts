/**
 * PaiBot – Zähler für Rate-Limits: je Schlüssel und Zeitfenster eine Zeile, atomar hochgezählt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { PaiBotError } from "@paibot/shared";
import { and, eq, like, lt, notLike, sql } from "drizzle-orm";
import type { Database } from "../client";
import { rateLimits } from "../schema";
import { standardFehler, uebersetzen } from "./fehler";

export interface RateLimitInput {
  /** Schlüssel der Form `<zweck>:<teil>`, etwa aus `RATE_LIMIT_KEYS`. */
  key: string;
  max: number;
  windowSeconds: number;
  now?: Date;
  /**
   * Gleitendes Fenster: Der Zähler des vorigen Fensters zählt anteilig mit (so viel, wie von ihm
   * noch in die letzten `windowSeconds` fällt). So beginnt ein neues Fenster nicht wieder bei null.
   */
  sliding?: boolean;
}

export interface RateLimitResult {
  /** `true`, solange der Zähler im Fenster nicht über `max` liegt. */
  allowed: boolean;
  count: number;
  max: number;
  remaining: number;
  /** Sekunden bis zum Ende des Fensters (für `Retry-After`). */
  retryAfterSeconds: number;
}

function fenster(now: Date, windowSeconds: number) {
  const laenge = windowSeconds * 1000;
  const start = Math.floor(now.getTime() / laenge) * laenge;
  return { start: new Date(start), ende: start + laenge };
}

function ergebnis(count: number, input: { max: number; now: Date }, ende: number): RateLimitResult {
  return {
    allowed: count <= input.max,
    count,
    max: input.max,
    remaining: Math.max(0, input.max - count),
    retryAfterSeconds: Math.max(1, Math.ceil((ende - input.now.getTime()) / 1000)),
  };
}

/**
 * Zählt einen Versuch im aktuellen Zeitfenster. Das Hochzählen ist eine einzige Anweisung
 * (`INSERT … ON CONFLICT DO UPDATE`), parallele Aufrufe verlieren also keinen Treffer.
 */
export async function hit(db: Database, input: RateLimitInput): Promise<RateLimitResult> {
  const now = input.now ?? new Date();
  const { start, ende } = fenster(now, input.windowSeconds);
  const [row] = await uebersetzen(
    () =>
      db
        .insert(rateLimits)
        .values({ key: input.key, windowStart: start, count: 1 })
        .onConflictDoUpdate({
          target: [rateLimits.key, rateLimits.windowStart],
          set: { count: sql`${rateLimits.count} + 1` },
        })
        .returning({ count: rateLimits.count }),
    standardFehler,
  );
  if (row === undefined) throw new PaiBotError("intern");
  if (input.sliding !== true) return ergebnis(row.count, { max: input.max, now }, ende);
  const laenge = input.windowSeconds * 1000;
  const [vorher] = await db
    .select({ count: rateLimits.count })
    .from(rateLimits)
    .where(
      and(
        eq(rateLimits.key, input.key),
        eq(rateLimits.windowStart, new Date(start.getTime() - laenge)),
      ),
    );
  return gleitend(row.count, vorher?.count ?? 0, { max: input.max, now, laenge, ende });
}

/**
 * Ergebnis im gleitenden Fenster: `aktuell + vorher × Anteil`, wobei der Anteil der Teil des vorigen
 * Fensters ist, der noch in die letzten `laenge` Millisekunden fällt. `retryAfterSeconds` ist die
 * Zeit, bis der Wert wieder höchstens `max` ist.
 */
function gleitend(
  aktuell: number,
  vorher: number,
  input: { max: number; now: Date; laenge: number; ende: number },
): RateLimitResult {
  const rest = input.ende - input.now.getTime();
  const anteil = rest / input.laenge;
  const wert = aktuell + vorher * anteil;
  let wartenMs = 0;
  if (wert > input.max) {
    wartenMs =
      aktuell <= input.max
        ? ((wert - input.max) / vorher) * input.laenge
        : rest + (1 - input.max / aktuell) * input.laenge;
  }
  const count = Math.ceil(wert - 1e-9);
  return {
    allowed: wert <= input.max,
    count,
    max: input.max,
    remaining: Math.max(0, input.max - count),
    retryAfterSeconds: Math.max(1, Math.ceil(wartenMs / 1000)),
  };
}

/** Liest den Zähler des aktuellen Fensters, ohne zu zählen. */
export async function peek(db: Database, input: RateLimitInput): Promise<RateLimitResult> {
  const now = input.now ?? new Date();
  const { start, ende } = fenster(now, input.windowSeconds);
  const [row] = await db
    .select({ count: rateLimits.count })
    .from(rateLimits)
    .where(and(eq(rateLimits.key, input.key), eq(rateLimits.windowStart, start)));
  return ergebnis(row?.count ?? 0, { max: input.max, now }, ende);
}

/** Setzt den Zähler eines Schlüssels zurück (etwa nach erfolgreicher Anmeldung). */
export async function reset(db: Database, key: string): Promise<void> {
  await db.delete(rateLimits).where(eq(rateLimits.key, key));
}

function muster(prefix: string): string {
  return `${prefix.replace(/[\\%_]/g, (zeichen) => `\\${zeichen}`)}%`;
}

/**
 * Löscht Zähler, deren Fenster vor `olderThan` begann, außer denen mit einem Schlüssel aus
 * `exceptPrefixes`. Gibt die Anzahl zurück.
 */
export async function deleteOlderThan(
  db: Database,
  olderThan: Date,
  options: { exceptPrefixes?: readonly string[] } = {},
): Promise<number> {
  const ausser = (options.exceptPrefixes ?? []).map((p) => notLike(rateLimits.key, muster(p)));
  const geloescht = await db
    .delete(rateLimits)
    .where(and(lt(rateLimits.windowStart, olderThan), ...ausser))
    .returning({ key: rateLimits.key });
  return geloescht.length;
}

/** Löscht alle Zähler, deren Schlüssel mit `prefix` beginnt (z. B. `anmelden:`). Gibt die Anzahl zurück. */
export async function deleteByPrefix(db: Database, prefix: string): Promise<number> {
  const geloescht = await db
    .delete(rateLimits)
    .where(like(rateLimits.key, muster(prefix)))
    .returning({ key: rateLimits.key });
  return geloescht.length;
}
