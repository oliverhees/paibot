/**
 * PaiBot – die Entscheidung des Tors: reine, deterministische Prüfung von Regeln und Grenzen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import {
  ACTIONS,
  type ActionRequest,
  type ActionType,
  actionRequestSchema,
  actorKind,
  type Facts,
} from "@paibot/shared/aktionen";
import type { ErrorCode } from "@paibot/shared/fehler";
import type { Sha256Digest } from "@paibot/shared/grundtypen";
import { t } from "@paibot/shared/texte";
import {
  ACTOR_FACT,
  type Decision,
  LIMITS_BY_ID,
  type LimitCheck,
  type LimitId,
  type LimitName,
  type Outcome,
  PRECONDITIONS,
  type PreconditionCheck,
  type PreconditionId,
  type PreconditionName,
  preconditionsFor,
  type RuleCondition,
  type RuleDefinition,
  type RuleRef,
  type RuleSnapshot,
  type Stage,
} from "@paibot/shared/tor";
import { checkLimits, LIMIT_ORDER } from "./limits/index";

/** Fehlercode, mit dem eine nicht erlaubte Aktion gemeldet wird. */
export const OUTCOME_ERROR_CODE = {
  deny: "abgelehnt",
  ask: "regel_fehlt",
  prepare: "regel_fehlt",
} as const satisfies Record<Exclude<Outcome, "allow">, "abgelehnt" | "regel_fehlt">;

/** Begründung, wenn keine einzige Regel passt. */
export const NO_RULE_REASON = t("fehler.regel_fehlt");

const LIMIT_ID_BY_NAME = Object.fromEntries(
  Object.entries(LIMITS_BY_ID).map(([id, name]) => [name, id]),
) as Record<LimitName, LimitId>;

const PRECONDITION_ID_BY_NAME = Object.fromEntries(
  Object.entries(PRECONDITIONS).map(([id, { name }]) => [name, id]),
) as Record<PreconditionName, PreconditionId>;

/** Alle Grenzen als „entfällt“, wenn die Eingabe gar nicht zu einer Aktion passt. */
function limitsNotApplicable(): LimitCheck[] {
  return LIMIT_ORDER.map((name) => ({ name, result: "entfaellt" }));
}

/** Vorbedingungen einer Aktion als „entfällt“ (bei ungültiger Eingabe); unbekannte Aktion → `[]`. */
function preconditionsNotApplicable(type: unknown): PreconditionCheck[] {
  if (typeof type !== "string" || !Object.hasOwn(ACTIONS, type)) return [];
  return preconditionsFor(type as ActionType).map((id) => ({
    name: PRECONDITIONS[id].name,
    result: "entfaellt",
  }));
}

/** Bedingungen über die Fakten mit dem Akteur aus der Aktion (wie bei Regeln). */
function factContext(action: ActionRequest, facts: Facts): Record<string, unknown> {
  return { ...(facts as Record<string, unknown>), [ACTOR_FACT]: actorKind(action.actor) };
}

/**
 * Prüft die Vorbedingungen der Aktion (`preconditionsFor`, nach ID) gegen die Fakten. Rein.
 * - `when` gilt nicht → `entfaellt`;
 * - alle Bedingungen in `require` gelten → `ok`, sonst `verletzt`. Fehlt ein Fakt, gilt die
 *   Bedingung nicht, die Vorbedingung ist also verletzt.
 * Aktionen ohne Vorbedingungen ergeben `[]`.
 */
export function checkPreconditions<T extends ActionType>(
  action: ActionRequest<T>,
  facts: Facts<T>,
): PreconditionCheck[] {
  const context = factContext(action as ActionRequest, facts as Facts);
  return preconditionsFor(action.type).map((id) => {
    const precondition: {
      name: PreconditionName;
      when?: readonly RuleCondition[];
      require: readonly RuleCondition[];
    } = PRECONDITIONS[id];
    const name = precondition.name;
    const when = precondition.when ?? [];
    if (!when.every((condition) => conditionHolds(condition, context))) {
      return { name, result: "entfaellt" };
    }
    const ok = precondition.require.every((condition) => conditionHolds(condition, context));
    return { name, result: ok ? "ok" : "verletzt" };
  });
}

/** Kennung einer Vorbedingung zu ihrem Namen. */
export function preconditionId(name: PreconditionName): PreconditionId {
  return PRECONDITION_ID_BY_NAME[name];
}

/**
 * Fehlercode, mit dem eine nicht erlaubte Entscheidung gemeldet wird: bei einer verletzten
 * Vorbedingung deren `errorCode` (die erste nach ID), sonst `OUTCOME_ERROR_CODE`.
 */
