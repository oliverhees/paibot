/**
 * PaiBot – Datenbankschema: Apps, ihre Werkzeuge und der Zugriff der Bots darauf.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import type { ActionId, AppId, AppToolId, BotId, Sha256Digest, ToolKey } from "@paibot/shared";
import {
  APP_ACCESS_LEVELS,
  APP_AUTH_KINDS,
  APP_TOOL_CLASSES,
  APP_TOOL_STATUSES,
} from "@paibot/shared/tor-fassung-3";
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { idCheck, inListCheck, matches, optionalIdCheck, PATTERNS, pgTable } from "./helfer";

/** Zustände einer App: verbunden oder getrennt (ohne Zugang, ohne Zugriff der Bots). */
export const APP_STATES = ["verbunden", "getrennt"] as const;

/**
 * Apps, die der Besitzer verbunden hat (MCP-Server unter einer https-Adresse). Das Zugangs-Token
 * liegt nur verschlüsselt in `token_enc` (`v2`, gebunden an Kennung und volle Adresse, siehe
 * `appTokenBinding`); beim Trennen wird es gelöscht. `url` steht in der Form von
 * `normalizedAppUrl`. Eine App wird nie gelöscht, nur getrennt: Ihre Werkzeuge und Belege bleiben.
 * `connection_no` zählt die Verbindungen; ein Zugriff gilt nur für die Nummer, unter der er
 * gesetzt wurde. Ändern sich Adresse, Zugang oder Nummer, setzt der Trigger `apps_aenderung`
 * (Migration 0016) alle Werkzeuge der App wieder auf `neu`.
 */
