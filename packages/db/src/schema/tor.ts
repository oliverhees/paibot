/**
 * PaiBot – Datenbankschema: Regeln des Tors, Schlüssel der Installation und das Beleg-Protokoll.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import {
  type ActionId,
  type ConversationId,
  FALLBACK_PRIORITY,
  type KeyId,
  type ReceiptBody,
  type ReceiptId,
  type RuleCondition,
  STANDARD_PRIORITY_MAX,
  ZERO_PREV,
} from "@paibot/shared";
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
import {
  idCheck,
  inListCheck,
  matches,
  optionalIdCheck,
  PATTERNS,
  pgTable,
  valueList,
} from "./helfer";
import { RECEIPT_TYPES, RULE_EFFECTS, RULE_SOURCES, STAGES, STORED_ACTION_TYPES } from "./werte";

/**
 * Regeln des Tors, nur anhängen: Zeilen lassen sich weder ändern noch löschen (Trigger). Jede
 * Änderung, auch Ein- und Ausschalten, ist eine neue Zeile mit höherer `version`; gültig ist je
 * Regel die höchste Fassung. `seq` nummeriert alle Zeilen in der Reihenfolge des Einfügens; die
 * höchste Nummer ist der Regelstand, mit dem das Tor entschieden hat.
 */
export const rules = pgTable(
  "rules",
  {
    seq: bigint("seq", { mode: "number" }).notNull().generatedAlwaysAsIdentity(),
    id: text("id").notNull(),
    version: integer("version").notNull(),
    action: text("action").notNull(),
    effect: text("effect").$type<(typeof RULE_EFFECTS)[number]>().notNull(),
    stage: text("stage").$type<(typeof STAGES)[number]>().notNull(),
    conditions: jsonb("conditions").$type<RuleCondition[]>().notNull().default(sql`'[]'::jsonb`),
    priority: integer("priority").notNull(),
    source: text("source").$type<(typeof RULE_SOURCES)[number]>().notNull(),
    enabled: boolean("enabled").notNull().default(true),
    title: text("title").notNull(),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.id, t.version] }),
    check("rules_id_format", matches(t.id, PATTERNS.ruleId)),
    check("rules_version_positiv", sql`${t.version} >= 1`),
    check("rules_action_werte", sql`${t.action} in ('*', ${valueList(STORED_ACTION_TYPES)})`),
    inListCheck("rules_effect_werte", t.effect, RULE_EFFECTS),
    inListCheck("rules_stage_werte", t.stage, STAGES),
    inListCheck("rules_source_werte", t.source, RULE_SOURCES),
    check("rules_conditions_liste", sql`jsonb_typeof(${t.conditions}) = 'array'`),
    check("rules_priority_bereich", sql`${t.priority} between 0 and 1000000`),
    check("rules_title_laenge", sql`char_length(${t.title}) between 1 and 200`),
    check("rules_reason_laenge", sql`char_length(${t.reason}) between 1 and 500`),
    index("rules_aktiv_priority_idx").on(t.enabled, t.priority),
    unique("rules_seq_eindeutig").on(t.seq),
    check("rules_seq_ab_eins", sql`${t.seq} >= 1`),
    check(
      "rules_kennung_passt_zur_quelle",
      sql`(${matches(t.id, PATTERNS.standardRuleId)}) = (${t.source} = 'standard')`,
    ),
    check("rules_vorschlag_nie_aktiv", sql`${t.source} <> 'proposal' or ${t.enabled} = false`),
    check("rules_eigene_nur_aus", sql`${t.source} = 'standard' or ${t.enabled} = false`),
    check(
      "rules_prioritaet_je_quelle",
      sql`(${t.source} = 'standard') = (${t.priority} <= ${sql.raw(String(STANDARD_PRIORITY_MAX))} or ${t.priority} = ${sql.raw(String(FALLBACK_PRIORITY))})`,
    ),
  ],
);

/** Signaturschlüssel der Installation. Der private Teil liegt nur verschlüsselt in der Datenbank. */
export const installationKeys = pgTable(
  "installation_keys",
  {
    id: text("id").$type<KeyId>().primaryKey(),
    purpose: text("purpose").notNull(),
    publicKey: text("public_key").notNull(),
    privateKeyEnc: text("private_key_enc").notNull(),
    fingerprint: text("fingerprint").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    retiredAt: timestamp("retired_at", { withTimezone: true }),
  },
  (t) => [
    idCheck("installation_keys_id_format", t.id, "key"),
    inListCheck("installation_keys_purpose_werte", t.purpose, ["receipts"]),
    check("installation_keys_public_key_format", matches(t.publicKey, PATTERNS.publicKey)),
    check("installation_keys_private_key_format", matches(t.privateKeyEnc, PATTERNS.encrypted)),
    check("installation_keys_fingerprint_format", matches(t.fingerprint, PATTERNS.fingerprint)),
    unique("installation_keys_public_key_eindeutig").on(t.publicKey),
    uniqueIndex("installation_keys_ein_aktiver_schluessel")
      .on(t.purpose)
      .where(sql`${t.retiredAt} is null`),
  ],
);

