/**
 * PaiBot – Typen des Tors aus den gemeinsamen Verträgen, hier nur weitergereicht.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

export {
  ACTION_TYPES,
  ACTIONS,
  type ActionRequest,
  type ActionTarget,
  type ActionType,
  type Actor,
  type ActorKind,
  actionRequestSchema,
  actorKind,
  type Facts,
  factsSchema,
} from "@paibot/shared/aktionen";
export {
  ACTOR_FACT,
  CONDITION_OPS,
  type ConditionOp,
  type Decision,
  decisionSchema,
  type GatePermit,
  LIMIT_IDS,
  LIMIT_NAMES,
  LIMIT_RESULTS,
  LIMITS_BY_ID,
  type LimitCheck,
  type LimitId,
  type LimitName,
  type LimitResult,
  limitCheckSchema,
  OUTCOMES,
  type Outcome,
  RULE_EFFECTS,
  RULE_SOURCES,
  type Rule,
  type RuleCondition,
  type RuleDefinition,
  type RuleEffect,
  type RuleId,
  type RuleRef,
  type RuleSource,
  ruleDefinitionSchema,
  ruleSchema,
  type Scalar,
  STAGES,
  STANDARD_RULE_IDS,
  STANDARD_RULES,
  type Stage,
  type StandardRuleId,
} from "@paibot/shared/tor";
