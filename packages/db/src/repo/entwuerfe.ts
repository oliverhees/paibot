/**
 * PaiBot – Zugriff auf Team-Entwürfe: anlegen, lesen, zählen, verfallen lassen, in einer
 * Transaktion anwenden (Team und Bots) und als Ganzes zurücknehmen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 *
 * Nur der Besitzer-Weg der Web-App ruft die schreibenden Funktionen auf (Quelltext-Test
 * `teams-nur-besitzer-weg.test.ts`). Zwei Regeln halten das zusammen:
 * - **Eine Transaktion.** `anwenden` und `zuruecknehmen` legen alles an bzw. entfernen alles in
 *   einer Transaktion unter den Sperren für Bots und Teams. Scheitert ein Teil, bleibt keine Zeile
 *   übrig; der Beleg „Ergebnis“ des Tors trägt dann den Fehler.
 * - **Noch einmal prüfen.** Die Fakten, mit denen das Tor entschieden hat, liest der Server vorher.
 *   Grenze, Namen und „alles unbenutzt“ prüft diese Schicht in derselben Transaktion erneut und
 *   lehnt ab, wenn sich dazwischen etwas geändert hat (fail-closed).
 */

import {
  type ActionId,
  type AvatarShape,
  type Bot,
  type BotColor,
  type BotId,
  type EntwurfId,
  type ModelId,
  newId,
  PaiBotError,
  type Sha256Digest,
  type TeamId,
  t,
  toIsoTime,
} from "@paibot/shared";
import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import type { Database } from "../client";
import {
  bots as botsTabelle,
  conversations,
  messages,
  runs,
  teamAnlagen,
  teamEntwuerfe,
  teams as teamsTabelle,
} from "../schema";
import type { ENTWURF_HERKUENFTE, TEAM_ANLAGE_ARTEN } from "../schema/werte";
import { BOTS_LOCK_KEY, TEAMS_LOCK_KEY } from "../sperren";
import * as bots from "./bots";
import { standardFehler, uebersetzen } from "./fehler";
import * as teams from "./teams";
import { type EntwurfStand, entwurfStandSetzen } from "./teams";
import { withTransaction } from "./transaktion";

export type EntwurfHerkunft = (typeof ENTWURF_HERKUENFTE)[number];
export type AnlageArt = (typeof TEAM_ANLAGE_ARTEN)[number];

/** Ein Entwurf, wie die Oberfläche ihn bekommt: Zeiten als ISO-Text, leere Felder weggelassen. */
export interface Entwurf {
  id: EntwurfId;
  status: EntwurfStand;
  origin: EntwurfHerkunft;
  /** Vorlagen-Kennung mit Fassung (`content-team@…`) oder Dateiname mit Abdruck. */
  source: string;
  title: string;
  /** Der geprüfte Inhalt des Entwurfs (Format `pb-teamentwurf/v2`). */
  content: unknown;
  digest: Sha256Digest;
  formatVersion: number;
  /** Bis wann der Entwurf angelegt werden darf; danach verfällt er. */
  validUntil?: string;
  createdActionId?: ActionId;
  revertedActionId?: ActionId;
  createdAt: string;
  updatedAt: string;
}

export interface EntwurfCreate {
  id?: EntwurfId;
  origin: EntwurfHerkunft;
  source: string;
  title: string;
  content: unknown;
  digest: Sha256Digest;
  formatVersion: number;
  validUntil?: Date;
}

/** Eine Zeile aus `team_anlagen`: was dieser Entwurf angelegt hat. */
export interface Anlage {
  entwurfId: EntwurfId;
  objektArt: AnlageArt;
  objektId: string;
  /** Stand des Objekts beim Anlegen (`updated_at` als ISO-Text), für „Rückgängig“. */
  standBeiAnlage: string;
  createdAt: string;
}

