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
