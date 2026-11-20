/**
 * PaiBot – Zugriff auf Bots.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import {
  type AvatarShape,
  type Bot,
  type BotColor,
  type BotId,
  type ModelId,
  newId,
  PaiBotError,
} from "@paibot/shared";
import { asc, eq, sql } from "drizzle-orm";
import type { Database } from "../client";
import { bots, settings } from "../schema";
import { toBot } from "./abbildung";
import { feldFehler, SQLSTATE, standardFehler, uebersetzen } from "./fehler";

export interface BotCreate {
  id?: BotId;
  name: string;
  instructions?: string;
  modelId?: ModelId;
  avatarShape: AvatarShape;
  color: BotColor;
  maxOutputTokens?: number;
}

export interface BotPatch {
  name?: string;
  instructions?: string;
  avatarShape?: AvatarShape;
  color?: BotColor;
  maxOutputTokens?: number;
}

function fehler(f: Parameters<typeof standardFehler>[0]) {
  if (f.code === SQLSTATE.eindeutig) return feldFehler("name");
  return standardFehler(f);
}

/** Legt einen Bot an. Ein doppelter Name ist eine ungültige Eingabe. */
export async function create(db: Database, input: BotCreate): Promise<Bot> {
  const [row] = await uebersetzen(
    () =>
      db
        .insert(bots)
        .values({
          id: input.id ?? newId("bot"),
          name: input.name,
          avatarShape: input.avatarShape,
          color: input.color,
          ...(input.instructions === undefined ? {} : { instructions: input.instructions }),
          ...(input.modelId === undefined ? {} : { modelId: input.modelId }),
          ...(input.maxOutputTokens === undefined
            ? {}
            : { maxOutputTokens: input.maxOutputTokens }),
        })
        .returning(),
    fehler,
  );
  if (row === undefined) throw new PaiBotError("intern");
  return toBot(row);
}

export async function get(db: Database, id: BotId): Promise<Bot | undefined> {
  const [row] = await db.select().from(bots).where(eq(bots.id, id));
  return row === undefined ? undefined : toBot(row);
}

export async function list(db: Database): Promise<Bot[]> {
  const rows = await db.select().from(bots).orderBy(asc(bots.createdAt), asc(bots.id));
  return rows.map(toBot);
}

/** Der Standard-Bot aus den Einstellungen, falls gesetzt. */
export async function getDefault(db: Database): Promise<Bot | undefined> {
  const [row] = await db
    .select({ bot: bots })
    .from(settings)
    .innerJoin(bots, eq(bots.id, settings.defaultBotId))
    .limit(1);
  return row === undefined ? undefined : toBot(row.bot);
}

/** Ändert einen Bot. `undefined`, wenn es ihn nicht gibt. */
export async function update(db: Database, id: BotId, patch: BotPatch): Promise<Bot | undefined> {
  const [row] = await uebersetzen(
    () =>
      db
        .update(bots)
        .set({ ...patch, updatedAt: sql`now()` })
        .where(eq(bots.id, id))
        .returning(),
    fehler,
  );
  return row === undefined ? undefined : toBot(row);
}

/** Legt das Modell des Bots fest; `null` entfernt es. */
export async function setModel(
  db: Database,
  id: BotId,
  modelId: ModelId | null,
): Promise<Bot | undefined> {
  const [row] = await uebersetzen(
    () =>
      db.update(bots).set({ modelId, updatedAt: sql`now()` }).where(eq(bots.id, id)).returning(),
    standardFehler,
  );
  return row === undefined ? undefined : toBot(row);
}

/** Löscht einen Bot samt seinen Unterhaltungen. `true`, wenn es ihn gab. */
export async function remove(db: Database, id: BotId): Promise<boolean> {
  const geloescht = await db.delete(bots).where(eq(bots.id, id)).returning({ id: bots.id });
  return geloescht.length > 0;
}
