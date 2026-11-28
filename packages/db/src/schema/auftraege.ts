/**
 * PaiBot – Datenbankschema: Aufträge, die Läufe der Bots zu einem Baum verbinden, ihre Ereignisse
 * und die Zuschläge zum Budget eines Auftragsbaums.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

import type { ActionId, Actor, BotId, ConversationId, Id } from "@paibot/shared";
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { bots } from "./anbieter";
import {
  idCheck,
  inListCheck,
  matches,
  optionalIdCheck,
  PATTERNS,
  pgTable,
  valueList,
} from "./helfer";
import { conversations } from "./unterhaltungen";
import {
  AUFTRAG_ARTEN_DB,
  AUFTRAG_EREIGNIS_TYPEN,
  AUFTRAG_MAX_ZUSCHLAEGE,
  AUFTRAG_SERVER_ARTEN,
  AUFTRAG_STATUS,
  AUFTRAG_ZETTEL_MAX,
  AUFTRAG_ZUSCHLAG_TOKENS,
} from "./werte";

/** Kennung eines Auftrags (`auf_…`). */
export type AuftragId = Id<"auftrag">;

/**
 * Zeichen, die ein bereinigter Text nicht enthält: Steuerzeichen außer Tabulator und Zeilenumbruch
 * (also auch kein Wagenrücklauf), unsichtbare Zeichen und Zeichen, die die Schreibrichtung drehen,
 * sowie fremde Zeilentrenner (U+2028, U+2029). Ein POSIX-Ausdruck für eine CHECK-Regel.
 */
export const UNBEREINIGT_MUSTER =
  "[\\u0001-\\u0008\\u000B-\\u001F\\u007F-\\u009F\\u00AD\\u061C\\u180E\\u200B-\\u200F\\u2028-\\u202E\\u2060-\\u2064\\u2066-\\u206F\\uFEFF\\uFFF9-\\uFFFB]";

/**
 * Aufträge: wer wem in welchem Faden (oder im Chat mit Pai) welche Arbeit gegeben hat. Jeder Lauf
 * eines Bots unter einem Auftrag zeigt auf ihn (`runs.auftrag_id`); alle Aufträge unter einer
 * Wurzel bilden einen Auftragsbaum, für den die Grenzen gelten.
 *
 * Fest nach dem Anlegen (Trigger `auftraege_regeln`): Art, Zettel, „fertig, wenn“, Entscheidung,
 * Eltern, Wurzel, Unterhaltung, Empfänger, Geber und Not-Aus-Epoche. Der Stand wechselt nur auf
 * festen Wegen; die Zähler werden nie kleiner, `belastet` nie wieder `false`. Eine Spalte für
 * Rückgaben gibt es bewusst nicht: Die Grenze je Mitglied zählt der Server aus den Zeilen.
 */
