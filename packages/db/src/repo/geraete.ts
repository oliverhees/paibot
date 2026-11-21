/**
 * PaiBot – Zugriff auf bekannte Geräte. Gespeichert wird nur der SHA-256 der Kennung aus dem
 * Cookie; Abmelden, „Alle Sitzungen beenden“ und ein neues Passwort löschen die Einträge.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { type OwnerId, PaiBotError, sessionIdSchema } from "@paibot/shared";
import { and, asc, eq, gt, lte, notInArray, or } from "drizzle-orm";
import type { Database } from "../client";
import { geraete } from "../schema";
import { standardFehler, uebersetzen } from "./fehler";

/** Höchstens so viele Geräte je Besitzer; beim Anlegen eines weiteren fällt das älteste weg. */
export const MAX_GERAETE = 10;

export interface GeraetCreate {
  /** SHA-256 der Kennung als 64 Hex-Zeichen. */
  idHash: string;
  ownerId: OwnerId;
  /** Ende der Gültigkeit (fest, ohne Verlängerung). */
  expiresAt: Date;
  now?: Date;
}

export interface GeraetEintrag {
  id: string;
  ownerId: OwnerId;
  createdAt: string;
  expiresAt: string;
}

function pruefeHash(idHash: string): void {
  if (!sessionIdSchema.safeParse(idHash).success) {
    throw new PaiBotError("eingabe_ungueltig", { felder: [{ feld: "idHash", code: "format" }] });
  }
}

function eintrag(row: typeof geraete.$inferSelect): GeraetEintrag {
  return {
    id: row.id,
    ownerId: row.ownerId,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  };
}

/**
 * Legt ein Gerät an. Abgelaufene Geräte des Besitzers fallen dabei weg, und es bleiben höchstens
 * `MAX_GERAETE` (die neuesten).
 */
export async function create(db: Database, input: GeraetCreate): Promise<GeraetEintrag> {
  pruefeHash(input.idHash);
  const now = input.now ?? new Date();
  const [row] = await uebersetzen(
    () =>
      db
        .insert(geraete)
        .values({
          id: input.idHash,
          ownerId: input.ownerId,
          createdAt: now,
          expiresAt: input.expiresAt,
        })
        .returning(),
    standardFehler,
  );
  if (row === undefined) throw new PaiBotError("intern");
  const neueste = await db
    .select({ id: geraete.id })
    .from(geraete)
    .where(and(eq(geraete.ownerId, input.ownerId), gt(geraete.expiresAt, now)))
    .orderBy(asc(geraete.createdAt), asc(geraete.id));
  // Das neue Gerät bleibt immer, dazu die jüngsten anderen.
  const andere = neueste.map((g) => g.id).filter((id) => id !== input.idHash);
  const bleiben = [input.idHash, ...andere.slice(-(MAX_GERAETE - 1))];
  await db
    .delete(geraete)
    .where(
      and(
        eq(geraete.ownerId, input.ownerId),
        or(lte(geraete.expiresAt, now), notInArray(geraete.id, bleiben)),
      ),
    );
  return eintrag(row);
}

/** Das gültige Gerät zu diesem Hash, sonst `undefined`. */
export async function find(
  db: Database,
  idHash: string,
  options: { now?: Date } = {},
): Promise<GeraetEintrag | undefined> {
  if (!sessionIdSchema.safeParse(idHash).success) return undefined;
  const now = options.now ?? new Date();
  const [row] = await db
    .select()
    .from(geraete)
    .where(and(eq(geraete.id, idHash), gt(geraete.expiresAt, now)));
  return row === undefined ? undefined : eintrag(row);
}

/** Entfernt ein Gerät (Abmelden in diesem Browser). */
export async function remove(db: Database, idHash: string): Promise<boolean> {
  if (!sessionIdSchema.safeParse(idHash).success) return false;
  const geloescht = await db
    .delete(geraete)
    .where(eq(geraete.id, idHash))
    .returning({ id: geraete.id });
  return geloescht.length > 0;
}

/** Entfernt alle Geräte des Besitzers („Alle Sitzungen beenden“, neues Passwort). */
export async function removeAll(db: Database, ownerId: OwnerId): Promise<number> {
  const geloescht = await db
    .delete(geraete)
    .where(eq(geraete.ownerId, ownerId))
    .returning({ id: geraete.id });
  return geloescht.length;
}
