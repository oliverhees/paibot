/**
 * PaiBot – Zugriff auf Aufträge: anlegen mit der aktuellen Not-Aus-Epoche, Stand nur auf den
 * erlaubten Wegen wechseln, Zähler erhöhen, „belastet“ setzen, Zuschläge anhängen und die Zahlen
 * für die Grenzen zählen. Die Datenbank prüft dieselben Regeln noch einmal (Trigger aus Migration
 * 0020); diese Funktionen sind der einzige Weg der App dorthin.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

import {
  type ActionId,
  type Actor,
  type BotId,
  type ConversationId,
  newId,
  PaiBotError,
} from "@paibot/shared";
import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "../client";
import {
  AUFTRAG_END_STATUS,
  AUFTRAG_OFFENE_STATUS,
  type Auftrag,
  type AuftragId,
  auftraege,
  auftragZuschlaege,
  settings,
} from "../schema";
import type { AUFTRAG_ARTEN_DB, AUFTRAG_STATUS } from "../schema/werte";
import { feldFehler, SQLSTATE, StatuswechselError, standardFehler, uebersetzen } from "./fehler";

export type AuftragArt = (typeof AUFTRAG_ARTEN_DB)[number];
export type AuftragStatus = (typeof AUFTRAG_STATUS)[number];
export type AuftragEndStatus = (typeof AUFTRAG_END_STATUS)[number];

/**
 * Erlaubte Wege: Zielstand → Stände, aus denen man dorthin wechseln darf (wie der Trigger
 * `auftraege_regeln`). Aus `fertig` geht es nur für die Wurzel zurück nach `arbeitet`
 * (du gibst das Ergebnis zurück); das prüft `statusSetzen` zusätzlich.
 */
export const AUFTRAG_TRANSITIONS: Readonly<Record<AuftragStatus, readonly AuftragStatus[]>> = {
  gefragt: [],
  arbeitet: ["gefragt", "wartet_auf_dich", "fertig"],
  wartet_auf_dich: ["arbeitet"],
  fertig: ["arbeitet", "wartet_auf_dich"],
  gescheitert: ["gefragt", "arbeitet", "wartet_auf_dich"],
  abgelehnt: ["gefragt"],
  abgebrochen: ["gefragt", "arbeitet", "wartet_auf_dich"],
};

/** Darf ein Auftrag dieser Art von `von` nach `nach` wechseln? */
export function canTransition(art: AuftragArt, von: AuftragStatus, nach: AuftragStatus): boolean {
  if (von === "fertig" && art !== "wurzel") return false;
  return AUFTRAG_TRANSITIONS[nach].includes(von);
}

export function istEnde(status: AuftragStatus): status is AuftragEndStatus {
  return (AUFTRAG_END_STATUS as readonly string[]).includes(status);
}

export interface AuftragCreate {
  id?: AuftragId;
  art: AuftragArt;
  /** Eltern-Auftrag; fehlt genau bei der Wurzel. */
  parentAuftragId?: AuftragId;
  conversationId: ConversationId;
  /** Empfänger, der unter dem Auftrag arbeitet. */
  botId: BotId;
  /** Geber; fehlt bei `rueckkehr`, `sammeln` und `rueckmeldung` (legt der Server an). */
  geber?: Actor;
  /** Bereinigter Zettel (höchstens 2 000 Zeichen). */
  zettel?: string;
  fertigWenn?: string;
  /** Entscheidung des Tors, die den Auftrag erlaubt (Pflicht). */
  actionId: ActionId;
  /** Gesetzt, wenn der Auftrag sich auf fremde Inhalte stützt; ein Kind erbt es ohnehin. */
  belastet?: boolean;
}

/**
 * Legt einen Auftrag an (Stand `gefragt`). Die Wurzel des Baums kommt aus dem Eltern-Auftrag, die
 * Not-Aus-Epoche aus den Einstellungen, beides in derselben Anweisung. Eine zweite Anlage mit
 * derselben Entscheidung, Art und demselben Empfänger (Neustart) gibt `eingabe_ungueltig`
 * (Feld `actionId`); fehlt die passende Entscheidung oder ist der Not-Aus an, `abgelehnt`.
 */
