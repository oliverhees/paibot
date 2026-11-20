/**
 * PaiBot – Typen des Tors: Regeln, Stufen, Grenzen, Entscheidung und die Berechtigung, die das
 * Tor bei Erlaubnis ausstellt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { z } from "zod";
import {
  type ActionTarget,
  type ActionType,
  type Actor,
  actionTypeSchema,
  CREDENTIALS,
  type Facts,
} from "./actions";
import { type IsoTime, isoTimeSchema, positiveIntSchema } from "./grundtypen";
import { type ActionId, idSchema, type ReceiptId } from "./id";

/** Stufen einer Aktion: nachfragen, vorbereiten, ausführen (mit Beleg). */
export const STAGES = ["ask", "prepare", "execute"] as const;
export const stageSchema = z.enum(STAGES);
export type Stage = z.infer<typeof stageSchema>;

/** Wirkung einer Regel. */
export const RULE_EFFECTS = ["allow", "deny", "ask"] as const;
export const ruleEffectSchema = z.enum(RULE_EFFECTS);
export type RuleEffect = z.infer<typeof ruleEffectSchema>;

/** Herkunft einer Regel: fest eingebaut, vom Besitzer angelegt oder vom Bot vorgeschlagen. */
export const RULE_SOURCES = ["standard", "owner", "proposal"] as const;
export const ruleSourceSchema = z.enum(RULE_SOURCES);
export type RuleSource = z.infer<typeof ruleSourceSchema>;

/** Ergebnis des Tors. In der Basis wird `ask` wie `deny` behandelt. */
export const OUTCOMES = ["allow", "deny", "ask", "prepare"] as const;
export const outcomeSchema = z.enum(OUTCOMES);
export type Outcome = z.infer<typeof outcomeSchema>;

/** Lesbare IDs der Standard-Regeln. */
export const STANDARD_RULE_IDS = ["R-001", "R-002", "R-999"] as const;
export type StandardRuleId = (typeof STANDARD_RULE_IDS)[number];

/** ID einer Regel: lesbar (`R-001`) oder erzeugt (`reg_…`). */
export const ruleIdSchema = z.union([z.string().regex(/^R-\d{3}$/), idSchema("rule")]);
export type RuleId = z.infer<typeof ruleIdSchema>;

/** Grenzen, die das Tor zusätzlich zu den Regeln prüft, mit ihrer lesbaren ID. */
export const LIMITS_BY_ID = {
  "G-01": "schleuse_gefordert",
  "G-02": "anbieter_region",
  "G-03": "laenge",
  "G-04": "tagesbudget",
  "G-05": "not_aus",
} as const;
export type LimitId = keyof typeof LIMITS_BY_ID;
export type LimitName = (typeof LIMITS_BY_ID)[LimitId];
export const LIMIT_IDS = Object.keys(LIMITS_BY_ID) as [LimitId, ...LimitId[]];
export const LIMIT_NAMES = Object.values(LIMITS_BY_ID) as [LimitName, ...LimitName[]];
export const limitNameSchema = z.enum(LIMIT_NAMES);

/** Ergebnis einer Grenze: eingehalten, verletzt oder für diese Aktion nicht zutreffend. */
export const LIMIT_RESULTS = ["ok", "verletzt", "entfaellt"] as const;
export const limitResultSchema = z.enum(LIMIT_RESULTS);
export type LimitResult = z.infer<typeof limitResultSchema>;

/** Einzelner Wert in Fakten und Bedingungen: Text, Ganzzahl oder Schalter. */
export const scalarSchema = z.union([z.string().max(200), z.number().int(), z.boolean()]);
export type Scalar = z.infer<typeof scalarSchema>;

export const limitCheckSchema = z.strictObject({
  name: limitNameSchema,
  result: limitResultSchema,
  value: scalarSchema.optional(),
});
export type LimitCheck = z.infer<typeof limitCheckSchema>;

export const ruleRefSchema = z.strictObject({ id: ruleIdSchema, version: positiveIntSchema });
export type RuleRef = z.infer<typeof ruleRefSchema>;

/**
 * Name des Fakts, unter dem das Tor die Art des Akteurs (`besitzer` oder `bot`) für Bedingungen
 * bereitstellt. Alle anderen Namen sind Felder der Fakten der Aktion.
 */
export const ACTOR_FACT = "akteur";

/** Vergleich in einer Bedingung. `in` erwartet eine Liste, die anderen einen einzelnen Wert. */
export const CONDITION_OPS = ["eq", "ne", "lt", "lte", "gt", "gte", "in"] as const;
export const conditionOpSchema = z.enum(CONDITION_OPS);
export type ConditionOp = z.infer<typeof conditionOpSchema>;