/** Ein Bot, den das Anwenden anlegt; die Reihenfolge ist die des Entwurfs. */
export interface EntwurfBotAnlage {
  name: string;
  role: string;
  instructions: string;
  avatarShape: AvatarShape;
  color: BotColor;
  maxOutputTokens: number;
  modelId?: ModelId;
  /** Genau einer der Bots ist die Leitung des neuen Teams. */
  leitung?: boolean;
}

export interface AnwendenEingabe {
  entwurfId: EntwurfId;
  /** Die Aktion `team.entwurf_anlegen`, mit der das Tor dies erlaubt hat. */
  actionId: ActionId;
  team: {
    name: string;
    collaboration: teams.Zusammenarbeit;
    acceptanceDefault: teams.AbnahmeStandard;
  };
  bots: readonly EntwurfBotAnlage[];
  /** Grenze „Bots insgesamt“; sie gilt noch einmal unter der Sperre. */
  maxBots: number;
}

export interface AnwendenErgebnis {
  team: teams.Team;
  bots: Bot[];
}

/** Ob sich ein angelegtes Team noch als Ganzes zurücknehmen lässt (Fakten V-43). */
export interface Nutzung {
  /** Keine Nachricht und kein Lauf bei einem der neuen Bots, kein Faden im neuen Team. */
  allUnused: boolean;
  /** Jedes Objekt gibt es noch und steht auf dem Stand, den es beim Anlegen hatte. */
  allUnchanged: boolean;
}

type Zeile = typeof teamEntwuerfe.$inferSelect;

function wennGesetzt<K extends string, W>(name: K, wert: W | null): Record<K, W> | object {
  return wert === null ? {} : ({ [name]: wert } as Record<K, W>);
}

function toEntwurf(row: Zeile): Entwurf {
  return {
    id: row.id,
    status: row.status,
    origin: row.origin,
    source: row.source,
    title: row.title,
    content: row.content,
    digest: row.digest as Sha256Digest,
    formatVersion: row.formatVersion,
    ...wennGesetzt("validUntil", row.validUntil === null ? null : toIsoTime(row.validUntil)),
    ...wennGesetzt("createdActionId", row.createdActionId),
    ...wennGesetzt("revertedActionId", row.revertedActionId),
    createdAt: toIsoTime(row.createdAt),
    updatedAt: toIsoTime(row.updatedAt),
  };
}

function toAnlage(row: typeof teamAnlagen.$inferSelect): Anlage {
  return {
    entwurfId: row.entwurfId,
    objektArt: row.objektArt,
    objektId: row.objektId,
    standBeiAnlage: row.standBeiAnlage,
    createdAt: toIsoTime(row.createdAt),
  };
}

function nichtOffen(): PaiBotError {
  return new PaiBotError("abgelehnt", {
    text: t("teams.fehler.entwurf_nicht_offen"),
    ausweg: t("teams.fehler.entwurf_nicht_offen.ausweg"),
  });
}

/** Legt einen Entwurf im Stand `offen` an. */
export async function create(db: Database, input: EntwurfCreate): Promise<Entwurf> {
  const [row] = await uebersetzen(
    () =>
      db
        .insert(teamEntwuerfe)
        .values({
          id: input.id ?? newId("entwurf"),
          status: "offen",
          origin: input.origin,
          source: input.source,
          title: input.title,
          content: input.content,
          digest: input.digest,
          formatVersion: input.formatVersion,
          ...(input.validUntil === undefined ? {} : { validUntil: input.validUntil }),
        })
        .returning(),
    standardFehler,
  );
  if (row === undefined) throw new PaiBotError("intern");
  return toEntwurf(row);
}

export async function get(db: Database, id: EntwurfId): Promise<Entwurf | undefined> {
  const [row] = await db.select().from(teamEntwuerfe).where(eq(teamEntwuerfe.id, id)).limit(1);
  return row === undefined ? undefined : toEntwurf(row);
}

/** Alle Entwürfe, neueste zuerst. */
export async function list(db: Database): Promise<Entwurf[]> {
  const rows = await db
    .select()
    .from(teamEntwuerfe)
    .orderBy(sql`${teamEntwuerfe.createdAt} desc`, teamEntwuerfe.id);
  return rows.map(toEntwurf);
}