/**
 * Beleg-Protokoll: nur anhängen, verkettet über `prev_hash` und `hash`. Updates und Löschen weist
 * ein Trigger ab. Konversationen hängen nicht per Fremdschlüssel daran, die ID steht nur als Text.
 */
export const belege = pgTable(
  "belege",
  {
    seq: bigint("seq", { mode: "number" }).primaryKey(),
    id: text("id").$type<ReceiptId>().notNull(),
    entryType: text("entry_type").$type<(typeof RECEIPT_TYPES)[number]>().notNull(),
    actionId: text("action_id").$type<ActionId>(),
    action: text("action"),
    actor: text("actor"),
    conversationId: text("conversation_id").$type<ConversationId>(),
    body: jsonb("body").$type<ReceiptBody>().notNull(),
    prevHash: text("prev_hash").notNull(),
    hash: text("hash").notNull(),
    keyId: text("key_id")
      .$type<KeyId>()
      .notNull()
      .references(() => installationKeys.id, { onDelete: "restrict" }),
    signature: text("signature").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("belege_seq_ab_eins", sql`${t.seq} >= 1`),
    idCheck("belege_id_format", t.id, "receipt"),
    inListCheck("belege_entry_type_werte", t.entryType, RECEIPT_TYPES),
    optionalIdCheck("belege_action_id_format", t.actionId, "action"),
    check(
      "belege_action_werte",
      sql`${t.action} is null or ${t.action} in (${valueList(STORED_ACTION_TYPES)})`,
    ),
    check("belege_actor_format", sql`${t.actor} is null or ${matches(t.actor, PATTERNS.actor)}`),
    optionalIdCheck("belege_conversation_id_format", t.conversationId, "conversation"),
    check(
      "belege_aktion_nur_bei_entscheidung_und_ergebnis",
      sql`(${t.entryType} in ('decision', 'result')) = (${t.actionId} is not null and ${t.action} is not null and ${t.actor} is not null)`,
    ),
    check("belege_prev_hash_format", matches(t.prevHash, PATTERNS.sha256Digest)),
    check("belege_hash_format", matches(t.hash, PATTERNS.sha256Digest)),
    check("belege_signature_format", matches(t.signature, PATTERNS.signature)),
    check(
      "belege_kettenanfang",
      sql`(${t.seq} = 1) = (${t.prevHash} = ${sql.raw(`'${ZERO_PREV}'`)})`,
    ),
    check("belege_body_objekt", sql`jsonb_typeof(${t.body}) = 'object'`),
    check(
      "belege_body_passt_zur_zeile",
      sql`${t.body}->>'type' = ${t.entryType} and ${t.body}->>'id' = ${t.id} and ${t.body}->>'prev' = ${t.prevHash} and ${t.body}->>'keyId' = ${t.keyId}`,
    ),
    check(
      "belege_spalten_aus_koerper",
      sql`${t.body}->'seq' = to_jsonb(${t.seq}) and ${t.actionId} is not distinct from ${t.body}->'action'->>'actionId' and ${t.action} is not distinct from ${t.body}->'action'->>'type' and ${t.actor} is not distinct from ${t.body}->'action'->>'actor' and ${t.conversationId} is not distinct from ${t.body}->'action'->'target'->>'conversationId'`,
    ),
    unique("belege_id_eindeutig").on(t.id),
    unique("belege_hash_eindeutig").on(t.hash),
    uniqueIndex("belege_prev_hash_eindeutig").on(t.prevHash),
    index("belege_action_id_idx").on(t.actionId),
    uniqueIndex("belege_aktion_einmal")
      .on(t.actionId, t.entryType)
      .where(sql`${t.actionId} is not null`),
    index("belege_conversation_id_idx").on(t.conversationId),
    index("belege_created_at_idx").on(t.createdAt),
  ],
);

export type RuleRow = typeof rules.$inferSelect;
/** @deprecated Heißt jetzt `RuleRow`; `Rule` ist der Typ der Verträge aus `@paibot/shared`. */
export type Rule = RuleRow;
export type InstallationKey = typeof installationKeys.$inferSelect;
export type BelegRow = typeof belege.$inferSelect;
