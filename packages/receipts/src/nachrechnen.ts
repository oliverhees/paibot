/**
 * PaiBot – Entscheidungen aus Belegen nachrechnen: mit dem Regelstand, der zur Entscheidung galt,
 * und mit den Prüfsummen der damals angewandten Regeln. Läuft ohne Datenbank und ohne Node-APIs.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { evaluate } from "@paibot/gate";
import type { ActionRequest, Facts } from "@paibot/shared/aktionen";
import type { ReceiptBody, ReceiptEntry } from "@paibot/shared/belege";
import { RULE_HASH_PREFIX } from "@paibot/shared/bindung";
import type { Sha256Digest } from "@paibot/shared/grundtypen";
import {
  type Decision,
  type GateRule,
  type RuleDefinition,
  type RuleRef,
  ruleContent,
  STANDARD_RULE_VERSIONS,
} from "@paibot/shared/tor";
import { type CanonicalValue, canonicalize } from "./canonical";
import { sha256Hex } from "./sha256";

/**
 * Prüfsumme des Inhalts einer Regel: `sha256:` + Hex klein von SHA-256 über die UTF-8-Bytes von
 * `RULE_HASH_PREFIX` + kanonisches JSON von `ruleContent(regel)`. Zeit, Nummer und eine schon
 * vorhandene Prüfsumme zählen nicht mit.
 *
 * Fehler: `CanonicalizeError`, wenn der Inhalt nicht kanonisierbar ist.
 */
export function hashRule(rule: RuleDefinition): Sha256Digest {
  const content = canonicalize(ruleContent(rule) as unknown as CanonicalValue);
  return `sha256:${sha256Hex(RULE_HASH_PREFIX + content)}`;
}

/** Eine Regel, wie sie aus dem Regel-Protokoll kommt: mit Nummer `seq`, wenn bekannt. */
export type RuleVersion = RuleDefinition & { readonly seq?: number };

/**
 * Regeln zu einem Stand des Regel-Protokolls, wie `rules.listActiveAsOf` der Datenbank: nur
 * Fassungen mit `seq <= stand`, je Regel die höchste davon, nur wenn sie eingeschaltet ist.
 * Regeln ohne `seq` gelten als zu jedem Stand vorhanden (z. B. eine eigene Liste im Test).
 */
export function rulesAsOf(rules: readonly RuleVersion[], stand: number): RuleVersion[] {
  const newest = new Map<string, RuleVersion>();
  for (const rule of rules) {
    if (rule.seq !== undefined && rule.seq > stand) continue;
    const known = newest.get(rule.id);
    if (known === undefined || rule.version > known.version) newest.set(rule.id, rule);
  }
  return [...newest.values()].filter((rule) => rule.enabled);
}

/** Liefert Regel-Fassungen zum Nachrechnen, z. B. aus der Datenbank. */
export interface RuleHistory {
  /** Die gültigen Regeln zum Stand `stand` (`rules.listActiveAsOf`). */
  asOf(stand: number): Promise<readonly RuleVersion[]>;
  /** Die heute gültigen Regeln (`rules.listActive`), für Belege ohne festgehaltenen Regelstand. */
  current(): Promise<readonly RuleVersion[]>;
}

/** Warum das Nachrechnen `fehler` meldet. */
export const REEVALUATION_PROBLEMS = [
  "nicht_berechenbar",
  "regel_fehlt",
  "regel_geaendert",
  "entscheidung_abweichend",
] as const;
/**
 * - `nicht_berechenbar`: Aktion oder Fakten lassen sich nicht auswerten.
 * - `regel_fehlt`: eine damals angewandte Regel gibt es zu diesem Stand nicht.
 * - `regel_geaendert`: der Inhalt einer damals angewandten Regel passt nicht mehr zu ihrer
 *   Prüfsumme im Beleg, oder eine Standard-Regel weicht von ihrer Fassung im Code ab.
 * - `entscheidung_abweichend`: mit denselben Regeln und Fakten käme heute etwas anderes heraus.
 */
export type ReevaluationProblem = (typeof REEVALUATION_PROBLEMS)[number];

/** Ergebnis des Nachrechnens einer Entscheidung. */
export interface Reevaluation {
  status: "ok" | "fehler" | "entfaellt";
  /** Was das Tor mit den gespeicherten Fakten und den Regeln dieses Stands entscheidet. */
  expected?: Decision;
  /**
   * Mit welchem Regelstand nachgerechnet wurde. `nicht_festgehalten`: der Beleg nennt keinen
   * (ältere Belege); dann wird mit den übergebenen bzw. heute gültigen Regeln gerechnet.
   */
  ruleStand?: number | "nicht_festgehalten";
  /** Bei `fehler`: der Grund. */
  problem?: ReevaluationProblem;
  /** Bei `regel_fehlt` und `regel_geaendert`: die betroffene Regel (mit der Prüfsumme aus dem Beleg). */
  rule?: RuleRef;
}

