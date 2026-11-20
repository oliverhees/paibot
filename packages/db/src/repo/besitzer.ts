/**
 * PaiBot – Zugriff auf den Besitzer (höchstens eine Zeile).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { newId, type OwnerId, PaiBotError } from "@paibot/shared";
import { eq } from "drizzle-orm";
import type { Database } from "../client";
import { owner } from "../schema";
import { SQLSTATE, standardFehler, uebersetzen } from "./fehler";

/** Der Besitzer mit seinem Passwort-Hash (nie im Klartext). */
export interface OwnerRecord {
  id: OwnerId;
  passwordHash: string;
  passwordChangedAt: string;
  createdAt: string;
  updatedAt: string;
}

function toRecord(row: typeof owner.$inferSelect): OwnerRecord {
  return {
    id: row.id,
    passwordHash: row.passwordHash,
    passwordChangedAt: row.passwordChangedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function get(db: Database): Promise<OwnerRecord | undefined> {
  const [row] = await db.select().from(owner).limit(1);
  return row === undefined ? undefined : toRecord(row);
}

/** Legt den Besitzer an. Gibt es schon einen, folgt `einrichtung_fertig`. */
export async function create(
  db: Database,
  input: { passwordHash: string; id?: OwnerId },
): Promise<OwnerRecord> {
  const [row] = await uebersetzen(
    () =>
      db
        .insert(owner)
        .values({ id: input.id ?? newId("owner"), passwordHash: input.passwordHash })
        .returning(),
    (fehler) =>
      fehler.code === SQLSTATE.eindeutig
        ? new PaiBotError("einrichtung_fertig")
        : standardFehler(fehler),
  );
  if (row === undefined) throw new PaiBotError("intern");
  return toRecord(row);
}

/** Setzt einen neuen Passwort-Hash. `undefined`, wenn es den Besitzer nicht gibt. */
export async function updatePassword(
  db: Database,
  id: OwnerId,
  passwordHash: string,
  now: Date = new Date(),
): Promise<OwnerRecord | undefined> {
  const [row] = await db
    .update(owner)
    .set({ passwordHash, passwordChangedAt: now, updatedAt: now })
    .where(eq(owner.id, id))
    .returning();
  return row === undefined ? undefined : toRecord(row);
}