export const apps = pgTable(
  "apps",
  {
    id: text("id").$type<AppId>().primaryKey(),
    /** Kurzname, Teil der Modell-Namen (`<kurzname>__<name>`); nie mit `__`. */
    shortName: text("short_name").notNull(),
    name: text("name").notNull(),
    url: text("url").notNull(),
    authKind: text("auth_kind").$type<(typeof APP_AUTH_KINDS)[number]>().notNull(),
    tokenEnc: text("token_enc"),
    state: text("state").$type<(typeof APP_STATES)[number]>().notNull().default("verbunden"),
    connectionNo: integer("connection_no").notNull().default(1),
    /** Fassung, die der Server meldet; nur zur Anzeige, nie Grundlage einer Entscheidung. */
    serverVersion: text("server_version"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    disconnectedAt: timestamp("disconnected_at", { withTimezone: true }),
  },
  (t) => [
    idCheck("apps_id_format", t.id, "app"),
    check(
      "apps_short_name_format",
      sql`${matches(t.shortName, "^[a-z0-9][a-z0-9_-]{0,63}$")} and position('__' in ${t.shortName}) = 0`,
    ),
    check("apps_name_laenge", sql`char_length(${t.name}) between 1 and 100`),
    check(
      "apps_url_format",
      sql`char_length(${t.url}) <= 2000 and ${matches(t.url, "^[!-~]+$")} and ${matches(t.url, '^https://[^/?#@\\s]+(/[^?#\\s"\\\\]*)?$')} and ${t.url} !~ '/$'`,
    ),
    inListCheck("apps_auth_kind_werte", t.authKind, APP_AUTH_KINDS),
    inListCheck("apps_state_werte", t.state, APP_STATES),
    check(
      "apps_token_format",
      sql`${t.tokenEnc} is null or ${matches(t.tokenEnc, "^v2:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$")}`,
    ),
    check(
      "apps_token_nur_mit_anmeldung",
      sql`${t.tokenEnc} is null or (${t.authKind} = 'token' and ${t.state} = 'verbunden')`,
    ),
    check(
      "apps_token_bei_verbunden",
      sql`${t.authKind} <> 'token' or ${t.state} <> 'verbunden' or ${t.tokenEnc} is not null`,
    ),
    check("apps_connection_no_positiv", sql`${t.connectionNo} >= 1`),
    check(
      "apps_server_version_laenge",
      sql`${t.serverVersion} is null or char_length(${t.serverVersion}) between 1 and 100`,
    ),
    check(
      "apps_getrennt_gesetzt",
      sql`(${t.state} = 'getrennt') = (${t.disconnectedAt} is not null)`,
    ),
    unique("apps_short_name_eindeutig").on(t.shortName),
  ],
);

/**
 * Werkzeuge der Apps, nur anhängen: Jede Zeile ist eine Fassung (`version`, ab 1) eines Werkzeugs
 * (`tool_id`); gültig ist je Werkzeug die höchste. Jede Änderung (neu gesehen, geändert,
 * entfernt, bestätigt, gesperrt, wieder „neu“) ist eine neue Zeile. Kennung, App, Original-Name,
 * Modell-Name und Kennung `tool_key` stehen in Fassung 1 fest und bleiben in allen Fassungen
 * gleich: Der Modell-Name wird einmal vergeben und nie neu berechnet.
 *
 * `tool_digest` ist der Abdruck der Rohform in voller Länge; `description` und `input_schema`
 * sind die bereinigten Texte, die ans Modell gehen. `tool_class` ist die Einstufung durch den
 * Besitzer; vorbelegt ist immer `schreiben`. Eine Zeile mit `bestaetigt` oder `gesperrt` trägt die
 * Kennung der Entscheidung des Besitzers (`action_id`), den gesehenen Abdruck und den Abdruck des
 * Ziels; der Trigger `app_tools_regeln` prüft sie gegen das Beleg-Protokoll.
 */
export const appTools = pgTable(
  "app_tools",
  {
    toolId: text("tool_id").$type<AppToolId>().notNull(),
    version: integer("version").notNull(),
    appId: text("app_id")
      .$type<AppId>()
      .notNull()
      .references(() => apps.id, { onDelete: "restrict" }),
    originalName: text("original_name").notNull(),
    modelName: text("model_name").notNull(),
    toolKey: text("tool_key").$type<ToolKey>().notNull(),
    toolDigest: text("tool_digest").$type<Sha256Digest>().notNull(),
    description: text("description").notNull().default(""),
    inputSchema: jsonb("input_schema").$type<unknown>().notNull(),
    /** Hinweise des Servers, nur zur Anzeige („laut App: nur lesend“); nie eine Einstufung. */
    hintReadOnly: boolean("hint_read_only"),
    hintDestructive: boolean("hint_destructive"),
    status: text("status").$type<(typeof APP_TOOL_STATUSES)[number]>().notNull(),
    toolClass: text("tool_class").$type<(typeof APP_TOOL_CLASSES)[number]>().notNull(),
    /** Entscheidung des Besitzers (`app.werkzeuge_bestaetigen`), nur bei `bestaetigt`/`gesperrt`. */
    actionId: text("action_id").$type<ActionId>(),
    seenDigest: text("seen_digest").$type<Sha256Digest>(),
    targetDigest: text("target_digest").$type<Sha256Digest>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.toolId, t.version] }),
    idCheck("app_tools_tool_id_format", t.toolId, "tool"),
    check("app_tools_version_positiv", sql`${t.version} >= 1`),
    check("app_tools_original_name_laenge", sql`char_length(${t.originalName}) between 1 and 256`),
    check("app_tools_model_name_format", matches(t.modelName, "^[A-Za-z0-9_-]{1,64}$")),
    check(
      "app_tools_tool_key_format",
      sql`char_length(${t.toolKey}) <= 140 and ${matches(t.toolKey, "^mcp(/[a-z0-9][a-z0-9_.-]{0,63}){2}$")}`,
    ),
    check("app_tools_tool_digest_format", matches(t.toolDigest, PATTERNS.sha256Digest)),
    check("app_tools_description_laenge", sql`char_length(${t.description}) <= 2000`),
    check(
      "app_tools_input_schema_objekt",
      sql`jsonb_typeof(${t.inputSchema}) = 'object' and octet_length(${t.inputSchema}::text) <= 65536`,
    ),
    inListCheck("app_tools_status_werte", t.status, APP_TOOL_STATUSES),
    inListCheck("app_tools_tool_class_werte", t.toolClass, APP_TOOL_CLASSES),
    check(
      "app_tools_einstufung_passt_zum_stand",
      sql`(${t.status} in ('neu', 'geaendert', 'entfernt') and ${t.toolClass} = 'schreiben') or (${t.status} = 'bestaetigt' and ${t.toolClass} in ('lesen', 'schreiben')) or (${t.status} = 'gesperrt' and ${t.toolClass} = 'gesperrt')`,
    ),
    check(
      "app_tools_beweis_nur_bei_einstufung",
      sql`(${t.status} in ('bestaetigt', 'gesperrt')) = (${t.actionId} is not null and ${t.seenDigest} is not null and ${t.targetDigest} is not null) and (${t.status} in ('bestaetigt', 'gesperrt') or (${t.actionId} is null and ${t.seenDigest} is null and ${t.targetDigest} is null))`,
    ),
    optionalIdCheck("app_tools_action_id_format", t.actionId, "action"),
    check(
      "app_tools_gesehener_abdruck_format",
      sql`${t.seenDigest} is null or ${matches(t.seenDigest, PATTERNS.sha256Digest)}`,
    ),
    check(
      "app_tools_ziel_abdruck_format",
      sql`${t.targetDigest} is null or ${matches(t.targetDigest, PATTERNS.sha256Digest)}`,
    ),
    // Namen und Kennung sind je Installation (bzw. je App) nur einmal vergeben: in Fassung 1.
    uniqueIndex("app_tools_modell_name_eindeutig").on(t.modelName).where(sql`${t.version} = 1`),
    uniqueIndex("app_tools_kennung_je_app_eindeutig")
      .on(t.appId, t.toolKey)
      .where(sql`${t.version} = 1`),
    uniqueIndex("app_tools_original_name_je_app_eindeutig")
      .on(t.appId, t.originalName)
      .where(sql`${t.version} = 1`),
    uniqueIndex("app_tools_entscheidung_einmal")
      .on(t.actionId)
      .where(sql`${t.actionId} is not null`),
    index("app_tools_app_idx").on(t.appId, t.toolId, t.version),
  ],
);

