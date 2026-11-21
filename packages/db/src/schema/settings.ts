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
      .references(() => bots.id, { onDelete: "set null" }),
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
  },
  (t) => [
    check("settings_nur_eine_zeile", sql`${t.id} = 'singleton'`),
    inListCheck("settings_locale_werte", t.locale, ["de", "en"]),
    inListCheck("settings_schleuse_mode_werte", t.schleuseModeDefault, SCHLEUSE_MODES),
    check("settings_max_hops_positiv", sql`${t.maxHops} > 0`),
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
