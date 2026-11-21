/**
 * PaiBot – Antwort der Regel-Liste eines EUrouter-Kontos (`GET /api/v1/routing-rules`) streng lesen:
 * Form der Antwort mit Zod, nur eingeschaltete Regeln, Namen bereinigt, Vorgaben nur in der
 * belegten Form. Kennungen des Kontos (`id`, `user_id`, `org_id`, `workspace_id`, `api_key_id`)
 * werden nie übernommen; Freitext (`description`) auch nicht.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { z } from "zod";
import { anzeigeText } from "./anzeigetext";
import { LIMITS } from "./constants";
import {
  RULE_POLICY_VALUE_PATTERN,
  type RulePolicy,
  rulePolicySchema,
  SERVED_MODEL_PATTERN,
} from "./grundtypen";

/** Mehr Regeln als so viele liest PaiBot nicht; ein Rest wird als „unvollständig“ gemeldet. */
export const MAX_RULES_READ = 200;

/**
 * Form der Antwort, die belegt ist: `{ "data": [ { name, enabled, provider: {…}, models, … } ] }`.
 * Zusätzliche Felder (auch Kennungen) werden von Zod verworfen, nicht weitergereicht. Die Felder
 * von `provider` sind hier nur „irgendetwas“; `policyOf` übernimmt sie einzeln und nur in der
 * erwarteten Form, denn nicht belegt ist, welche Werte sie sonst annehmen.
 */
const ruleSchema = z.object({
  name: z.string(),
  enabled: z.boolean(),
  models: z.unknown().optional(),
  provider: z
    .object({
      data_residency: z.unknown().optional(),
      eu_owned: z.unknown().optional(),
      data_collection: z.unknown().optional(),
      max_retention_days: z.unknown().optional(),
      allow_fallbacks: z.unknown().optional(),
    })
    .optional(),
});

export const routingRulesResponseSchema = z.object({ data: z.array(ruleSchema) });

/** Eine eingeschaltete Regel des Kontos, bereinigt: Name und Vorgaben, sonst nichts. */
export interface ListedRule {
  name: string;
  policy: RulePolicy;
}

export interface ParsedRules {
  regeln: ListedRule[];
  /** Es kann weitere Regeln geben, die PaiBot nicht gesehen hat (Hinweis auf weitere Seiten, Kürzung). */
  unvollstaendig: boolean;
  /** Eingeschaltete Regeln, deren Name sich nicht als Regel-Name übernehmen lässt. */
  uebersprungen: number;
}

/** Nur diese Form eines Werts gilt: Text aus wenigen sichtbaren Zeichen. */
function kurzerText(wert: unknown): string | undefined {
  return typeof wert === "string" && RULE_POLICY_VALUE_PATTERN.test(wert) ? wert : undefined;
}

/**
 * Vorgaben einer Regel aus dem Feld `provider` und `models`. Ein Feld, das fehlt oder nicht die
 * erwartete Form hat, fehlt auch im Ergebnis. Das Ergebnis besteht `rulePolicySchema`.
 */
export function policyOf(
  provider: {
    data_residency?: unknown;
    eu_owned?: unknown;
    data_collection?: unknown;
    max_retention_days?: unknown;
    allow_fallbacks?: unknown;
  } = {},
  models?: unknown,
): RulePolicy {
  const policy: RulePolicy = {};
  const residency = kurzerText(provider.data_residency);
  if (residency !== undefined) policy.data_residency = residency;
  if (typeof provider.eu_owned === "boolean") policy.eu_owned = provider.eu_owned;
  const collection = kurzerText(provider.data_collection);
  if (collection !== undefined) policy.data_collection = collection;
  const days = provider.max_retention_days;
  if (typeof days === "number" && Number.isInteger(days) && days >= 0 && days <= 36500) {
    policy.max_retention_days = days;
  }
  if (typeof provider.allow_fallbacks === "boolean") {
    policy.allow_fallbacks = provider.allow_fallbacks;
  }
  if (Array.isArray(models)) {
    const liste = models
      .filter((m): m is string => typeof m === "string" && SERVED_MODEL_PATTERN.test(m))
      .slice(0, 20);
    if (liste.length > 0) policy.models = liste;
  }
  return rulePolicySchema.parse(policy);
}

/** Schlüsselnamen, die auf weitere Seiten oder eine Fortsetzung deuten könnten. */
const SEITEN_HINWEIS =
  /(^|[_-])(next|cursor|more|page|pages|offset|limit|links?)($|[_-])|nextPage|hasMore/i;

function ungleichLeer(wert: unknown): boolean {
  if (wert === null || wert === undefined || wert === false || wert === "" || wert === 0) {
    return false;
  }
  if (Array.isArray(wert)) return wert.length > 0;
  if (typeof wert === "object") return Object.keys(wert).length > 0;
  return true;
}

/**
 * Deutet die Antwort auf weitere Seiten hin? Belegt ist die Form `{ data }` ohne weitere Felder;
 * wie Seiten bei EUrouter aussehen würden, ist nicht belegt. Deshalb nur ein vorsichtiger Hinweis:
 * ein weiteres Feld auf oberster Ebene mit einem Namen, der nach Seiten oder Fortsetzung klingt
 * und nicht leer ist, oder eine Gesamtzahl (`total`, `count`), die über die gelieferten Regeln
 * hinausgeht.
 */
export function deutetAufWeitereSeiten(roh: unknown, geliefert: number): boolean {
  if (typeof roh !== "object" || roh === null || Array.isArray(roh)) return false;
  for (const [name, wert] of Object.entries(roh)) {
    if (name === "data") continue;
    if (/^(total|count|total_count|totalCount)$/.test(name)) {
      if (typeof wert === "number" && wert > geliefert) return true;
      continue;
    }
    if (SEITEN_HINWEIS.test(name) && ungleichLeer(wert)) return true;
  }
  return false;
}

/**
 * Liest die Antwort der Regel-Liste. `undefined`, wenn sie nicht die belegte Form hat. Sonst nur
 * die eingeschalteten Regeln mit bereinigtem Namen und Vorgaben; eine Regel, deren Name nicht
 * unverändert als Name taugt (Steuerzeichen, zu lang), wird nicht angeboten, denn sie ließe sich
 * unter diesem Namen nicht aufrufen.
 */
export function parseRoutingRules(roh: unknown): ParsedRules | undefined {
  const form = routingRulesResponseSchema.safeParse(roh);
  if (!form.success) return undefined;
  const regeln: ListedRule[] = [];
  const gesehen = new Set<string>();
  let uebersprungen = 0;
  let gekuerzt = false;
  for (const regel of form.data.data) {
    if (!regel.enabled) continue;
    const sauber = anzeigeText(regel.name, LIMITS.routingRuleNameChars);
    if (sauber === undefined || sauber !== regel.name || /\s{2,}/.test(sauber)) {
      uebersprungen += 1;
      continue;
    }
    if (gesehen.has(sauber)) continue;
    if (regeln.length >= MAX_RULES_READ) {
      gekuerzt = true;
      continue;
    }
    gesehen.add(sauber);
    regeln.push({ name: sauber, policy: policyOf(regel.provider, regel.models) });
  }
  regeln.sort((a, b) => a.name.localeCompare(b.name, "de"));
  return {
    regeln,
    unvollstaendig: gekuerzt || deutetAufWeitereSeiten(roh, form.data.data.length),
    uebersprungen,
  };
}