/** Wie viele Entwürfe offen sind (Fakt `offeneEntwuerfe` der Grenze G-34). */
export async function zaehleOffen(db: Database): Promise<number> {
  const [row] = await db
    .select({ anzahl: sql<number>`count(*)::int` })
    .from(teamEntwuerfe)
    .where(eq(teamEntwuerfe.status, "offen"));
  return row?.anzahl ?? 0;
}

/** Wie viele Entwürfe seit `ab` entstanden sind (Fakt `entwuerfeHeute` der Grenze G-34). */
export async function zaehleSeit(db: Database, ab: Date): Promise<number> {
  const [row] = await db
    .select({ anzahl: sql<number>`count(*)::int` })
    .from(teamEntwuerfe)
    .where(gte(teamEntwuerfe.createdAt, ab));
  return row?.anzahl ?? 0;
}

/**
 * Lässt einen offenen Entwurf verfallen, wenn seine Frist abgelaufen ist, und liefert ihn in dem
 * Stand zurück, der danach gilt. Verfallen heißt nur „nicht mehr anlegbar“: Lesen und Verwerfen
 * gehen weiter. Jede Stelle, die einen Entwurf zum Anlegen liest, ruft das vorher auf – so wirkt
 * die Frist auch ohne Aufräum-Auftrag.
 */
export async function mitVerfall(
  db: Database,
  id: EntwurfId,
  jetzt: Date = new Date(),
): Promise<Entwurf | undefined> {
  const entwurf = await get(db, id);
  if (entwurf === undefined) return undefined;
  if (entwurf.status !== "offen" || entwurf.validUntil === undefined) return entwurf;
  if (new Date(entwurf.validUntil).getTime() > jetzt.getTime()) return entwurf;
  await entwurfStandSetzen(db, id, "verfallen");
  return get(db, id);
}

/** Die Zeilen, die ein Entwurf angelegt hat, älteste zuerst. */
export async function anlagen(db: Database, id: EntwurfId): Promise<Anlage[]> {
  const rows = await db
    .select()
    .from(teamAnlagen)
    .where(eq(teamAnlagen.entwurfId, id))
    .orderBy(asc(teamAnlagen.createdAt), asc(teamAnlagen.objektArt), asc(teamAnlagen.objektId));
  return rows.map(toAnlage);
}

/**
 * Prüft, ob sich ein angelegtes Team noch als Ganzes zurücknehmen lässt: Jedes Objekt gibt es
 * noch, steht auf seinem Stand von damals (`updated_at`), und niemand hat es benutzt – kein Lauf
 * und keine Nachricht bei einem der neuen Bots, kein Faden im neuen Team. Fehlt ein Objekt oder
 * fehlen die Zeilen ganz, ist die Antwort „nicht unverändert“: lieber einzeln löschen als zu viel
 * entfernen.
 */
export async function nutzung(db: Database, id: EntwurfId): Promise<Nutzung> {
  const liste = await anlagen(db, id);
  if (liste.length === 0) return { allUnused: false, allUnchanged: false };
  const botIds = liste.filter((a) => a.objektArt === "bot").map((a) => a.objektId as BotId);
  const teamIds = liste.filter((a) => a.objektArt === "team").map((a) => a.objektId as TeamId);

  let allUnchanged = true;
  const botZeilen =
    botIds.length === 0
      ? []
      : await db
          .select({ id: botsTabelle.id, updatedAt: botsTabelle.updatedAt })
          .from(botsTabelle)
          .where(inArray(botsTabelle.id, botIds));
  const teamZeilen =
    teamIds.length === 0
      ? []
      : await db
          .select({ id: teamsTabelle.id, updatedAt: teamsTabelle.updatedAt })
          .from(teamsTabelle)
          .where(inArray(teamsTabelle.id, teamIds));
  for (const anlage of liste) {
    const stand =
      anlage.objektArt === "bot"
        ? botZeilen.find((z) => z.id === anlage.objektId)?.updatedAt
        : teamZeilen.find((z) => z.id === anlage.objektId)?.updatedAt;
    if (stand === undefined || toIsoTime(stand) !== anlage.standBeiAnlage) allUnchanged = false;
  }

  let allUnused = true;
  if (botIds.length > 0) {
    const [lauf] = await db
      .select({ anzahl: sql<number>`count(*)::int` })
      .from(runs)
      .where(inArray(runs.botId, botIds));
    if ((lauf?.anzahl ?? 0) > 0) allUnused = false;
    const [nachricht] = await db
      .select({ anzahl: sql<number>`count(*)::int` })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(inArray(conversations.botId, botIds));
    if ((nachricht?.anzahl ?? 0) > 0) allUnused = false;
  }
  if (teamIds.length > 0) {
    const [faden] = await db
      .select({ anzahl: sql<number>`count(*)::int` })
      .from(conversations)
      .where(inArray(conversations.teamId, teamIds));
    if ((faden?.anzahl ?? 0) > 0) allUnused = false;
  }
  return { allUnused, allUnchanged };
}

