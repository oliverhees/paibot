/**
 * PaiBot – Datenbankschema: Besitzer, Sitzungen, bekannte Geräte und Zähler für Rate-Limits.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { DEVICE_KINDS, DEVICE_RIGHTS, type DeviceId, type OwnerId } from "@paibot/shared";
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { idCheck, inListCheck, matches, PATTERNS, pgTable } from "./helfer";
import { SESSION_AUTH_LEVELS, SESSION_METHODS } from "./werte";

/** Der Besitzer der Installation. Es gibt höchstens eine Zeile. */
export const owner = pgTable(
  "owner",
  {
    id: text("id").$type<OwnerId>().primaryKey(),
    passwordHash: text("password_hash").notNull(),
    passwordChangedAt: timestamp("password_changed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    idCheck("owner_id_format", t.id, "owner"),
    uniqueIndex("owner_einzige_zeile").on(sql`(true)`),
  ],
);

/** Angemeldete Sitzungen. Die ID ist der SHA-256 des Tokens, das Token selbst wird nie gespeichert. */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .$type<OwnerId>()
      .notNull()
      .references(() => owner.id, { onDelete: "cascade" }),
    authLevel: text("auth_level").$type<(typeof SESSION_AUTH_LEVELS)[number]>().notNull(),
    method: text("method").$type<(typeof SESSION_METHODS)[number]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    userAgent: text("user_agent"),
    /** Gerät, zu dem die Sitzung gehört; endet mit dessen Widerruf. */
    deviceId: text("device_id")
      .$type<DeviceId>()
      .references(() => geraete.id, { onDelete: "cascade" }),
  },
  (t) => [
    check("sessions_id_format", matches(t.id, PATTERNS.sessionId)),
    inListCheck("sessions_auth_level_werte", t.authLevel, SESSION_AUTH_LEVELS),
    inListCheck("sessions_method_werte", t.method, SESSION_METHODS),
    check("sessions_user_agent_laenge", sql`char_length(${t.userAgent}) <= 200`),
    check("sessions_ablauf_nach_start", sql`${t.expiresAt} > ${t.createdAt}`),
    index("sessions_expires_at_idx").on(t.expiresAt),
  ],
);

/**
 * Bekannte Geräte: Browser (später auch Apps), in denen sich der Besitzer angemeldet hat. Das
 * Cookie des Geräts steht nur als SHA-256 da (`token_hash`). Ein widerrufenes oder abgelaufenes
 * Gerät gilt nicht mehr; seine Sitzungen enden mit dem Widerruf.
 */
export const geraete = pgTable(
  "geraete",
  {
    id: text("id").$type<DeviceId>().primaryKey(),
    ownerId: text("owner_id")
      .$type<OwnerId>()
      .notNull()
      .references(() => owner.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    kind: text("kind").$type<(typeof DEVICE_KINDS)[number]>().notNull().default("browser"),
    name: text("name"),
    rights: text("rights").$type<(typeof DEVICE_RIGHTS)[number]>().notNull().default("voll"),
    /** Öffentlicher Schlüssel des Geräts; heute immer leer. */
    publicKey: text("public_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [
    idCheck("geraete_id_format", t.id, "device"),
    check("geraete_token_hash_format", matches(t.tokenHash, PATTERNS.sessionId)),
    inListCheck("geraete_kind_werte", t.kind, DEVICE_KINDS),
    inListCheck("geraete_rights_werte", t.rights, DEVICE_RIGHTS),
    check("geraete_name_laenge", sql`char_length(${t.name}) <= 200`),
    check("geraete_public_key_laenge", sql`char_length(${t.publicKey}) <= 2000`),
    check("geraete_ablauf_nach_start", sql`${t.expiresAt} > ${t.createdAt}`),
    index("geraete_owner_id_idx").on(t.ownerId),
  ],
);

/** Zähler für Rate-Limits: je Schlüssel und Zeitfenster eine Zeile. */
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.key, t.windowStart] }),
    check("rate_limits_key_format", matches(t.key, "^[a-z][a-z_]*:.+$")),
    check("rate_limits_key_laenge", sql`char_length(${t.key}) <= 200`),
    check("rate_limits_count_nicht_negativ", sql`${t.count} >= 0`),
  ],
);

export type Owner = typeof owner.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type RateLimit = typeof rateLimits.$inferSelect;
export type Geraet = typeof geraete.$inferSelect;
