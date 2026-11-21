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

import { evaluate, gateFormatSpec, KNOWN_GATE_FORMAT } from "@paibot/gate";
import type { ActionRequest, Facts } from "@paibot/shared/aktionen";
import {
  type ReceiptBody,
  type ReceiptEntry,
  receiptBodyReadSchema,
  receiptContextSchema,
  receiptUndoSchema,
} from "@paibot/shared/belege";
import { RULE_HASH_PREFIX } from "@paibot/shared/bindung";
import type { Sha256Digest } from "@paibot/shared/grundtypen";
import {
  type GateRule,
  type ListDecision,
  type RuleDefinition,
  ruleContent,
  STANDARD_RULE_VERSIONS,
  type StoredRuleRef,
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

/** Warum das Nachrechnen `fehler` (bzw. bei `fassung_unbekannt` `nicht_pruefbar`) meldet. */
export const REEVALUATION_PROBLEMS = [
  "nicht_berechenbar",
  "regel_fehlt",
  "regel_geaendert",
  "entscheidung_abweichend",
  "fassung_unbekannt",
  "fassung_unpassend",
] as const;
/**
 * - `nicht_berechenbar`: Aktion oder Fakten lassen sich nicht auswerten.
 * - `regel_fehlt`: eine damals angewandte Regel gibt es zu diesem Stand nicht.
 * - `regel_geaendert`: der Inhalt einer damals angewandten Regel passt nicht mehr zu ihrer
 *   Prüfsumme im Beleg, oder eine Standard-Regel weicht von ihrer Fassung im Code ab.
 * - `entscheidung_abweichend`: mit denselben Regeln und Fakten käme heute etwas anderes heraus.
 * - `fassung_unbekannt`: der Beleg stammt aus einer neueren Fassung des Tors, die dieser Stand
 *   nicht kennt (Zustand `nicht_pruefbar`, nie `fehler`).
 * - `fassung_unpassend`: der Beleg passt nicht zu seiner (bekannten) Fassung.
 */
export type ReevaluationProblem = (typeof REEVALUATION_PROBLEMS)[number];

/** Ergebnis des Nachrechnens einer Entscheidung. */
export interface Reevaluation {
  /** `nicht_pruefbar`: Beleg aus einer neueren Fassung des Tors (`fassung_unbekannt`). */
  status: "ok" | "fehler" | "entfaellt" | "nicht_pruefbar";
  /** Was das Tor mit den gespeicherten Fakten und den Regeln dieses Stands entscheidet. */
  expected?: ListDecision;
  /**
   * Mit welchem Regelstand nachgerechnet wurde. `nicht_festgehalten`: der Beleg nennt keinen
   * (ältere Belege); dann wird mit den übergebenen bzw. heute gültigen Regeln gerechnet.
   */
  ruleStand?: number | "nicht_festgehalten";
  /** Bei `fehler`: der Grund. */
  problem?: ReevaluationProblem;
  /** Bei `regel_fehlt` und `regel_geaendert`: die betroffene Regel (mit der Prüfsumme aus dem Beleg). */
  rule?: StoredRuleRef;
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
 * Gerechnet wird mit der Fassung des Belegs (`decision.gateFormat`, fehlend = 1), siehe
 * `decisionFormat`: Kennt dieser Stand die Fassung nicht, ist das Ergebnis `nicht_pruefbar` mit
 * `fassung_unbekannt`; passt der Beleg nicht zu seiner Fassung, `fehler` mit `fassung_unpassend`.
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

  const fit = decisionFormat(body);
  if (fit.status === "unbekannt") {
    return { status: "nicht_pruefbar", ruleStand, problem: "fassung_unbekannt" };
  }
  if (fit.status === "unpassend") return fail("fassung_unpassend");

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

  let expected: ListDecision;
  try {
    expected = evaluate(body.action as ActionRequest, body.facts as unknown as Facts, effective, {
      format: fit.format,
    });
  } catch {
    return fail("nicht_berechenbar");
  }

  // Fassung 1: Vorbedingungen nur, wenn der Beleg sie trägt (ältere Belege ohne). Ab Fassung 2
  // wird immer alles verglichen, auch Vorbedingungen und Deckel; ein fehlendes Feld weicht ab.
  const recorded = body.decision as DecisionBody["decision"] & {
    preconditions?: unknown;
    caps?: unknown;
  };
  const strict = fit.format >= 2;
  const same =
    expected.outcome === recorded.outcome &&
    expected.stage === recorded.stage &&
    sameValue(expected.matchedRules.map(idAndVersion), recorded.rules.map(idAndVersion)) &&
    sameValue(expected.limits, recorded.limits) &&
    (strict
      ? recorded.preconditions !== undefined &&
        sameValue(expected.preconditions ?? [], recorded.preconditions)
      : recorded.preconditions === undefined ||
        sameValue(expected.preconditions ?? [], recorded.preconditions)) &&
    (!strict ||
      (expected.caps === undefined
        ? recorded.caps === undefined
        : recorded.caps !== undefined && sameValue(expected.caps, recorded.caps)));
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

function idAndVersion(rule: StoredRuleRef): StoredRuleRef {
  return { id: rule.id, version: rule.version };
}

function sameValue(a: unknown, b: unknown): boolean {
  try {
    return canonicalize(a as CanonicalValue) === canonicalize(b as CanonicalValue);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------
// Inhalt je Fassung

/** Wie eine Entscheidung zu ihrer Fassung steht. */
export type FormatFit =
  | { status: "passt"; format: number }
  | { status: "unbekannt"; format: number }
  | { status: "unpassend"; format?: number };

const DECISION_KEYS: ReadonlySet<string> = new Set([
  "v",
  "id",
  "seq",
  "time",
  "prev",
  "keyId",
  "type",
  "action",
  "decision",
  "facts",
  "context",
  "undo",
]);
const RESULT_KEYS: ReadonlySet<string> = new Set([
  "v",
  "id",
  "seq",
  "time",
  "prev",
  "keyId",
  "type",
  "action",
  "result",
  "undo",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function onlyKeys(value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => allowed.has(key));
}

/** Fassung, die eine Entscheidung nennt (`decision.gateFormat`, fehlend = 1); sonst `undefined`. */
export function declaredGateFormat(body: unknown): number | undefined {
  if (!isRecord(body) || !isRecord(body.decision)) return undefined;
  const format = body.decision.gateFormat ?? 1;
  return typeof format === "number" && Number.isSafeInteger(format) ? format : undefined;
}

/**
 * Prüft eine Entscheidung nach ihrer eigenen Fassung (`decision.gateFormat`, fehlend = 1):
 * - Form wie beim Lesen (`receiptBodyReadSchema`) nicht erfüllt → `unpassend`.
 * - Fassung größer als die höchste bekannte → `unbekannt` (Inhalt nicht prüfbar).
 * - bekannte Fassung: Körper streng nach `GATE_FORMATS[n]` (Aktion aus der Fassung, Akteur und
 *   Ziel nach der Aktion, Fakten der Aktion, Felder der Entscheidung, Kontext und Rückgängig,
 *   keine weiteren Schlüssel) → `passt`, sonst `unpassend`.
 */
export function decisionFormat(body: unknown): FormatFit {
  if (!isRecord(body) || body.type !== "decision") return { status: "unpassend" };
  if (!receiptBodyReadSchema.safeParse(body).success) return { status: "unpassend" };
  const format = declaredGateFormat(body);
  if (format === undefined) return { status: "unpassend" };
  const spec = gateFormatSpec(format);
  if (spec === undefined) {
    return format > KNOWN_GATE_FORMAT ? { status: "unbekannt", format } : { status: "unpassend" };
  }
  const action = body.action as { type?: unknown };
  const type = typeof action.type === "string" ? action.type : "";
  const factsSchema = Object.hasOwn(spec.facts, type) ? spec.facts[type] : undefined;
  const fits =
    onlyKeys(body, DECISION_KEYS) &&
    spec.request.safeParse(body.action).success &&
    factsSchema?.safeParse(body.facts).success === true &&
    (spec.decisionFor?.(type) ?? spec.decision).safeParse(body.decision).success &&
    (body.context === undefined || receiptContextSchema.safeParse(body.context).success) &&
    (body.undo === undefined || receiptUndoSchema.safeParse(body.undo).success);
  return fits ? { status: "passt", format } : { status: "unpassend", format };
}

/**
 * Prüft ein Ergebnis nach der Fassung `format` seiner Entscheidung: Form wie beim Lesen, Aktion
 * aus der Fassung, Felder des Ergebnisses streng (`code` aus `errorCodes`), Rückgängig, keine
 * weiteren Schlüssel. Unbekannte Fassung: nur die Form; passt sie, `undefined` (nicht prüfbar).
 */
export function resultFitsFormat(body: unknown, format: number): boolean | undefined {
  if (!isRecord(body) || body.type !== "result") return false;
  if (!receiptBodyReadSchema.safeParse(body).success) return false;
  const spec = gateFormatSpec(format);
  if (spec === undefined) return undefined;
  return (
    onlyKeys(body, RESULT_KEYS) &&
    spec.request.safeParse(body.action).success &&
    spec.result.safeParse(body.result).success &&
    (body.undo === undefined || receiptUndoSchema.safeParse(body.undo).success)
  );
}