export function denialCode(decision: Decision): ErrorCode {
  const violated = (decision.preconditions ?? []).find((check) => check.result === "verletzt");
  if (violated !== undefined) return PRECONDITIONS[preconditionId(violated.name)].errorCode;
  return OUTCOME_ERROR_CODE[decision.outcome === "allow" ? "deny" : decision.outcome];
}

/** Ist die Eingabe eine gültige Aktion mit passenden Fakten? */
function isValidInput(action: unknown, facts: unknown): boolean {
  if (!actionRequestSchema.safeParse(action).success) return false;
  const type = (action as { type: ActionType }).type;
  return ACTIONS[type].facts.safeParse(facts).success;
}

/** Vergleicht zwei Regeln: Priorität aufsteigend, dann ID, dann Fassung. */
function compareRules(a: RuleDefinition, b: RuleDefinition): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  if (a.id !== b.id) return a.id < b.id ? -1 : 1;
  return a.version - b.version;
}

function outcomeOf(rule: RuleDefinition): Outcome {
  if (rule.effect === "deny") return "deny";
  if (rule.effect === "ask") return "ask";
  if (rule.stage === "execute") return "allow";
  return rule.stage === "prepare" ? "prepare" : "ask";
}

function limitReason(violated: readonly LimitCheck[]): string {
  const names = violated.map((check) => {
    const id = LIMIT_ID_BY_NAME[check.name];
    return t("tor.grenze", { id, name: t(`regel.${id}`) });
  });
  return t("tor.grenze_verletzt", { grenzen: names.join(", ") }).slice(0, 500);
}

function preconditionReason(violated: readonly PreconditionCheck[]): string {
  const names = violated.map((check) => {
    const id = preconditionId(check.name);
    return t("tor.grenze", { id, name: t(`regel.${id}`) });
  });
  return t("tor.vorbedingung_verletzt", { vorbedingungen: names.join(", ") }).slice(0, 500);
}

function invalidInputReason(): string {
  return `${t("fehler.abgelehnt")} ${t("fehler.eingabe_ungueltig")}`;
}

/** Regel, wie `evaluate` sie annimmt: mit oder ohne Prüfsumme und Nummer im Regel-Protokoll. */
export type EvaluatedRule = RuleDefinition & { readonly hash?: Sha256Digest };

function isSnapshot(rules: readonly EvaluatedRule[] | RuleSnapshot): rules is RuleSnapshot {
  return !Array.isArray(rules);
}

function ruleRef(rule: EvaluatedRule): RuleRef {
  const ref: RuleRef = { id: rule.id, version: rule.version };
  if (typeof rule.hash === "string") ref.hash = rule.hash;
  return ref;
}

/**
 * Entscheidet über eine Aktion. Rein: kein I/O, keine Uhrzeit, kein Zufall; gleiche Eingaben
 * ergeben immer dieselbe Entscheidung. Damit lässt sich jede Entscheidung aus einem Beleg
 * nachrechnen: mit den Fakten und den Regeln zum damaligen Regelstand.
 *
 * `rules` ist der Regelstand (`RuleSnapshot`: Regeln mit Prüfsumme und Stand) oder eine einfache
 * Liste von Regeln. Mit Regelstand trägt die Entscheidung `ruleStand` und je angewandter Regel die
 * Prüfsumme `hash`; ohne Regelstand fehlt `ruleStand`, und `hash` steht nur bei Regeln, die ihn
 * mitbringen.
 *
 * Reihenfolge:
 * 1. Eingabe prüfen. Passt sie nicht zu den Verträgen (unbekannte Aktion, Akteur passt nicht zur
 *    Aktion, Fakten falsch), lautet das Ergebnis `deny` mit Stufe `ask`, leeren `matchedRules`,
 *    allen Grenzen und Vorbedingungen als `entfaellt`.
 * 2. Vorbedingungen (`checkPreconditions`). Alle Vorbedingungen der Aktion stehen in
 *    `preconditions`; ist eine verletzt, lautet das Ergebnis `deny`, `reason` nennt sie. Das geht
 *    einer verletzten Grenze vor.
 * 3. Grenzen (`checkLimits`), alle in `limits`. Ist eine `verletzt`, lautet das Ergebnis `deny`;
 *    `reason` nennt die Grenze.
 * 4. Regeln: Kandidaten sind Regeln mit `enabled: true`, deren `action` gleich `action.type` oder
 *    `*` ist und deren Bedingungen alle gelten (`ruleApplies`); sortiert nach `priority`
 *    aufsteigend, bei Gleichstand nach `id` und `version`. Die erste entscheidet und steht allein in
 *    `matchedRules`: `deny` → `deny`; `ask` → `ask`; `allow` mit Stufe `execute` → `allow`, mit
 *    `prepare` → `prepare`, mit `ask` → `ask`. Passt keine Regel: `ask` mit Stufe `ask`, leeren
 *    `matchedRules` und `NO_RULE_REASON`.
 *
 * Die Stufe ist die Stufe der entscheidenden Regel, ohne Regel `ask`; auch bei einer verletzten
 * Vorbedingung oder Grenze bleibt die Regel, die sonst entschieden hätte, sichtbar.
 */
