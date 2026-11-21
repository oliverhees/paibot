/**
 * PaiBot – Zustand der Datenschleuse: der Worker meldet, was er geprüft hat; die Web-App liest es.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { eq, sql } from "drizzle-orm";
import type { Database } from "../client";
import { SCHLEUSE_ZUSTAENDE, type SchleuseZustandWert, schleuseZustand } from "../schema";
import { standardFehler, uebersetzen } from "./fehler";

export interface SchleuseMeldung {
  state: SchleuseZustandWert;
  /** Wann der Worker geprüft hat. */
  checkedAt: Date;
}

/**
 * Hält den geprüften Zustand fest (eine Zeile, die jede Meldung überschreibt). Eine ältere Meldung
 * überschreibt nie eine neuere: Kommen zwei Prüfungen in falscher Reihenfolge an, gilt die spätere.
 */
export async function report(
  db: Database,
  input: { state: SchleuseZustandWert; now?: Date },
): Promise<SchleuseMeldung> {
  if (!(SCHLEUSE_ZUSTAENDE as readonly string[]).includes(input.state)) {
    throw new TypeError("Unbekannter Zustand der Datenschleuse");
  }
  const checkedAt = input.now ?? new Date();
  await uebersetzen(
    () =>
      db
        .insert(schleuseZustand)
        .values({ id: "singleton", state: input.state, checkedAt })
        .onConflictDoUpdate({
          target: schleuseZustand.id,
          set: { state: input.state, checkedAt },
          setWhere: sql`${schleuseZustand.checkedAt} <= excluded.checked_at`,
        }),
    standardFehler,
  );
  return { state: input.state, checkedAt };
}

/** Zuletzt gemeldeter Zustand; `undefined`, solange der Worker noch nichts gemeldet hat. */
export async function get(db: Database): Promise<SchleuseMeldung | undefined> {
  const [row] = await db
    .select({ state: schleuseZustand.state, checkedAt: schleuseZustand.checkedAt })
    .from(schleuseZustand)
    .where(eq(schleuseZustand.id, "singleton"));
  return row === undefined ? undefined : { state: row.state, checkedAt: row.checkedAt };
}
