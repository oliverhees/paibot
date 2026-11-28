/**
 * PaiBot – Datenbankschema: Tabelle der globalen Einstellungen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-07
 */

import type { BotId, InstallationId, Sha256Digest } from "@paibot/shared";
import { sql } from "drizzle-orm";
import { boolean, check, integer, text, timestamp } from "drizzle-orm/pg-core";
import { bots } from "./anbieter";
import { inListCheck, matches, optionalIdCheck, PATTERNS, pgTable } from "./helfer";
import { SCHLEUSE_MODES } from "./werte";

/**
 * Globale Einstellungen der Installation. Es gibt genau eine Zeile (id = "singleton"),
 * weil PaiBot pro Installation genau einen Besitzer hat.
 */
export const settings = pgTable(
  "settings",
  {
    id: text("id").primaryKey().default("singleton"),
    locale: text("locale").notNull().default("de"),
    timezone: text("timezone").notNull().default("Europe/Berlin"),
    schleuseModeDefault: text("schleuse_mode_default")
      .$type<(typeof SCHLEUSE_MODES)[number]>()
      .notNull()
      .default("off"),
    maxHops: integer("max_hops").notNull().default(8),
    dailyTokenBudget: integer("daily_token_budget"),
    historyTokenLimit: integer("history_token_limit"),
    killSwitch: boolean("kill_switch").notNull().default(false),
    installationId: text("installation_id").$type<InstallationId>().unique(),
    defaultBotId: text("default_bot_id")
      .$type<BotId>()
      .references(() => bots.id, { onDelete: "restrict" }),
    setupCompletedAt: timestamp("setup_completed_at", { withTimezone: true }),
    /**
     * Prüfwert des Einrichtungs-Codes (`sha256:` und 64 Hex-Zeichen), nie der Code selbst. Steht nur,
     * solange es noch keinen Besitzer gibt; beim Abschluss der Einrichtung wird er gelöscht.
     */
    setupCodeHash: text("setup_code_hash").$type<Sha256Digest>(),
    /** Wann der Einrichtungs-Code erzeugt wurde (zusammen mit `setupCodeHash` gesetzt). */
    setupCodeCreatedAt: timestamp("setup_code_created_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    /*
     * Grenzen eines Laufs mit Werkzeugen. Fest (keine Einstellung in der Oberfläche): Welche Felder
     * sich ändern lassen, steht in den Fakten von `einstellung.aendern` und gehört zur Tor-Fassung.
     */
    /** Höchstzahl der Schritte eines Laufs. */
    maxStepsPerRun: integer("max_steps_per_run").notNull().default(8),
    /** Höchstzahl der Werkzeug-Aufrufe in einem Schritt. */
    maxToolCallsPerStep: integer("max_tool_calls_per_step").notNull().default(8),
    /** Höchstzahl der Werkzeug-Aufrufe in einem Lauf. */
    maxToolCallsPerRun: integer("max_tool_calls_per_run").notNull().default(16),
    /** Höchstzahl der Token eines Laufs (Eingabe und Ausgabe aller Schritte). */
    maxTokensPerRun: integer("max_tokens_per_run").notNull().default(60000),
    /** Höchstzahl der Zeichen eines Werkzeug-Ergebnisses für das Modell. */
    toolResultMaxChars: integer("tool_result_max_chars").notNull().default(16000),
    /** Ob Pai Teams Aufträge geben darf (Stabschef); aus, bis der Besitzer es einschaltet. */
    stabschefErlaubt: boolean("stabschef_erlaubt").notNull().default(false),
    /** Höchstzahl der Zeichen aller Werkzeug-Ergebnisse eines Schritts. */
    toolResultsMaxCharsPerStep: integer("tool_results_max_chars_per_step").notNull().default(24000),
    /*
     * Grenzen der Aufträge (ab Migration 0020), je Bereich mit CHECK. Die Nummern der Grenzen im Tor
     * stehen in der Entwickler-Doku (`docs/entwickler/auftraege.md`).
     */
    /** Tiefe eines Auftragsbaums (Wurzel = 0). */
    auftragMaxTiefe: integer("auftrag_max_tiefe").notNull().default(3),
    /** Aufträge je Baum. */
    auftragMaxAnzahl: integer("auftrag_max_anzahl").notNull().default(20),
    /** Token aller Läufe eines Baums (ohne Zuschläge). */
    auftragMaxTokens: integer("auftrag_max_tokens").notNull().default(200000),
    /** Minuten seit der Wurzel. */
    auftragMaxMinuten: integer("auftrag_max_minuten").notNull().default(30),
    /** Offene Unter-Aufträge je Auftrag. */
    auftragMaxBreite: integer("auftrag_max_breite").notNull().default(6),
    /** Aufträge der Leitung an dasselbe Mitglied je Baum (Übergabe und Rückgaben). */
    auftraegeJeMitglied: integer("auftraege_je_mitglied").notNull().default(3),
    /** Rückfragen an dich je Faden. */
    rueckfragenJeFaden: integer("rueckfragen_je_faden").notNull().default(3),
    /** Bitten um Zulieferung je Auftrag eines Mitglieds. */
    bittenJeAuftrag: integer("bitten_je_auftrag").notNull().default(1),
    /** Zuschläge „+10.000 Token“ je Baum; fest 5. */
    zuschlaegeJeBaum: integer("zuschlaege_je_baum").notNull().default(5),
    /** Erwähnungen (`@Name`) je Nachricht. */
    erwaehnungenJeNachricht: integer("erwaehnungen_je_nachricht").notNull().default(6),
    /**
     * Not-Aus-Epoche: steigt um 1, wenn der Not-Aus eingeschaltet wird (Trigger `settings_epoche`),
     * und sonst nie. Ein Auftrag speichert die Epoche beim Anlegen; ein Lauf zu einem Auftrag einer
     * älteren Epoche startet nicht mehr.
     */
    notausEpoche: integer("notaus_epoche").notNull().default(0),
  },
  (t) => [
    check("settings_nur_eine_zeile", sql`${t.id} = 'singleton'`),
    inListCheck("settings_locale_werte", t.locale, ["de", "en"]),
    inListCheck("settings_schleuse_mode_werte", t.schleuseModeDefault, SCHLEUSE_MODES),
    check("settings_max_hops_positiv", sql`${t.maxHops} > 0`),
    check("settings_max_steps_per_run_bereich", sql`${t.maxStepsPerRun} between 1 and 16`),
    check(
      "settings_max_tool_calls_per_step_bereich",
      sql`${t.maxToolCallsPerStep} between 1 and 16`,
    ),
    check("settings_max_tool_calls_per_run_bereich", sql`${t.maxToolCallsPerRun} between 1 and 64`),
    check("settings_max_tokens_per_run_bereich", sql`${t.maxTokensPerRun} between 1000 and 500000`),
    check(
      "settings_tool_result_max_chars_bereich",
      sql`${t.toolResultMaxChars} between 1000 and 24000`,
    ),
    check(
      "settings_tool_results_max_chars_per_step_bereich",
      sql`${t.toolResultsMaxCharsPerStep} between 1000 and 24000`,
    ),
    check(
      "settings_werkzeug_zeichen_passen",
      sql`${t.toolResultMaxChars} <= ${t.toolResultsMaxCharsPerStep}`,
    ),
    check(
      "settings_tagesbudget_positiv",
      sql`${t.dailyTokenBudget} is null or ${t.dailyTokenBudget} > 0`,
    ),
    check(
      "settings_verlaufsgrenze_positiv",
      sql`${t.historyTokenLimit} is null or ${t.historyTokenLimit} > 0`,
    ),
    check("settings_auftrag_max_tiefe_bereich", sql`${t.auftragMaxTiefe} between 1 and 5`),
    check("settings_auftrag_max_anzahl_bereich", sql`${t.auftragMaxAnzahl} between 1 and 100`),
    check(
      "settings_auftrag_max_tokens_bereich",
      sql`${t.auftragMaxTokens} between 1000 and 2000000`,
    ),
    check("settings_auftrag_max_minuten_bereich", sql`${t.auftragMaxMinuten} between 1 and 240`),
    check("settings_auftrag_max_breite_bereich", sql`${t.auftragMaxBreite} between 1 and 12`),
    check("settings_auftraege_je_mitglied_bereich", sql`${t.auftraegeJeMitglied} between 1 and 10`),
    check("settings_rueckfragen_je_faden_bereich", sql`${t.rueckfragenJeFaden} between 1 and 10`),
    check("settings_bitten_je_auftrag_bereich", sql`${t.bittenJeAuftrag} between 1 and 3`),
    check("settings_zuschlaege_je_baum_fest", sql`${t.zuschlaegeJeBaum} = 5`),
    check(
      "settings_erwaehnungen_je_nachricht_bereich",
      sql`${t.erwaehnungenJeNachricht} between 1 and 12`,
    ),
    check("settings_notaus_epoche_nicht_negativ", sql`${t.notausEpoche} >= 0`),
    optionalIdCheck("settings_installation_id_format", t.installationId, "installation"),
    check(
      "settings_einrichtungs_code_format",
      sql`${t.setupCodeHash} is null or ${matches(t.setupCodeHash, PATTERNS.sha256Digest)}`,
    ),
    check(
      "settings_einrichtungs_code_paar",
      sql`(${t.setupCodeHash} is null) = (${t.setupCodeCreatedAt} is null)`,
    ),
    check(
      "settings_einrichtungs_code_nur_vorher",
      sql`${t.setupCodeHash} is null or ${t.setupCompletedAt} is null`,
    ),
  ],
);

export type Settings = typeof settings.$inferSelect;