export function evaluate<T extends ActionType>(
  action: ActionRequest<T>,
  facts: Facts<T>,
  rules: readonly EvaluatedRule[] | RuleSnapshot,
): Decision {
  const snapshot = isSnapshot(rules) ? rules : undefined;
  const ruleList: readonly EvaluatedRule[] = snapshot ? snapshot.rules : (rules as EvaluatedRule[]);
  const stand = snapshot === undefined ? {} : { ruleStand: snapshot.stand };

  if (!isValidInput(action, facts)) {
    return {
      outcome: "deny",
      stage: "ask",
      matchedRules: [],
      limits: limitsNotApplicable(),
      preconditions: preconditionsNotApplicable((action as { type?: unknown } | null)?.type),
      ...stand,
      reason: invalidInputReason(),
    };
  }

  const preconditions = checkPreconditions(action, facts);
  const limits = checkLimits(action as ActionRequest, facts as Facts);
  const candidates = ruleList.filter((rule) => ruleApplies(rule, action, facts));
  const winner = [...candidates].sort(compareRules)[0];
  const stage: Stage = winner ? winner.stage : "ask";
  const matchedRules = winner ? [ruleRef(winner)] : [];
  const base = { stage, matchedRules, limits, preconditions, ...stand };

  const violatedPreconditions = preconditions.filter((check) => check.result === "verletzt");
  if (violatedPreconditions.length > 0) {
    return { outcome: "deny", ...base, reason: preconditionReason(violatedPreconditions) };
  }
  const violated = limits.filter((check) => check.result === "verletzt");
  if (violated.length > 0) {
    return { outcome: "deny", ...base, reason: limitReason(violated) };
  }
  if (!winner) {
    return { outcome: "ask", ...base, stage: "ask", reason: NO_RULE_REASON };
  }
  return { outcome: outcomeOf(winner), ...base, reason: winner.reason };
}

/**
 * Gilt eine Regel für diese Aktion? Prüft `enabled`, die Aktion (`*` passt immer) und alle
 * Bedingungen. Eine Regel ohne Bedingungen passt auf jede passende Aktion.
 */
export function ruleApplies<T extends ActionType>(
  rule: RuleDefinition,
  action: ActionRequest<T>,
  facts: Facts<T>,
): boolean {
  if (rule.enabled !== true) return false;
  if (rule.action !== "*" && rule.action !== action.type) return false;
  // Die Art des Akteurs kommt aus der Aktion und lässt sich über die Fakten nicht überschreiben.
  const context = factContext(action as ActionRequest, facts as Facts);
  return rule.conditions.every((condition) => conditionHolds(condition, context));
}

type Comparable = string | number | boolean;

function isComparable(value: unknown): value is Comparable {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function factValue(facts: Readonly<Record<string, unknown>>, name: string): unknown {
  return Object.hasOwn(facts, name) ? facts[name] : undefined;
}

/**
 * Prüft eine Bedingung gegen die Fakten. `ACTOR_FACT` (`akteur`) liefert die Art des Akteurs
 * (`besitzer` oder `bot`); alle anderen Namen sind Felder der Fakten. `value: { fact }` vergleicht
 * mit einem anderen Fakt. Fehlt ein Fakt, gilt die Bedingung nicht. `lt`/`lte`/`gt`/`gte`
 * vergleichen nur Zahlen mit Zahlen, sonst gilt die Bedingung nicht.
 *
 * Verglichen werden nur einzelne Werte (Text, Zahl, Schalter); ein Fakt mit einer Liste erfüllt
 * keine Bedingung.
 */
export function conditionHolds(
  condition: RuleCondition,
  facts: Readonly<Record<string, unknown>>,
): boolean {
  const left = factValue(facts, condition.fact);
  if (!isComparable(left)) return false;

  const raw = condition.value;
  if (condition.op === "in") {
    return Array.isArray(raw) && raw.some((item) => item === left);
  }
  if (Array.isArray(raw)) return false;

  let right: unknown = raw;
  if (typeof raw === "object" && raw !== null) {
    right = factValue(facts, raw.fact);
  }
  if (!isComparable(right)) return false;

  switch (condition.op) {
    case "eq":
      return left === right;
    case "ne":
      return left !== right;
    case "lt":
    case "lte":
    case "gt":
    case "gte":
      if (typeof left !== "number" || typeof right !== "number") return false;
      if (condition.op === "lt") return left < right;
      if (condition.op === "lte") return left <= right;
      if (condition.op === "gt") return left > right;
      return left >= right;
    default:
      return false;
  }
}