export const auftraege = pgTable(
  "auftraege",
  {
    id: text("id").$type<AuftragId>().primaryKey(),
    art: text("art").$type<(typeof AUFTRAG_ARTEN_DB)[number]>().notNull(),
    /** Eltern-Auftrag; leer genau bei der Wurzel. */
    parentAuftragId: text("parent_auftrag_id")
      .$type<AuftragId>()
      .references((): AnyPgColumn => auftraege.id),
    /** Wurzel des Baums; bei der Wurzel die eigene Kennung. */
    rootId: text("root_id")
      .$type<AuftragId>()
      .notNull()
      .references((): AnyPgColumn => auftraege.id),
    /** Unterhaltung, in der der Empfänger arbeitet (Faden oder Chat mit Pai). */
    conversationId: text("conversation_id")
      .$type<ConversationId>()
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    /** Empfänger: der Bot, der unter diesem Auftrag arbeitet. */
    botId: text("bot_id")
      .$type<BotId>()
      .notNull()
      .references(() => bots.id),
    /** Geber (`besitzer` oder `bot:…`); leer bei den Arten, die der Server anlegt. */
    geber: text("geber").$type<Actor>(),
    /** Der Zettel, bereinigt, höchstens 2 000 Zeichen; unveränderlich. */
    zettel: text("zettel").notNull().default(""),
    /** „Fertig, wenn …“ des Auftrags, bereinigt; unveränderlich. */
    fertigWenn: text("fertig_wenn").notNull().default(""),
    status: text("status").$type<(typeof AUFTRAG_STATUS)[number]>().notNull().default("gefragt"),
    /**
     * Entscheidung des Tors, die den Auftrag erlaubt hat: deine Nachricht (`nachricht.senden`) bei
     * der Wurzel, die Übergabe (`auftrag.uebergeben`) sonst; bei den Arten des Servers die
     * Entscheidung, die den Zweig geöffnet hat.
     */
    actionId: text("action_id").$type<ActionId>().notNull(),
    /** Stand des Not-Aus beim Anlegen (`settings.notaus_epoche`). */
    notausEpoche: integer("notaus_epoche").notNull(),
    /** Der Auftrag stützt sich auf fremde Inhalte; wird nur gesetzt, nie zurückgenommen. */
    belastet: boolean("belastet").notNull().default(false),
    /** Rückfragen an dich unter diesem Auftrag. */
    rueckfragen: integer("rueckfragen").notNull().default(0),
    /** Bitten um Zulieferung aus diesem Auftrag. */
    bitten: integer("bitten").notNull().default(0),
    /** Fester Grund des Endzustands (Fehlercode-Format), z. B. `besitzer_uebernimmt`. */
    endGrund: text("end_grund"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    idCheck("auftraege_id_format", t.id, "auftrag"),
    idCheck("auftraege_root_id_format", t.rootId, "auftrag"),
    optionalIdCheck("auftraege_parent_id_format", t.parentAuftragId, "auftrag"),
    inListCheck("auftraege_art_werte", t.art, AUFTRAG_ARTEN_DB),
    inListCheck("auftraege_status_werte", t.status, AUFTRAG_STATUS),
    idCheck("auftraege_action_id_format", t.actionId, "action"),
    check(
      "auftraege_wurzel_ohne_eltern",
      sql`(${t.art} = 'wurzel') = (${t.parentAuftragId} is null) and (${t.art} = 'wurzel') = (${t.rootId} = ${t.id})`,
    ),
    check("auftraege_geber_format", sql`${t.geber} is null or ${matches(t.geber, PATTERNS.actor)}`),
    check(
      "auftraege_geber_nur_ohne_server",
      sql`(${t.art} in (${valueList(AUFTRAG_SERVER_ARTEN)})) = (${t.geber} is null)`,
    ),
    check("auftraege_wurzel_vom_besitzer", sql`${t.art} <> 'wurzel' or ${t.geber} = 'besitzer'`),
    check(
      "auftraege_zettel_laenge",
      sql`char_length(${t.zettel}) <= ${sql.raw(String(AUFTRAG_ZETTEL_MAX))}`,
    ),
    check("auftraege_zettel_bereinigt", sql`not (${matches(t.zettel, UNBEREINIGT_MUSTER)})`),
    check(
      "auftraege_fertig_wenn_laenge",
      sql`char_length(${t.fertigWenn}) <= ${sql.raw(String(AUFTRAG_ZETTEL_MAX))}`,
    ),
    check(
      "auftraege_fertig_wenn_bereinigt",
      sql`not (${matches(t.fertigWenn, UNBEREINIGT_MUSTER)})`,
    ),
    check("auftraege_epoche_nicht_negativ", sql`${t.notausEpoche} >= 0`),
    check("auftraege_rueckfragen_nicht_negativ", sql`${t.rueckfragen} >= 0`),
    check("auftraege_bitten_nicht_negativ", sql`${t.bitten} >= 0`),
    check(
      "auftraege_end_grund_format",
      sql`${t.endGrund} is null or ${matches(t.endGrund, PATTERNS.errorCode)}`,
    ),
    check(
      "auftraege_ende_passt",
      sql`(${t.status} in ('fertig', 'gescheitert', 'abgelehnt', 'abgebrochen')) = (${t.finishedAt} is not null)`,
    ),
    check(
      "auftraege_grund_nur_am_ende",
      sql`${t.endGrund} is null or ${t.status} in ('fertig', 'gescheitert', 'abgelehnt', 'abgebrochen')`,
    ),
    index("auftraege_root_id_idx").on(t.rootId, t.botId),
    index("auftraege_parent_id_idx").on(t.parentAuftragId),
    index("auftraege_conversation_id_idx").on(t.conversationId, t.createdAt),
    /** Eine Entscheidung legt je Art und Empfänger höchstens einen Auftrag an (Neustart legt nichts doppelt an). */
    uniqueIndex("auftraege_einmal_je_entscheidung").on(t.actionId, t.art, t.botId),
  ],
);

/**
 * Ereignisse eines Auftrags (Anlegen, Stand, Staffelstab), nur anhängen und ohne Inhalte: Ändern
 * und Löschen lehnt ein Trigger ab; gelöscht wird nur zusammen mit dem Auftrag. Anlegen und jeden
 * Wechsel des Stands schreibt ein Trigger an `auftraege` selbst.
 */
export const auftragEreignisse = pgTable(
  "auftrag_ereignisse",
  {
    seq: bigint("seq", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    auftragId: text("auftrag_id")
      .$type<AuftragId>()
      .notNull()
      .references(() => auftraege.id, { onDelete: "cascade" }),
    type: text("type").$type<(typeof AUFTRAG_EREIGNIS_TYPEN)[number]>().notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    inListCheck("auftrag_ereignisse_type_werte", t.type, AUFTRAG_EREIGNIS_TYPEN),
    check("auftrag_ereignisse_payload_objekt", sql`jsonb_typeof(${t.payload}) = 'object'`),
    index("auftrag_ereignisse_auftrag_id_idx").on(t.auftragId, t.seq),
  ],
);

/**
 * Zuschläge zum Budget eines Auftragsbaums (Knopf „+10.000 Token“, Besitzer-Aktion
 * `auftrag.budget_erhoehen`), nur anhängen. Fester Betrag, höchstens fünf je Wurzel: Die Nummer
 * des Zuschlags liegt zwischen 1 und 5 und ist je Wurzel eindeutig; der Trigger vergibt sie.
 */
export const auftragZuschlaege = pgTable(
  "auftrag_zuschlaege",
  {
    auftragRootId: text("auftrag_root_id")
      .$type<AuftragId>()
      .notNull()
      .references(() => auftraege.id, { onDelete: "cascade" }),
    nr: integer("nr").notNull(),
    actionId: text("action_id").$type<ActionId>().notNull(),
    tokens: integer("tokens").notNull().default(AUFTRAG_ZUSCHLAG_TOKENS),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("auftrag_zuschlaege_nr_je_wurzel").on(t.auftragRootId, t.nr),
    unique("auftrag_zuschlaege_action_id_eindeutig").on(t.actionId),
    check(
      "auftrag_zuschlaege_nr_bereich",
      sql`${t.nr} between 1 and ${sql.raw(String(AUFTRAG_MAX_ZUSCHLAEGE))}`,
    ),
    check(
      "auftrag_zuschlaege_tokens_fest",
      sql`${t.tokens} = ${sql.raw(String(AUFTRAG_ZUSCHLAG_TOKENS))}`,
    ),
    idCheck("auftrag_zuschlaege_action_id_format", t.actionId, "action"),
  ],
);

export type Auftrag = typeof auftraege.$inferSelect;
export type AuftragEreignis = typeof auftragEreignisse.$inferSelect;
export type AuftragZuschlag = typeof auftragZuschlaege.$inferSelect;
