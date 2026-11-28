/**
 * PaiBot – Datenbankschema: Teams, Entwürfe für Teams und Fäden (Kopf einer Unterhaltung der Art
 * „faden“).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import type { ActionId, Actor, BotId, ConversationId, EntwurfId, TeamId } from "@paibot/shared";
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { bots } from "./anbieter";
import { idCheck, inListCheck, matches, optionalIdCheck, PATTERNS, pgTable } from "./helfer";
import { conversations } from "./unterhaltungen";
import {
  ENTWURF_HERKUENFTE,
  ENTWURF_STATUS,
  FADEN_ABNAHMEN,
  FADEN_HERKUENFTE,
  FADEN_STAENDE,
  TEAM_ANLAGE_ARTEN,
  TEAM_ZUSAMMENARBEIT,
} from "./werte";

/**
 * Teams aus Bots. Die Leitung ist ein Bot des Teams oder leer (`lead_bot_id`, ohne Zwang auf
 * „gehört zum Team“: das prüft das Tor mit einer Vorbedingung, die Datenbank hält nur die
 * Fremdschlüssel). Wird die Leitung gelöscht, bleibt das Team ohne Leitung; ein Team lässt sich
 * nicht löschen, solange es Fäden hat.
 */
export const teams = pgTable(
  "teams",
  {
    id: text("id").$type<TeamId>().primaryKey(),
    name: text("name").notNull(),
    leadBotId: text("lead_bot_id")
      .$type<BotId>()
      .references((): AnyPgColumn => bots.id, { onDelete: "set null" }),
    /** `aus`: die Bots arbeiten nicht untereinander; `leitung_fuehrt`: die Leitung verteilt die Arbeit. */
    collaboration: text("zusammenarbeit")
      .$type<(typeof TEAM_ZUSAMMENARBEIT)[number]>()
      .notNull()
      .default("aus"),
    /** Wer Ergebnisse abnimmt, wenn ein Faden nichts anderes sagt (`leitung`, `besitzer`, `ohne`). */
    acceptanceDefault: text("abnahme_standard")
      .$type<(typeof FADEN_ABNAHMEN)[number]>()
      .notNull()
      .default("leitung"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    idCheck("teams_id_format", t.id, "team"),
    check("teams_name_laenge", sql`char_length(${t.name}) between 1 and 60`),
    inListCheck("teams_zusammenarbeit_werte", t.collaboration, TEAM_ZUSAMMENARBEIT),
    inListCheck("teams_abnahme_standard_werte", t.acceptanceDefault, FADEN_ABNAHMEN),
    unique("teams_name_eindeutig").on(t.name),
    index("teams_lead_bot_id_idx").on(t.leadBotId),
  ],
);

/**
 * Entwürfe für ein Team (aus einer Vorlage oder Datei). Der Inhalt ist der geprüfte Text des
 * Entwurfs, `abdruck` seine Prüfsumme. Die Herkunft ist in dieser Fassung `vorlage` oder `datei`.
 */
export const teamEntwuerfe = pgTable(
  "team_entwuerfe",
  {
    id: text("id").$type<EntwurfId>().primaryKey(),
    status: text("status").$type<(typeof ENTWURF_STATUS)[number]>().notNull(),
    origin: text("herkunft").$type<(typeof ENTWURF_HERKUENFTE)[number]>().notNull(),
    /** Vorlagen-Kennung mit Fassung oder Dateiname mit Abdruck der Datei. */
    source: text("quelle").notNull(),
    title: text("titel").notNull(),
    content: jsonb("inhalt").notNull(),
    digest: text("abdruck").notNull(),
    formatVersion: integer("format_fassung").notNull(),
    validUntil: timestamp("gilt_bis", { withTimezone: true }),
    createdActionId: text("angelegt_action_id").$type<ActionId>(),
    revertedActionId: text("zurueck_action_id").$type<ActionId>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    idCheck("team_entwuerfe_id_format", t.id, "entwurf"),
    inListCheck("team_entwuerfe_status_werte", t.status, ENTWURF_STATUS),
    inListCheck("team_entwuerfe_herkunft_werte", t.origin, ENTWURF_HERKUENFTE),
    check("team_entwuerfe_quelle_laenge", sql`char_length(${t.source}) between 1 and 300`),
    check("team_entwuerfe_titel_laenge", sql`char_length(${t.title}) between 1 and 200`),
    check("team_entwuerfe_inhalt_objekt", sql`jsonb_typeof(${t.content}) = 'object'`),
    check(
      "team_entwuerfe_abdruck_format",
      sql`${t.digest} ~ ${sql.raw(`'${PATTERNS.sha256Digest}'`)}`,
    ),
    check("team_entwuerfe_fassung_positiv", sql`${t.formatVersion} >= 1`),
    optionalIdCheck("team_entwuerfe_angelegt_action_id_format", t.createdActionId, "action"),
    optionalIdCheck("team_entwuerfe_zurueck_action_id_format", t.revertedActionId, "action"),
    index("team_entwuerfe_status_idx").on(t.status, t.createdAt),
  ],
);

/**
 * Was ein Entwurf angelegt hat (Bots, Teams). Nur anhängen: Trigger lehnen Ändern und Löschen ab,
 * die App-Rolle darf nur lesen und anlegen. Ein Entwurf lässt sich nicht löschen, solange hier
 * Zeilen auf ihn zeigen.
 */
export const teamAnlagen = pgTable(
  "team_anlagen",
  {
    entwurfId: text("entwurf_id")
      .$type<EntwurfId>()
      .notNull()
      .references(() => teamEntwuerfe.id, { onDelete: "restrict" }),
    objektArt: text("objekt_art").$type<(typeof TEAM_ANLAGE_ARTEN)[number]>().notNull(),
    objektId: text("objekt_id").notNull(),
    /** Stand des Objekts beim Anlegen (Zeitstempel oder Fassung), für „Rückgängig“. */
    standBeiAnlage: text("stand_bei_anlage").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.entwurfId, t.objektArt, t.objektId] }),
    inListCheck("team_anlagen_objekt_art_werte", t.objektArt, TEAM_ANLAGE_ARTEN),
    check("team_anlagen_objekt_id_laenge", sql`char_length(${t.objektId}) between 1 and 60`),
    check("team_anlagen_stand_laenge", sql`char_length(${t.standBeiAnlage}) between 1 and 200`),
  ],
);