/**
 * Legt aus einem offenen Entwurf das Team und seine Bots an – alles in **einer** Transaktion unter
 * den Sperren für Bots und Teams (immer in dieser Reihenfolge, damit sich zwei Anfragen nicht
 * gegenseitig blockieren). Der Inhalt, der angelegt wird, wird dabei in den Entwurf geschrieben:
 * Danach trägt der Entwurf genau den Stand, der entstanden ist, und sein Abdruck belegt ihn.
 *
 * Scheitert ein Teil – Name schon vergeben, Grenze erreicht, Fehler in der Datenbank –, bleibt
 * keine Zeile übrig und der Fehler kommt heraus (das Tor schreibt dann einen Ergebnis-Beleg, der
 * nicht „ok“ ist).
 */
export async function anwenden(db: Database, eingabe: AnwendenEingabe): Promise<AnwendenErgebnis> {
  return withTransaction(db, async (tx) => {
    await tx.execute(`select pg_catalog.pg_advisory_xact_lock(${BOTS_LOCK_KEY})`);
    await tx.execute(`select pg_catalog.pg_advisory_xact_lock(${TEAMS_LOCK_KEY})`);

    const entwurf = await get(tx, eingabe.entwurfId);
    if (entwurf === undefined) throw new PaiBotError("nicht_gefunden");
    if (entwurf.status !== "offen") throw nichtOffen();

    const vorher = await bots.count(tx);
    if (vorher + eingabe.bots.length > eingabe.maxBots) {
      throw new PaiBotError("limit_erreicht", {
        text: t("teams.fehler.bots_grenze", { max: eingabe.maxBots }),
        ausweg: t("teams.fehler.bots_grenze.ausweg"),
      });
    }

    const teamId = newId("team");
    let team = await teams.create(tx, {
      id: teamId,
      name: eingabe.team.name,
      collaboration: eingabe.team.collaboration,
      acceptanceDefault: eingabe.team.acceptanceDefault,
    });

    const angelegt: Bot[] = [];
    let leitungId: BotId | undefined;
    for (const bot of eingabe.bots) {
      // `anlegenUnterGrenze` prüft Grenze und verwechselbare Namen noch einmal – auch gegen die
      // Bots, die dieselbe Transaktion gerade angelegt hat.
      const neu = await bots.anlegenUnterGrenze(
        tx,
        {
          name: bot.name,
          role: bot.role,
          instructions: bot.instructions,
          avatarShape: bot.avatarShape,
          color: bot.color,
          maxOutputTokens: bot.maxOutputTokens,
          ...(bot.modelId === undefined ? {} : { modelId: bot.modelId }),
          teamId,
          fromDraftId: eingabe.entwurfId,
        },
        eingabe.maxBots,
      );
      angelegt.push(neu);
      if (bot.leitung === true) leitungId = neu.id;
    }
    if (leitungId === undefined) throw new PaiBotError("eingabe_ungueltig");
    const mitLeitung = await teams.update(tx, teamId, { leadBotId: leitungId });
    if (mitLeitung === undefined) throw new PaiBotError("intern");
    team = mitLeitung;

    await tx.insert(teamAnlagen).values([
      {
        entwurfId: eingabe.entwurfId,
        objektArt: "team" as const,
        objektId: team.id,
        standBeiAnlage: team.updatedAt,
      },
      ...angelegt.map((bot) => ({
        entwurfId: eingabe.entwurfId,
        objektArt: "bot" as const,
        objektId: bot.id,
        standBeiAnlage: bot.updatedAt,
      })),
    ]);

    // Inhalt und Abdruck der Zeile bleiben, wie sie beim Erstellen waren – der Entwurf ist der
    // Vorschlag, nicht das Ergebnis. Die App-Rolle darf sie auch nicht ändern
    // (`packages/db/src/rollen.ts`: „Inhalt und Abdruck eines Entwurfs ändert die App nie“). Was
    // wirklich angelegt wurde, steht in den Zeilen selbst, in `team_anlagen` und als Abdruck im
    // Beleg der Aktion.
    await entwurfStandSetzen(tx, eingabe.entwurfId, "angelegt", eingabe.actionId);

    return { team, bots: angelegt };
  });
}

