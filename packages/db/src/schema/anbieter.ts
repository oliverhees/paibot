/**
 * PaiBot – Datenbankschema: Anbieter, Modelle und Bots.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { BotId, ModelId, ProviderId } from "@paibot/shared";
import { sql } from "drizzle-orm";
import { boolean, check, integer, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";
import { idCheck, inListCheck, matches, PATTERNS } from "./helfer";
import {
  AVATAR_SHAPES,
  BOT_COLORS,
  PROVIDER_KINDS,
  PROVIDER_TEMPLATE_KEYS,
  REGIONS,
} from "./werte";

/**
 * Dienste, die Modelle bereitstellen. Der Schlüssel liegt nur verschlüsselt in `api_key_enc`
 * (`v2`: gebunden an ID und Host der Basis-URL). `template_key` nennt die Vorlage.
 */
export const providers = pgTable(
  "providers",
  {
    id: text("id").$type<ProviderId>().primaryKey(),
    kind: text("kind").$type<(typeof PROVIDER_KINDS)[number]>().notNull(),
    templateKey: text("template_key")
      .$type<(typeof PROVIDER_TEMPLATE_KEYS)[number]>()
      .notNull()
      .default("eigener"),
    name: text("name").notNull(),
    baseUrl: text("base_url").notNull(),
    apiKeyEnc: text("api_key_enc"),
    region: text("region").$type<(typeof REGIONS)[number]>().notNull(),
    country: text("country"),
    enabled: boolean("enabled").notNull().default(true),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    lastCheckOk: boolean("last_check_ok"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    idCheck("providers_id_format", t.id, "provider"),
    inListCheck("providers_kind_werte", t.kind, PROVIDER_KINDS),
    inListCheck("providers_template_key_werte", t.templateKey, PROVIDER_TEMPLATE_KEYS),
    inListCheck("providers_region_werte", t.region, REGIONS),
    check("providers_name_laenge", sql`char_length(${t.name}) between 1 and 100`),
    check(
      "providers_country_format",
      sql`${t.country} is null or ${matches(t.country, "^[A-Z]{2}$")}`,
    ),
    check(
      "providers_api_key_format",
      sql`${t.apiKeyEnc} is null or ${matches(t.apiKeyEnc, PATTERNS.encrypted)}`,
    ),
    unique("providers_base_url_eindeutig").on(t.baseUrl),
  ],
);

/** Modelle eines Anbieters, wählbar für den Bot. */
export const models = pgTable(
  "models",
  {
    id: text("id").$type<ModelId>().primaryKey(),
    providerId: text("provider_id")
      .$type<ProviderId>()
      .notNull()
      .references(() => providers.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    displayName: text("display_name").notNull(),
    contextWindow: integer("context_window"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    idCheck("models_id_format", t.id, "model"),
    check("models_slug_laenge", sql`char_length(${t.slug}) between 1 and 200`),
    check("models_display_name_laenge", sql`char_length(${t.displayName}) between 1 and 200`),
    check(
      "models_context_window_positiv",
      sql`${t.contextWindow} is null or ${t.contextWindow} > 0`,
    ),
    unique("models_provider_slug_eindeutig").on(t.providerId, t.slug),
  ],
);

/** Bots mit Name, Anweisung, Modell und Aussehen. */
export const bots = pgTable(
  "bots",
  {
    id: text("id").$type<BotId>().primaryKey(),
    name: text("name").notNull(),
    instructions: text("instructions").notNull().default(""),
    modelId: text("model_id")
      .$type<ModelId>()
      .references(() => models.id, { onDelete: "set null" }),
    avatarShape: text("avatar_shape").$type<(typeof AVATAR_SHAPES)[number]>().notNull(),
    color: text("color").$type<(typeof BOT_COLORS)[number]>().notNull(),
    maxOutputTokens: integer("max_output_tokens").notNull().default(4096),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    idCheck("bots_id_format", t.id, "bot"),
    check("bots_name_laenge", sql`char_length(${t.name}) between 1 and 60`),
    check("bots_instructions_laenge", sql`char_length(${t.instructions}) <= 8000`),
    inListCheck("bots_avatar_shape_werte", t.avatarShape, AVATAR_SHAPES),
    inListCheck("bots_color_werte", t.color, BOT_COLORS),
    check("bots_max_output_tokens_positiv", sql`${t.maxOutputTokens} > 0`),
    unique("bots_name_eindeutig").on(t.name),
  ],
);

export type Provider = typeof providers.$inferSelect;
export type Model = typeof models.$inferSelect;
export type Bot = typeof bots.$inferSelect;