/**
 * Rechnet die Entscheidung eines Belegs `decision` nach (`evaluate` des Tors, ohne KI):
 *
 * 1. Regelstand: Nennt der Beleg `decision.ruleStand`, zählen nur die Regeln zu diesem Stand
 *    (`rulesAsOf` bzw. `history.asOf`). Später dazugekommene Regeln ändern alte Entscheidungen
 *    also nicht. Ohne Regelstand: alle übergebenen bzw. heute gültigen Regeln, Ergebnis mit
 *    `ruleStand: "nicht_festgehalten"`.
 * 2. Standard-Regeln zählen mit ihrem Inhalt aus dem Code (`STANDARD_RULE_VERSIONS`); weicht eine
 *    gespeicherte Standard-Regel davon ab, ist das `regel_geaendert`.
 * 3. Jede angewandte Regel mit Prüfsumme im Beleg muss es zum Stand geben (`regel_fehlt`) und
 *    dieselbe Prüfsumme haben (`regel_geaendert`).
 * 4. `outcome`, `stage`, Regeln, Grenzen und (falls im Beleg) Vorbedingungen müssen gleich sein,
 *    sonst `entscheidung_abweichend`.
 *
 * Mit einer Liste läuft es sofort, mit einer `RuleHistory` (z. B. Datenbank) als Promise.
 * `entfaellt` bei anderen Belegtypen.
 */
export function reevaluate(entry: ReceiptEntry, rules: readonly RuleVersion[]): Reevaluation;
export function reevaluate(entry: ReceiptEntry, history: RuleHistory): Promise<Reevaluation>;
export function reevaluate(
  entry: ReceiptEntry,
  source: readonly RuleVersion[] | RuleHistory,
): Reevaluation | Promise<Reevaluation> {
  const body = entry.body as ReceiptBody | undefined;
  if (body?.type !== "decision") {
    return isHistory(source) ? Promise.resolve({ status: "entfaellt" }) : { status: "entfaellt" };
  }
  const stand = body.decision.ruleStand;
  if (!isHistory(source)) {
    return decide(body, stand === undefined ? source : rulesAsOf(source, stand), stand);
  }
  const load = stand === undefined ? source.current() : source.asOf(stand);
  return load.then((rules) =>
    decide(body, stand === undefined ? rules : rulesAsOf(rules, stand), stand),
  );
}

function isHistory(source: readonly RuleVersion[] | RuleHistory): source is RuleHistory {
  return !Array.isArray(source);
}

type DecisionBody = Extract<ReceiptBody, { type: "decision" }>;

function decide(
  body: DecisionBody,
  rules: readonly RuleVersion[],
  stand: number | undefined,
): Reevaluation {
  const ruleStand = stand ?? "nicht_festgehalten";
  const fail = (problem: ReevaluationProblem, extra: Partial<Reevaluation> = {}): Reevaluation => ({
    status: "fehler",
    ruleStand,
    problem,
    ...extra,
  });

  let effective: GateRule[];
  try {
    const resolved = resolveRules(rules);
    if ("changed" in resolved) {
      return fail("regel_geaendert", {
        rule: { id: resolved.changed.id, version: resolved.changed.version },
      });
    }
    effective = resolved.rules;
  } catch {
    return fail("nicht_berechenbar");
  }

  for (const ref of body.decision.rules) {
    if (ref.hash === undefined) continue;
    const used = effective.find((rule) => rule.id === ref.id && rule.version === ref.version);
    if (used === undefined) return fail("regel_fehlt", { rule: ref });
    if (used.hash !== ref.hash) return fail("regel_geaendert", { rule: ref });
  }

  let expected: Decision;
  try {
    expected = evaluate(body.action as ActionRequest, body.facts as unknown as Facts, effective);
  } catch {
    return fail("nicht_berechenbar");
  }

  const recorded = body.decision;
  const same =
    expected.outcome === recorded.outcome &&
    expected.stage === recorded.stage &&
    sameValue(expected.matchedRules.map(idAndVersion), recorded.rules.map(idAndVersion)) &&
    sameValue(expected.limits, recorded.limits) &&
    (recorded.preconditions === undefined ||
      sameValue(expected.preconditions ?? [], recorded.preconditions));
  if (!same) return fail("entscheidung_abweichend", { expected });
  return { status: "ok", expected, ruleStand };
}

/**
 * Regeln mit Prüfsumme und Nummer, wie das Tor sie bekommt. Standard-Regeln nehmen den Inhalt aus
 * dem Code; eine gespeicherte Standard-Regel, die davon abweicht oder die der Code nicht kennt,
 * wird als `changed` gemeldet.
 */
function resolveRules(
  rules: readonly RuleVersion[],
): { rules: GateRule[] } | { changed: RuleVersion } {
  const resolved: GateRule[] = [];
  for (const rule of rules) {
    let content: RuleDefinition = ruleContent(rule);
    if (rule.source === "standard") {
      const fromCode = STANDARD_RULE_VERSIONS.find(
        (known) => known.id === rule.id && known.version === rule.version,
      ) as RuleDefinition | undefined;
      if (fromCode === undefined || hashRule(fromCode) !== hashRule(rule)) return { changed: rule };
      content = ruleContent(fromCode);
    }
    resolved.push({ ...content, hash: hashRule(content), seq: rule.seq ?? 0 });
  }
  return { rules: resolved };
}

function idAndVersion(rule: RuleRef): RuleRef {
  return { id: rule.id, version: rule.version };
}

function sameValue(a: unknown, b: unknown): boolean {
  try {
    return canonicalize(a as CanonicalValue) === canonicalize(b as CanonicalValue);
  } catch {
    return false;
  }
}
