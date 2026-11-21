/**
 * PaiBot – Beschreibung einer Fassung der Tor-Auswertung: welche Aktionen, Fakten und Felder sie
 * kennt und wie sie entscheidet.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import type { ActionType, ActorKind } from "@paibot/shared/aktionen";
import type { ErrorCode } from "@paibot/shared/fehler";
import type { Sha256Digest } from "@paibot/shared/grundtypen";
import type {
  Decision,
  GateLimitName,
  LimitCheck,
  ListDecision,
  PreconditionCheck,
  RuleCondition,
  RuleDefinition,
  RuleSnapshot,
} from "@paibot/shared/tor";
import type { z } from "zod";

/** Regel, wie `evaluate` sie annimmt: mit oder ohne Prüfsumme und Nummer im Regel-Protokoll. */
export type EvaluatedRule = RuleDefinition & { readonly hash?: Sha256Digest };

/** Eine Vorbedingung einer Fassung: für welche Aktionen, wann geprüft, was gelten muss. */
export interface FormatPrecondition {
  readonly name: string;
  readonly actions: readonly string[];
  readonly when?: readonly RuleCondition[];
  readonly require: readonly RuleCondition[];
  readonly errorCode: ErrorCode;
}

/**
 * Ein Deckel einer Fassung: Gilt `when` und mindestens eine Bedingung aus `anyOf`, wird aus einem
 * `allow` das Ergebnis `then`; andere Ergebnisse bleiben.
 */
export interface CapDefinition {
  readonly id: string;
  readonly name: string;
  readonly actions: readonly string[];
  readonly then: "ask";
  readonly when: readonly RuleCondition[];
  readonly anyOf: readonly RuleCondition[];
}

/** Eine Grenze einer Fassung: rein, liefert immer genau ein Ergebnis mit ihrem Namen. */
export type FormatLimitFn = (action: { type: string }, facts: unknown) => LimitCheck;

/**
 * Eingefrorene Beschreibung einer Fassung. Eine Fassung wird nie mehr geändert; jede Änderung am
 * Tor, die für gleiche Fakten ein anderes Ergebnis geben kann, ist eine neue Fassung.
 */
export interface GateFormatSpec {
  readonly format: number;
  /** Aktionen dieser Fassung. */
  readonly actions: readonly ActionType[];
  /** Fakten-Schema je Aktion. */
  readonly facts: Readonly<Record<string, z.ZodType>>;
  /** Ziel-Schema je Aktion. */
  readonly target: Readonly<Record<string, z.ZodType>>;
  /** Akteur je Aktion. */
  readonly actor: Readonly<Record<string, ActorKind>>;
  /** Ganze Anfrage an das Tor (Kennung, Aktion, Akteur passend zur Aktion, Ziel), streng. */
  readonly request: z.ZodType;
  /** Felder der Entscheidung im Beleg, streng (für alle Aktionen gemeinsam). */
  readonly decision: z.ZodType;
  /**
   * Felder der Entscheidung im Beleg für genau diese Aktion, streng (z. B. Deckel genau bei
   * Aktionen mit Deckel). Fehlt sie, gilt `decision`. Ab Fassung 2 Pflicht.
   */
  decisionFor?(type: string): z.ZodType;
  /** Felder des Ergebnisses im Beleg, streng. */
  readonly result: z.ZodType;
  /** Codes, die ein Ergebnis tragen darf. */
  readonly errorCodes: readonly string[];
  /** Vorbedingungen nach Kennung (`V-01` …). */
  readonly preconditions: Readonly<Record<string, FormatPrecondition>>;
  /** Grenzen nach Namen. */
  readonly limits: Readonly<Record<string, FormatLimitFn>>;
  /** Reihenfolge der Grenzen in jeder Entscheidung. */
  readonly limitOrder: readonly GateLimitName[];
  /** Deckel über die Regeln hinaus, nach Kennung geordnet; in Fassung 1 keine. */
  readonly caps: readonly CapDefinition[];
  /** Reihenfolge der Deckel in jeder Entscheidung (Namen). Ab Fassung 2 Pflicht. */
  readonly capOrder?: readonly string[];
  /**
   * Fehlercode für das Ergebnis einer nicht erlaubten Entscheidung dieser Fassung. Ab Fassung 2
   * Pflicht; Fassung 1 rechnet mit `denialCode` aus `evaluate.ts`.
   */
  denialCode?(
    decision: Pick<Decision, "outcome" | "preconditions"> & { limits?: Decision["limits"] },
  ): ErrorCode;
  /** Kennt die Aktion laut dieser Fassung den Fakt? */
  hasFact(type: string, name: string): boolean;
  /** Gilt eine Bedingung für diese Fakten (mit dem Akteur unter `akteur`)? */
  conditionHolds(condition: RuleCondition, facts: Readonly<Record<string, unknown>>): boolean;
  /** Gilt eine Regel für diese Aktion? */
  ruleApplies(
    rule: RuleDefinition,
    action: { type: string; actor: string },
    facts: unknown,
  ): boolean;
  /** Vorbedingungen der Aktion, geprüft gegen die Fakten. */
  checkPreconditions(action: { type: string; actor: string }, facts: unknown): PreconditionCheck[];
  /** Alle Grenzen in der Reihenfolge `limitOrder`. */
  checkLimits(action: { type: string }, facts: unknown): LimitCheck[];
  /** Ganze Auswertung: Eingabe, Vorbedingungen, Grenzen, Regeln. */
  evaluate(action: unknown, facts: unknown, rules: RuleSnapshot): Decision;
  evaluate(action: unknown, facts: unknown, rules: readonly EvaluatedRule[]): ListDecision;
  evaluate(
    action: unknown,
    facts: unknown,
    rules: readonly EvaluatedRule[] | RuleSnapshot,
  ): Decision | ListDecision;
}
