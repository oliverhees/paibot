/**
 * PaiBot – die Entscheidung des Tors: reine, deterministische Prüfung von Regeln und Grenzen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { ActionRequest, ActionType, Facts } from "@paibot/shared/aktionen";
import type { Decision, Outcome, RuleCondition, RuleDefinition } from "@paibot/shared/tor";
import { notImplemented } from "@paibot/stub";

/** Fehlercode, mit dem eine nicht erlaubte Aktion gemeldet wird. */
export const OUTCOME_ERROR_CODE = {
  deny: "abgelehnt",
  ask: "regel_fehlt",
  prepare: "regel_fehlt",
} as const satisfies Record<Exclude<Outcome, "allow">, "abgelehnt" | "regel_fehlt">;

/** Begründung, wenn keine einzige Regel passt. */
export const NO_RULE_REASON = "Dafür gibt es noch keine Regel.";

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
 */
export function evaluate<T extends ActionType>(
  action: ActionRequest<T>,
  facts: Facts<T>,
  rules: readonly RuleDefinition[],
): Decision {
  return notImplemented("gate.evaluate", action, facts, rules);
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
  return notImplemented("gate.ruleApplies", rule, action, facts);
}

/**
 * Prüft eine Bedingung gegen die Fakten. `ACTOR_FACT` (`akteur`) liefert die Art des Akteurs
 * (`besitzer` oder `bot`); alle anderen Namen sind Felder der Fakten. `value: { fact }` vergleicht
 * mit einem anderen Fakt. Fehlt ein Fakt, gilt die Bedingung nicht. `lt`/`lte`/`gt`/`gte`
 * vergleichen nur Zahlen mit Zahlen, sonst gilt die Bedingung nicht.
 */
export function conditionHolds(
  condition: RuleCondition,
  facts: Readonly<Record<string, unknown>>,
): boolean {
  return notImplemented("gate.conditionHolds", condition, facts);
}