/**
 * Kopf eines Fadens (eine Unterhaltung der Art „faden“): Ziel, was „fertig“ heißt, wer abnimmt und
 * woher der Faden kommt. Ohne die Unterhaltung gibt es keinen Kopf; mit ihr wird er gelöscht.
 */
export const faeden = pgTable(
  "faeden",
  {
    conversationId: text("conversation_id")
      .$type<ConversationId>()
      .primaryKey()
      .references(() => conversations.id, { onDelete: "cascade" }),
    goal: text("ziel").notNull(),
    acceptance: text("abnahme").$type<(typeof FADEN_ABNAHMEN)[number]>().notNull(),
    origin: text("herkunft").$type<(typeof FADEN_HERKUENFTE)[number]>().notNull(),
    actionId: text("action_id").$type<ActionId>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    /** Stand des Fadens für den Kopf (ab Migration 0020). */
    stand: text("stand").$type<(typeof FADEN_STAENDE)[number]>().notNull().default("laufend"),
    /** Wer den Staffelstab hat: `bot:…`, `besitzer` oder niemand (leer). */
    stabBei: text("stab_bei").$type<Actor>(),
    /**
     * Im Faden stand einmal fremder Inhalt. Wird nur gesetzt, nie zurückgenommen (Trigger
     * `faeden_regeln`); eine neue Wurzel im Faden nimmt es nicht weg.
     */
    belastet: boolean("belastet").notNull().default(false),
  },
  (t) => [
    check("faeden_ziel_laenge", sql`char_length(${t.goal}) between 1 and 2000`),
    inListCheck("faeden_stand_werte", t.stand, FADEN_STAENDE),
    check(
      "faeden_stab_bei_format",
      sql`${t.stabBei} is null or ${matches(t.stabBei, PATTERNS.actor)}`,
    ),
    inListCheck("faeden_abnahme_werte", t.acceptance, FADEN_ABNAHMEN),
    inListCheck("faeden_herkunft_werte", t.origin, FADEN_HERKUENFTE),
    idCheck("faeden_action_id_format", t.actionId, "action"),
  ],
);

/**
 * Die Punkte „fertig, wenn“ eines Fadens: höchstens zwölf, je ein Text von 1 bis 200 Zeichen, in
 * fester Reihenfolge (`pos` von 0 bis 11). Eine Zeile je Punkt statt einer Liste in einer Spalte, damit
 * die Grenzen mit einfachen CHECK-Regeln gelten (die Sicherung erlaubt in Prüfregeln keine eigenen
 * Funktionen). Nur anlegen: Die Punkte eines Fadens ändern sich nicht.
 */
export const fadenPunkte = pgTable(
  "faden_punkte",
  {
    conversationId: text("conversation_id")
      .$type<ConversationId>()
      .notNull()
      .references(() => faeden.conversationId, { onDelete: "cascade" }),
    pos: integer("pos").notNull(),
    text: text("text").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.conversationId, t.pos] }),
    check("faden_punkte_pos_bereich", sql`${t.pos} between 0 and 11`),
    check("faden_punkte_text_laenge", sql`char_length(${t.text}) between 1 and 200`),
  ],
);

export type Team = typeof teams.$inferSelect;
export type TeamEntwurf = typeof teamEntwuerfe.$inferSelect;
export type TeamAnlage = typeof teamAnlagen.$inferSelect;
export type Faden = typeof faeden.$inferSelect;
export type FadenPunkt = typeof fadenPunkte.$inferSelect;
