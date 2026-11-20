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
import { t } from "@paibot/shared/texte";
import {
  ACTOR_FACT,
  type Decision,
  LIMITS_BY_ID,
  type LimitCheck,
  type LimitId,
  type LimitName,
  type Outcome,
  type RuleCondition,
  type RuleDefinition,
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

/** Alle Grenzen als „entfällt“, wenn die Eingabe gar nicht zu einer Aktion passt. */
function limitsNotApplicable(): LimitCheck[] {
  return LIMIT_ORDER.map((name) => ({ name, result: "entfaellt" }));
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

/**
 * Entscheidet über eine Aktion. Rein: kein I/O, keine Uhrzeit, kein Zufall; gleiche Eingaben
 * ergeben immer dieselbe Entscheidung. Damit lässt sich jede Entscheidung aus einem Beleg
 * nachrechnen.
 *
 * Ablauf:
 * 1. Kandidaten sind Regeln mit `enabled: true`, deren `action` gleich `action.type` oder `*` ist
 *    und deren Bedingungen alle gelten (`ruleApplies`).
 * 2. Kandidaten werden nach `priority` aufsteigend sortiert, bei Gleichstand nach `id` und
 *    `version`; die erste Regel entscheidet und steht allein in `matchedRules`.
 * 3. Aus der Regel folgt das Ergebnis: `deny` → `deny`; `ask` → `ask`; `allow` mit Stufe
 *    `execute` → `allow`, mit Stufe `prepare` → `prepare`, mit Stufe `ask` → `ask`.
 * 4. Alle Grenzen werden geprüft (`checkLimits`) und stehen vollständig in `limits`. Ist eine
 *    Grenze `verletzt`, lautet das Ergebnis `deny`; `reason` nennt dann die Grenze.
 * 5. Passt keine Regel, lautet das Ergebnis `ask` mit Stufe `ask`, leeren `matchedRules` und
 *    `NO_RULE_REASON`.
 *
 * Erwartet geprüfte Eingaben (Aktion und Fakten passend zu `ACTIONS`); `gate.run` prüft sie vorher.
 *
 * Ergänzend gilt, damit das Tor auch bei falschen Eingaben nichts durchlässt:
 * - Passt die Eingabe nicht zu den Verträgen (z. B. unbekannte Aktion, Akteur passt nicht zur
 *   Aktion, Fakten falsch), lautet das Ergebnis `deny` mit Stufe `ask`, leeren `matchedRules`
 *   und allen Grenzen als `entfaellt`.
 * - Eine verletzte Grenze geht immer vor, auch wenn keine Regel passt (Stufe dann `ask`).
 * - Die Stufe ist sonst die Stufe der entscheidenden Regel.
 */
export function evaluate<T extends ActionType>(
  action: ActionRequest<T>,
  facts: Facts<T>,
  rules: readonly RuleDefinition[],
): Decision {
  if (!isValidInput(action, facts)) {
    return {
      outcome: "deny",
      stage: "ask",
      matchedRules: [],
      limits: limitsNotApplicable(),
      reason: `${t("fehler.abgelehnt")} ${t("fehler.eingabe_ungueltig")}`,
    };
  }

  const candidates = rules.filter((rule) => ruleApplies(rule, action, facts));
  const winner = [...candidates].sort(compareRules)[0];
  const limits = checkLimits(action as ActionRequest, facts as Facts);
  const violated = limits.filter((check) => check.result === "verletzt");
  const stage: Stage = winner ? winner.stage : "ask";
  const matchedRules = winner ? [{ id: winner.id, version: winner.version }] : [];

  if (violated.length > 0) {
    return { outcome: "deny", stage, matchedRules, limits, reason: limitReason(violated) };
  }
  if (!winner) {
    return { outcome: "ask", stage: "ask", matchedRules: [], limits, reason: NO_RULE_REASON };
  }
  return { outcome: outcomeOf(winner), stage, matchedRules, limits, reason: winner.reason };
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
  const context: Record<string, unknown> = {
    ...(facts as Record<string, unknown>),
    [ACTOR_FACT]: actorKind(action.actor),
  };
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