/**
 * Zugriff eines Bots auf eine App, nur anhängen: Jede Änderung ist eine neue Zeile; gültig ist je
 * Bot und App die letzte (`seq`), und nur, wenn ihre `connection_no` die der App ist. Jede Zeile
 * trägt die Kennung der Entscheidung des Besitzers (`app.zugriff_setzen`); der Trigger
 * `bot_app_grants_regeln` prüft sie gegen das Beleg-Protokoll. Ohne Zeile ist der Zugriff
 * `keiner`. `bot_id` hat bewusst keinen Fremdschlüssel: Ein gelöschter Bot hinterlässt keine
 * Sperre für das Löschen.
 */
export const botAppGrants = pgTable(
  "bot_app_grants",
  {
    seq: bigint("seq", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    appId: text("app_id")
      .$type<AppId>()
      .notNull()
      .references(() => apps.id, { onDelete: "restrict" }),
    botId: text("bot_id").$type<BotId>().notNull(),
    access: text("access").$type<(typeof APP_ACCESS_LEVELS)[number]>().notNull(),
    connectionNo: integer("connection_no").notNull(),
    actionId: text("action_id").$type<ActionId>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    idCheck("bot_app_grants_bot_id_format", t.botId, "bot"),
    idCheck("bot_app_grants_action_id_format", t.actionId, "action"),
    inListCheck("bot_app_grants_access_werte", t.access, APP_ACCESS_LEVELS),
    check("bot_app_grants_connection_no_positiv", sql`${t.connectionNo} >= 1`),
    unique("bot_app_grants_entscheidung_einmal").on(t.actionId),
    index("bot_app_grants_stand_idx").on(t.appId, t.botId, t.seq),
  ],
);

export type AppRow = typeof apps.$inferSelect;
export type AppToolRow = typeof appTools.$inferSelect;
export type BotAppGrantRow = typeof botAppGrants.$inferSelect;