export async function anlegen(db: Database, input: AuftragCreate): Promise<Auftrag> {
  const id = input.id ?? newId("auftrag");
  const rootId =
    input.parentAuftragId === undefined
      ? sql`${id}`
      : sql`(select a.root_id from ${auftraege} a where a.id = ${input.parentAuftragId})`;
  const [row] = await uebersetzen(
    () =>
      db
        .insert(auftraege)
        .values({
          id,
          art: input.art,
          parentAuftragId: input.parentAuftragId ?? null,
          rootId,
          conversationId: input.conversationId,
          botId: input.botId,
          geber: input.geber ?? null,
          zettel: input.zettel ?? "",
          fertigWenn: input.fertigWenn ?? "",
          actionId: input.actionId,
          notausEpoche: sql`(select s.notaus_epoche from ${settings} s where s.id = 'singleton')`,
          belastet: input.belastet ?? false,
        })
        .returning(),
    (fehler) => {
      if (fehler.code === SQLSTATE.eindeutig) return feldFehler("actionId");
      if (fehler.code === SQLSTATE.verhindert) return new PaiBotError("abgelehnt");
      return standardFehler(fehler);
    },
  );
  if (row === undefined) throw new PaiBotError("intern");
  return row;
}

export async function get(db: Database, id: AuftragId): Promise<Auftrag | undefined> {
  const [row] = await db.select().from(auftraege).where(eq(auftraege.id, id));
  return row;
}

/** Alle Aufträge eines Baums, in der Reihenfolge ihres Anlegens. */
export async function baum(db: Database, rootId: AuftragId): Promise<Auftrag[]> {
  return db
    .select()
    .from(auftraege)
    .where(eq(auftraege.rootId, rootId))
    .orderBy(asc(auftraege.createdAt), asc(auftraege.id));
}

/**
 * Wechselt den Stand in einer bedingten Anweisung (nur, wenn der Auftrag noch `von` hat). Ein
 * Endzustand setzt das Ende und den Grund; ein Weg zurück nach `arbeitet` leert beide. Gibt es den
 * Auftrag nicht, `nicht_gefunden`; hat er einen anderen Stand oder ist der Weg nicht erlaubt,
 * `StatuswechselError`.
 */
export async function statusSetzen(
  db: Database,
  id: AuftragId,
  input: { von: AuftragStatus; nach: AuftragStatus; grund?: string; now?: Date },
): Promise<Auftrag> {
  if (!AUFTRAG_TRANSITIONS[input.nach].includes(input.von)) {
    throw new StatuswechselError("auftrag", id, input.von, input.nach);
  }
  const ende = istEnde(input.nach);
  const now = input.now ?? new Date();
  const [row] = await uebersetzen(
    () =>
      db
        .update(auftraege)
        .set({
          status: input.nach,
          finishedAt: ende ? now : null,
          endGrund: ende ? (input.grund ?? null) : null,
          updatedAt: now,
        })
        .where(
          and(
            eq(auftraege.id, id),
            eq(auftraege.status, input.von),
            input.von === "fertig" ? eq(auftraege.art, "wurzel") : sql`true`,
          ),
        )
        .returning(),
    (fehler) =>
      fehler.code === SQLSTATE.verhindert
        ? new StatuswechselError("auftrag", id, input.von, input.nach)
        : standardFehler(fehler),
  );
  if (row !== undefined) return row;
  const vorhanden = await get(db, id);
  if (vorhanden === undefined) throw new PaiBotError("nicht_gefunden");
  throw new StatuswechselError("auftrag", id, vorhanden.status, input.nach);
}

/** Zählt eine Rückfrage an dich unter diesem Auftrag (der Zähler wird nie kleiner). */
export async function rueckfrageZaehlen(db: Database, id: AuftragId): Promise<number> {
  const [row] = await db
    .update(auftraege)
    .set({ rueckfragen: sql`${auftraege.rueckfragen} + 1`, updatedAt: new Date() })
    .where(eq(auftraege.id, id))
    .returning({ n: auftraege.rueckfragen });
  if (row === undefined) throw new PaiBotError("nicht_gefunden");
  return row.n;
}

