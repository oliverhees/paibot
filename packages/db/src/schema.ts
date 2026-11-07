import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Globale Einstellungen der Installation. Es gibt genau eine Zeile (id = "singleton"),
 * weil Paibot pro Installation genau einen Besitzer hat.
 */
export const settings = pgTable("settings", {
  id: text("id").primaryKey().default("singleton"),
  locale: text("locale").notNull().default("de"),
  timezone: text("timezone").notNull().default("Europe/Berlin"),
  schleuseModeDefault: text("schleuse_mode_default").notNull().default("auto"),
  maxHops: integer("max_hops").notNull().default(8),
  dailyTokenBudget: integer("daily_token_budget"),
  setupCompletedAt: timestamp("setup_completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Settings = typeof settings.$inferSelect;
