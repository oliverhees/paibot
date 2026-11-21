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
import type { ErrorCode } from "@paibot/shared/fehler";
import { t } from "@paibot/shared/texte";
import {
  type Decision,
  GATE_FORMAT,
  type ListDecision,
  type Outcome,
  PRECONDITIONS,
  type PreconditionCheck,
  type PreconditionId,
  type PreconditionName,
  type RuleCondition,
  type RuleDefinition,
  type RuleSnapshot,
} from "@paibot/shared/tor";
import { currentGateFormat, type EvaluatedRule, gateFormatSpec } from "./fassungen/index";

export type { EvaluatedRule } from "./fassungen/index";

/** Fehlercode, mit dem eine nicht erlaubte Aktion gemeldet wird. */
export const OUTCOME_ERROR_CODE = {
  deny: "abgelehnt",
  ask: "regel_fehlt",
  prepare: "regel_fehlt",
} as const satisfies Record<Exclude<Outcome, "allow">, "abgelehnt" | "regel_fehlt">;

/** Begründung, wenn keine einzige Regel passt. */
export const NO_RULE_REASON = t("fehler.regel_fehlt");

const PRECONDITION_ID_BY_NAME = Object.fromEntries(
  Object.entries(PRECONDITIONS).map(([id, { name }]) => [name, id]),
) as Record<PreconditionName, PreconditionId>;

/**
 * Prüft die Vorbedingungen der Aktion (`preconditionsFor`, nach ID) gegen die Fakten, mit der
 * aktuellen Fassung (`GATE_FORMAT`). Rein.
 * - `when` gilt nicht → `entfaellt`;
 * - alle Bedingungen in `require` gelten → `ok`, sonst `verletzt`. Fehlt ein Fakt, gilt die
 *   Bedingung nicht, die Vorbedingung ist also verletzt.
 * Aktionen ohne Vorbedingungen ergeben `[]`.
 */
export function checkPreconditions<T extends ActionType>(
  action: ActionRequest<T>,
  facts: Facts<T>,
): PreconditionCheck[] {
  return currentGateFormat().checkPreconditions(action, facts);
}

/** Kennung einer Vorbedingung zu ihrem Namen. */
export function preconditionId(name: PreconditionName): PreconditionId {
  return PRECONDITION_ID_BY_NAME[name];
}

/**
 * Fehlercode, mit dem eine nicht erlaubte Entscheidung gemeldet wird: bei einer verletzten
 * Vorbedingung deren `errorCode` (die erste nach ID), bei verletztem Not-Aus (G-05) `angehalten`,
 * sonst `OUTCOME_ERROR_CODE`.
 */
export function denialCode(
  decision: Pick<Decision, "outcome" | "preconditions"> & { limits?: Decision["limits"] },
): ErrorCode {
  const violated = (decision.preconditions ?? []).find((check) => check.result === "verletzt");
  if (violated !== undefined) return PRECONDITIONS[preconditionId(violated.name)].errorCode;
  const notAus = (decision.limits ?? []).some(
    (check) => check.name === "not_aus" && check.result === "verletzt",
  );
  if (notAus) return "angehalten";
  return OUTCOME_ERROR_CODE[decision.outcome === "allow" ? "deny" : decision.outcome];
}

/** Optionen für `evaluate`. */
export interface EvaluateOptions {
  /**
   * Fassung der Auswertung; ohne Angabe `GATE_FORMAT`. Nur das Nachrechnen eines Belegs wählt
   * eine ältere Fassung; das Tor selbst entscheidet immer mit `GATE_FORMAT`.
   */
  format?: number;
}

/**
 * Entscheidet über eine Aktion. Rein: kein I/O, keine Uhrzeit, kein Zufall; gleiche Eingaben
 * ergeben immer dieselbe Entscheidung. Damit lässt sich jede Entscheidung aus einem Beleg
 * nachrechnen: mit den Fakten, den Regeln zum damaligen Regelstand und der Fassung des Belegs.
 *
 * Gerechnet wird mit der eingefrorenen Fassung `GATE_FORMATS[options.format ?? GATE_FORMAT]`.
 * Eine Fassung, die dieser Stand nicht kennt, ist ein `RangeError`.
 *
 * `rules` ist der Regelstand (`RuleSnapshot`: Regeln mit Prüfsumme und Stand) oder eine einfache
 * Liste von Regeln. Mit Regelstand trägt die Entscheidung `ruleStand` und je angewandter Regel die
 * Prüfsumme `hash`; ohne Regelstand fehlt `ruleStand`, und `hash` steht nur bei Regeln, die ihn
 * mitbringen.
 *
 * Reihenfolge (Fassung 1):
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
  rules: RuleSnapshot,
  options?: EvaluateOptions,
): Decision;
export function evaluate<T extends ActionType>(
  action: ActionRequest<T>,
  facts: Facts<T>,
  rules: readonly EvaluatedRule[],
  options?: EvaluateOptions,
): ListDecision;
export function evaluate<T extends ActionType>(
  action: ActionRequest<T>,
  facts: Facts<T>,
  rules: readonly EvaluatedRule[] | RuleSnapshot,
  options: EvaluateOptions = {},
): Decision | ListDecision {
  const format = options.format ?? GATE_FORMAT;
  const spec = gateFormatSpec(format);
  if (spec === undefined) throw new RangeError(`Unbekannte Fassung des Tors: ${format}`);
  return spec.evaluate(action, facts, rules);
}

/**
 * Gilt eine Regel für diese Aktion (aktuelle Fassung)? Prüft `enabled`, die Aktion (`*` passt
 * immer) und alle Bedingungen. Eine Regel ohne Bedingungen passt auf jede passende Aktion. Die Art
 * des Akteurs kommt aus der Aktion und lässt sich über die Fakten nicht überschreiben.
 */
export function ruleApplies<T extends ActionType>(
  rule: RuleDefinition,
  action: ActionRequest<T>,
  facts: Facts<T>,
): boolean {
  return currentGateFormat().ruleApplies(rule, action, facts);
}

/**
 * Prüft eine Bedingung gegen die Fakten (aktuelle Fassung). `ACTOR_FACT` (`akteur`) liefert die
 * Art des Akteurs (`besitzer` oder `bot`); alle anderen Namen sind Felder der Fakten.
 * `value: { fact }` vergleicht mit einem anderen Fakt. Fehlt ein Fakt, gilt die Bedingung nicht.
 * `lt`/`lte`/`gt`/`gte` vergleichen nur Zahlen mit Zahlen, sonst gilt die Bedingung nicht.
 *
 * Verglichen werden nur einzelne Werte (Text, Zahl, Schalter); ein Fakt mit einer Liste erfüllt
 * keine Bedingung.
 */
export function conditionHolds(
  condition: RuleCondition,
  facts: Readonly<Record<string, unknown>>,
): boolean {
  return currentGateFormat().conditionHolds(condition, facts);
}