/** Zählt eine Bitte um Zulieferung aus diesem Auftrag. */
export async function bitteZaehlen(db: Database, id: AuftragId): Promise<number> {
  const [row] = await db
    .update(auftraege)
    .set({ bitten: sql`${auftraege.bitten} + 1`, updatedAt: new Date() })
    .where(eq(auftraege.id, id))
    .returning({ n: auftraege.bitten });
  if (row === undefined) throw new PaiBotError("nicht_gefunden");
  return row.n;
}

/** Kennzeichnet den Auftrag als belastet (nur setzen, nie zurücknehmen). */
export async function belasten(db: Database, id: AuftragId): Promise<void> {
  await db
    .update(auftraege)
    .set({ belastet: true, updatedAt: new Date() })
    .where(and(eq(auftraege.id, id), eq(auftraege.belastet, false)));
}

/**
 * Hängt einen Zuschlag von 10 000 Token an den Baum (mit deiner erlaubten Entscheidung
 * `auftrag.budget_erhoehen`). Die Nummer vergibt die Datenbank; der sechste Zuschlag scheitert an
 * ihrer Prüfregel und wird zu `limit_erreicht`; ohne passende Entscheidung `abgelehnt`.
 */
export async function zuschlagAnhaengen(
  db: Database,
  rootId: AuftragId,
  actionId: ActionId,
): Promise<{ nr: number; tokens: number }> {
  const [row] = await uebersetzen(
    () =>
      db
        .insert(auftragZuschlaege)
        .values({ auftragRootId: rootId, nr: 0, actionId })
        .returning({ nr: auftragZuschlaege.nr, tokens: auftragZuschlaege.tokens }),
    (fehler) => {
      if (fehler.code === SQLSTATE.pruefbedingung) return new PaiBotError("limit_erreicht");
      if (fehler.code === SQLSTATE.eindeutig) return feldFehler("actionId");
      if (fehler.code === SQLSTATE.verhindert) return new PaiBotError("abgelehnt");
      return standardFehler(fehler);
    },
  );
  if (row === undefined) throw new PaiBotError("intern");
  return row;
}

/** Zahl und Summe der Zuschläge eines Baums (für G-11 „Grenze + Summe“ und G-46). */
export async function zuschlaege(
  db: Database,
  rootId: AuftragId,
): Promise<{ anzahl: number; tokens: number }> {
  const [row] = await db
    .select({
      anzahl: count(),
      tokens: sql<string>`coalesce(sum(${auftragZuschlaege.tokens}), 0)::text`,
    })
    .from(auftragZuschlaege)
    .where(eq(auftragZuschlaege.auftragRootId, rootId));
  return { anzahl: row?.anzahl ?? 0, tokens: Number(row?.tokens ?? 0) };
}

/**
 * Aufträge eines Gebers an ein Mitglied in einem Baum (Übergaben und Rückgaben), gezählt aus den
 * Zeilen; eine Spalte dafür gibt es nicht. Bitten und die Arten des Servers zählen nicht mit.
 */
export async function auftraegeAnMitglied(
  db: Database,
  input: { rootId: AuftragId; botId: BotId; geber: Actor },
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(auftraege)
    .where(
      and(
        eq(auftraege.rootId, input.rootId),
        eq(auftraege.botId, input.botId),
        eq(auftraege.geber, input.geber),
        inArray(auftraege.art, ["uebergabe", "rueckgabe"]),
      ),
    );
  return row?.n ?? 0;
}

/** Offene Unter-Aufträge eines Auftrags (für die Breite G-41). */
export async function offeneKinder(db: Database, id: AuftragId): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(auftraege)
    .where(
      and(eq(auftraege.parentAuftragId, id), inArray(auftraege.status, [...AUFTRAG_OFFENE_STATUS])),
    );
  return row?.n ?? 0;
}