const factNameSchema = z.string().regex(/^[a-z][A-Za-z0-9]*$/);

/** Bedingung einer Regel: ein Fakt wird mit einem Wert oder einem anderen Fakt verglichen. */
export const ruleConditionSchema = z
  .strictObject({
    fact: factNameSchema,
    op: conditionOpSchema,
    value: z.union([
      scalarSchema,
      z.array(z.union([z.string().max(200), z.number().int()])).min(1),
      z.strictObject({ fact: factNameSchema }),
    ]),
  })
  .refine((condition) => (condition.op === "in") === Array.isArray(condition.value), {
    path: ["value"],
  });
export type RuleCondition = z.infer<typeof ruleConditionSchema>;

/** Inhalt einer Regel. Eine Regel greift, wenn die Aktion passt und alle Bedingungen gelten. */
export const ruleDefinitionSchema = z.strictObject({
  id: ruleIdSchema,
  version: positiveIntSchema,
  /** Aktion oder `*` für alle Aktionen. */
  action: z.union([actionTypeSchema, z.literal("*")]),
  effect: ruleEffectSchema,
  stage: stageSchema,
  conditions: z.array(ruleConditionSchema).max(20),
  /** Kleinere Zahl wird zuerst geprüft; die erste passende Regel entscheidet. */
  priority: z.number().int().min(0).max(1000000),
  source: ruleSourceSchema,
  enabled: z.boolean(),
  title: z.string().min(1).max(200),
  reason: z.string().min(1).max(500),
});
export type RuleDefinition = z.infer<typeof ruleDefinitionSchema>;

/** Gespeicherte Fassung einer Regel. Jede Änderung ist eine neue Fassung. */
export const ruleSchema = ruleDefinitionSchema.extend({ createdAt: isoTimeSchema });
export type Rule = z.infer<typeof ruleSchema>;

/** Die festen Regeln der Basis. Sie sind nur lesbar. */
export const STANDARD_RULES = [
  {
    id: "R-001",
    version: 1,
    action: "*",
    effect: "allow",
    stage: "execute",
    conditions: [
      { fact: ACTOR_FACT, op: "eq", value: "besitzer" },
      { fact: "credential", op: "in", value: [...CREDENTIALS] },
    ],
    priority: 100,
    source: "standard",
    enabled: true,
    title: "Besitzer verwaltet seine Installation",
    reason: "Der Besitzer hat sich ausgewiesen und verwaltet seine eigene Installation.",
  },
  {
    id: "R-002",
    version: 1,
    action: "modell.anfragen",
    effect: "allow",
    stage: "execute",
    conditions: [
      { fact: ACTOR_FACT, op: "eq", value: "bot" },
      { fact: "botOfConversation", op: "eq", value: true },
    ],
    priority: 100,
    source: "standard",
    enabled: true,
    title: "Bot darf antworten",
    reason:
      "Der Bot der Unterhaltung darf ein Modell anfragen, wenn alle Grenzen eingehalten sind.",
  },
  {
    id: "R-999",
    version: 1,
    action: "*",
    effect: "ask",
    stage: "ask",
    conditions: [],
    priority: 1000000,
    source: "standard",
    enabled: true,
    title: "Ohne passende Regel",
    reason: "Dafür gibt es noch keine Regel.",
  },
] as const satisfies readonly RuleDefinition[];

/** Entscheidung des Tors für eine Aktion. */
export const decisionSchema = z.strictObject({
  outcome: outcomeSchema,
  stage: stageSchema,
  matchedRules: z.array(ruleRefSchema),
  limits: z.array(limitCheckSchema),
  /** Deutscher Satz, warum das Tor so entschieden hat. */
  reason: z.string().min(1).max(500),
});
export type Decision = z.infer<typeof decisionSchema>;

declare const permitBrand: unique symbol;

/**
 * Berechtigung für eine erlaubte Aktion. Nur das Tor stellt sie aus, nachdem der Beleg
 * „Entscheidung“ geschrieben ist; die Anbieter-Schicht gibt ein Modell nur gegen sie heraus.
 */
export type GatePermit<T extends ActionType = ActionType> = T extends ActionType
  ? {
      readonly actionId: ActionId;
      readonly action: T;
      readonly actor: Actor;
      readonly target: ActionTarget<T>;
      readonly facts: Facts<T>;
      readonly decisionReceiptId: ReceiptId;
      readonly issuedAt: IsoTime;
      readonly [permitBrand]: true;
    }
  : never;