/**
 * Nimmt ein angelegtes Team als Ganzes zurück: in **einer** Transaktion erst die Bots, dann das
 * Team. Vorher prüft sie noch einmal, dass alles unbenutzt und unverändert ist; sonst lehnt sie ab
 * und entfernt nichts (dann löscht der Besitzer einzeln). Die Zeilen in `team_anlagen` bleiben –
 * die Tabelle hängt nur an, damit nachvollziehbar bleibt, was einmal entstanden ist. Belege
 * bleiben ebenfalls.
 */
export async function zuruecknehmen(
  db: Database,
  entwurfId: EntwurfId,
  actionId: ActionId,
): Promise<{ bots: BotId[]; teams: TeamId[] }> {
  return withTransaction(db, async (tx) => {
    await tx.execute(`select pg_catalog.pg_advisory_xact_lock(${BOTS_LOCK_KEY})`);
    await tx.execute(`select pg_catalog.pg_advisory_xact_lock(${TEAMS_LOCK_KEY})`);

    const entwurf = await get(tx, entwurfId);
    if (entwurf === undefined) throw new PaiBotError("nicht_gefunden");
    if (entwurf.status !== "angelegt") throw nichtOffen();

    const stand = await nutzung(tx, entwurfId);
    if (!stand.allUnused || !stand.allUnchanged) throw new PaiBotError("entwurf_benutzt");

    const liste = await anlagen(tx, entwurfId);
    const botIds = liste.filter((a) => a.objektArt === "bot").map((a) => a.objektId as BotId);
    const teamIds = liste.filter((a) => a.objektArt === "team").map((a) => a.objektId as TeamId);
    for (const botId of botIds) {
      if (!(await bots.remove(tx, botId))) throw new PaiBotError("nicht_gefunden");
    }
    for (const teamId of teamIds) {
      if (!(await teams.remove(tx, teamId))) throw new PaiBotError("nicht_gefunden");
    }
    await entwurfStandSetzen(tx, entwurfId, "zurueckgenommen", actionId);
    return { bots: botIds, teams: teamIds };
  });
}

/** Verwirft einen offenen Entwurf; der Inhalt bleibt lesbar. */
export async function verwerfen(db: Database, id: EntwurfId): Promise<EntwurfStand | undefined> {
  return entwurfStandSetzen(db, id, "verworfen");
}

/** Nur für Tests und die Oberfläche: Zahl der Zeilen, die ein Entwurf angelegt hat. */
export async function zaehleAnlagen(db: Database, id: EntwurfId): Promise<number> {
  const [row] = await db
    .select({ anzahl: sql<number>`count(*)::int` })
    .from(teamAnlagen)
    .where(and(eq(teamAnlagen.entwurfId, id)));
  return row?.anzahl ?? 0;
}
