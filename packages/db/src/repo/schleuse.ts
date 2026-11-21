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

/** So weit darf eine Meldung der Uhr der Datenbank voraus sein (abweichende Uhren). */
export const ZUKUNFT_TOLERANZ_SEKUNDEN = 60;

const GRENZE = sql`pg_catalog.now() + pg_catalog.make_interval(secs => ${ZUKUNFT_TOLERANZ_SEKUNDEN})`;

/**
 * Hält den geprüften Zustand fest (eine Zeile, die jede Meldung überschreibt). Eine ältere Meldung
 * überschreibt nie eine neuere: Kommen zwei Prüfungen in falscher Reihenfolge an, gilt die spätere.
 * Maßstab ist die Uhr der Datenbank: Ein Zeitpunkt weiter als `ZUKUNFT_TOLERANZ_SEKUNDEN` in der
 * Zukunft wird auf diese Grenze gekürzt, und eine gespeicherte Meldung aus der Zukunft hält keine
 * neue auf.
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
        .values({
          id: "singleton",
          state: input.state,
          checkedAt: sql`least(${checkedAt.toISOString()}::timestamptz, ${GRENZE})`,
        })
        .onConflictDoUpdate({
          target: schleuseZustand.id,
          set: { state: input.state, checkedAt: sql`excluded.checked_at` },
          setWhere: sql`${schleuseZustand.checkedAt} <= excluded.checked_at or ${schleuseZustand.checkedAt} > ${GRENZE}`,
        }),
    standardFehler,
  );
  return { state: input.state, checkedAt };
}

/**
 * Zuletzt gemeldeter Zustand; `undefined`, solange der Worker noch nichts gemeldet hat. Eine
 * Meldung mit einem Zeitpunkt in der Zukunft (nach der Uhr der Datenbank) gilt als nicht gemeldet:
 * So hat sie der Worker nie geschrieben, und sie darf nicht als frisch gelten.
 */
export async function get(db: Database): Promise<SchleuseMeldung | undefined> {
  const [row] = await db
    .select({
      state: schleuseZustand.state,
      checkedAt: schleuseZustand.checkedAt,
      zukunft: sql<boolean>`${schleuseZustand.checkedAt} > ${GRENZE}`,
    })
    .from(schleuseZustand)
    .where(eq(schleuseZustand.id, "singleton"));
  if (row === undefined || row.zukunft) return undefined;
  return { state: row.state, checkedAt: row.checkedAt };
}
