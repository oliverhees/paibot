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
  type TeamId,
} from "@paibot/shared";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import type { Database } from "../client";
import { bots, settings, teams } from "../schema";
import { BOTS_LOCK_KEY } from "../sperren";
import { toBot } from "./abbildung";
import { feldFehler, SQLSTATE, standardFehler, uebersetzen } from "./fehler";
import { withTransaction } from "./transaktion";

export interface BotCreate {
  id?: BotId;
  name: string;
  instructions?: string;
  modelId?: ModelId;
  avatarShape: AvatarShape;
  color: BotColor;
  maxOutputTokens?: number;
  /** Aufgabe des Bots in seinem Team, in einem Satz. */
  role?: string;
  /** Team, in dem der Bot anfängt; ohne Angabe steht er für sich. */
  teamId?: TeamId;
}

export interface BotPatch {
  name?: string;
  role?: string;
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
          ...(input.role === undefined ? {} : { role: input.role }),
          ...(input.teamId === undefined ? {} : { teamId: input.teamId }),
        })
        .returning(),
    fehler,
  );
  if (row === undefined) throw new PaiBotError("intern");
  return toBot(row);
}

/**
 * Legt einen Bot an, aber nur solange es weniger als `max` gibt. Zählen und Einfügen liegen in
 * einer Transaktion unter der Sperre `BOTS_LOCK_KEY`: Zwei gleichzeitige Anfragen an der Grenze
 * legen deshalb nie beide an, auch nicht aus zwei Prozessen. Über der Grenze meldet sie
 * `limit_erreicht` und fügt nichts ein. Jeder Weg, der Bots anlegt und die Grenze einhalten muss,
 * nimmt diese Funktion statt `create`.
 */
export async function anlegenUnterGrenze(
  db: Database,
  input: BotCreate,
  max: number,
): Promise<Bot> {
  return withTransaction(db, async (tx) => {
    await tx.execute(`select pg_catalog.pg_advisory_xact_lock(${BOTS_LOCK_KEY})`);
    if ((await count(tx)) >= max) {
      throw new PaiBotError("limit_erreicht", {
        text: `Du hast schon ${max} Bots – mehr gehen nicht.`,
        ausweg: "Lösche einen Bot, den du nicht mehr brauchst.",
      });
    }
    return create(tx, input);
  });
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
        .set({ ...patch, updatedAt: sql`pg_catalog.now()` })
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
      db
        .update(bots)
        .set({ modelId, updatedAt: sql`pg_catalog.now()` })
        .where(eq(bots.id, id))
        .returning(),
    standardFehler,
  );
  return row === undefined ? undefined : toBot(row);
}

/**
 * Pausiert einen Bot oder hebt die Pause auf. `undefined`, wenn es ihn nicht gibt. Der Stand gilt
 * sofort: Das Tor liest ihn bei jeder Anfrage frisch (`readBotPaused` in den Läufen), auch mitten
 * in einem Lauf.
 */
export async function setPaused(
  db: Database,
  id: BotId,
  paused: boolean,
): Promise<Bot | undefined> {
  const [row] = await uebersetzen(
    () =>
      db
        .update(bots)
        .set({ paused, updatedAt: sql`pg_catalog.now()` })
        .where(eq(bots.id, id))
        .returning(),
    standardFehler,
  );
  return row === undefined ? undefined : toBot(row);
}

/**
 * Ordnet den Bot einem Team zu; `null` nimmt ihn heraus. `undefined`, wenn es ihn nicht gibt.
 * Gibt es das Team nicht, meldet der Fremdschlüssel `nicht_gefunden`.
 *
 * War der Bot die Leitung des Teams, das er verlässt, hat dieses Team danach keine Leitung: beides
 * geschieht in einer Transaktion. So ist die Leitung eines Teams immer ein Mitglied desselben
 * Teams – genau wie beim Löschen eines Bots, das die Leitung ebenfalls leer lässt.
 */
export async function setTeam(
  db: Database,
  id: BotId,
  teamId: TeamId | null,
): Promise<Bot | undefined> {
  return withTransaction(db, async (tx) => {
    await tx
      .update(teams)
      .set({ leadBotId: null, updatedAt: sql`pg_catalog.now()` })
      .where(
        teamId === null
          ? eq(teams.leadBotId, id)
          : and(eq(teams.leadBotId, id), ne(teams.id, teamId)),
      );
    const [row] = await uebersetzen(
      () =>
        tx
          .update(bots)
          .set({ teamId, updatedAt: sql`pg_catalog.now()` })
          .where(eq(bots.id, id))
          .returning(),
      standardFehler,
    );
    return row === undefined ? undefined : toBot(row);
  });
}

/** Wie viele Bots es gibt. Fakt `botsAfter` der Aktion `bot.anlegen` (Grenze „Bots insgesamt“). */
export async function count(db: Database): Promise<number> {
  const [row] = await db.select({ anzahl: sql<number>`count(*)::int` }).from(bots);
  return row?.anzahl ?? 0;
}

/** Namen der Fremdschlüssel, die das Löschen eines Bots verhindern. */
const FK_LAEUFE = "runs_bot_id_bots_id_fk";
const FK_STANDARD_BOT = "settings_default_bot_id_bots_id_fk";

/**
 * Löscht einen Bot samt seinen Direkt-Chats. `true`, wenn es ihn gab. Ein Bot mit Läufen und der
 * Standard-Bot lassen sich nicht löschen: Das meldet ein Fehler mit festem Satz (Code `abgelehnt`),
 * nichts wird verändert. Ein Bot, der in einem Team ist, verlässt es (`team_id` wird leer), und ein
 * Team, dessen Leitung er war, hat danach keine Leitung.
 */
export async function remove(db: Database, id: BotId): Promise<boolean> {
  const geloescht = await uebersetzen(
    () => db.delete(bots).where(eq(bots.id, id)).returning({ id: bots.id }),
    (fehler) => {
      if (fehler.code !== SQLSTATE.fremdschluessel && fehler.code !== SQLSTATE.verhindert) {
        return undefined;
      }
      if (fehler.constraint === FK_STANDARD_BOT) {
        return new PaiBotError("abgelehnt", {
          text: "Das ist dein Standard-Bot und lässt sich nicht löschen.",
          ausweg: "Wähle zuerst einen anderen Bot als Standard.",
        });
      }
      if (fehler.constraint === FK_LAEUFE) {
        return new PaiBotError("abgelehnt", {
          text: "Dieser Bot hat schon gearbeitet und lässt sich nicht löschen.",
          ausweg: "Pausiere den Bot, dann antwortet er nicht mehr.",
        });
      }
      return undefined;
    },
  );
  return geloescht.length > 0;
}
