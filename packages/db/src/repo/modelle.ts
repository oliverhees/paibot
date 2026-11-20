/**
 * PaiBot – Zugriff auf Modelle eines Anbieters.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { type Model, type ModelId, newId, PaiBotError, type ProviderId } from "@paibot/shared";
import { and, asc, eq } from "drizzle-orm";
import type { Database } from "../client";
import { models } from "../schema";
import { toModel } from "./abbildung";
import { feldFehler, SQLSTATE, standardFehler, uebersetzen } from "./fehler";

export interface ModelCreate {
  id?: ModelId;
  providerId: ProviderId;
  slug: string;
  displayName: string;
  contextWindow?: number;
  enabled?: boolean;
}

function fehler(f: Parameters<typeof standardFehler>[0]) {
  if (f.code === SQLSTATE.eindeutig) return feldFehler("slug");
  return standardFehler(f);
}

/** Legt ein Modell an. Ein doppelter `slug` beim selben Anbieter ist eine ungültige Eingabe. */
export async function create(db: Database, input: ModelCreate): Promise<Model> {
  const [row] = await uebersetzen(
    () =>
      db
        .insert(models)
        .values({
          id: input.id ?? newId("model"),
          providerId: input.providerId,
          slug: input.slug,
          displayName: input.displayName,
          contextWindow: input.contextWindow ?? null,
          enabled: input.enabled ?? true,
        })
        .returning(),
    fehler,
  );
  if (row === undefined) throw new PaiBotError("intern");
  return toModel(row);
}

/** Legt das Modell an oder aktualisiert Anzeigename und Kontextfenster des vorhandenen. */
export async function upsert(db: Database, input: ModelCreate): Promise<Model> {
  const [row] = await uebersetzen(
    () =>
      db
        .insert(models)
        .values({
          id: input.id ?? newId("model"),
          providerId: input.providerId,
          slug: input.slug,
          displayName: input.displayName,
          contextWindow: input.contextWindow ?? null,
          enabled: input.enabled ?? true,
        })
        .onConflictDoUpdate({
          target: [models.providerId, models.slug],
          set: { displayName: input.displayName, contextWindow: input.contextWindow ?? null },
        })
        .returning(),
    fehler,
  );
  if (row === undefined) throw new PaiBotError("intern");
  return toModel(row);
}

export async function get(db: Database, id: ModelId): Promise<Model | undefined> {
  const [row] = await db.select().from(models).where(eq(models.id, id));
  return row === undefined ? undefined : toModel(row);
}

export async function findBySlug(
  db: Database,
  providerId: ProviderId,
  slug: string,
): Promise<Model | undefined> {
  const [row] = await db
    .select()
    .from(models)
    .where(and(eq(models.providerId, providerId), eq(models.slug, slug)));
  return row === undefined ? undefined : toModel(row);
}

/** Modelle, optional nur eines Anbieters oder nur die eingeschalteten. */
export async function list(
  db: Database,
  options: { providerId?: ProviderId; enabledOnly?: boolean } = {},
): Promise<Model[]> {
  const bedingungen = [
    ...(options.providerId === undefined ? [] : [eq(models.providerId, options.providerId)]),
    ...(options.enabledOnly === true ? [eq(models.enabled, true)] : []),
  ];
  const rows = await db
    .select()
    .from(models)
    .where(bedingungen.length === 0 ? undefined : and(...bedingungen))
    .orderBy(asc(models.displayName), asc(models.id));
  return rows.map(toModel);
}

export async function setEnabled(
  db: Database,
  id: ModelId,
  enabled: boolean,
): Promise<Model | undefined> {
  const [row] = await db.update(models).set({ enabled }).where(eq(models.id, id)).returning();
  return row === undefined ? undefined : toModel(row);
}

/** Löscht ein Modell; Bots, die es nutzten, haben danach kein Modell mehr. */
export async function remove(db: Database, id: ModelId): Promise<boolean> {
  const geloescht = await db.delete(models).where(eq(models.id, id)).returning({ id: models.id });
  return geloescht.length > 0;
}
