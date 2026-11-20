/**
 * PaiBot – Prüfsumme des Inhalts einer Regel und der Regelstand, wie das Tor ihn bekommt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { RULE_HASH_PREFIX } from "@paibot/shared/bindung";
import type { Sha256Digest } from "@paibot/shared/grundtypen";
import {
  type GateRule,
  type RuleDefinition,
  type RuleSnapshot,
  ruleContent,
} from "@paibot/shared/tor";

/**
 * Kanonisches JSON für den Inhalt einer Regel (nach RFC 8785, eingeschränkt auf die Werte, die in
 * Regeln vorkommen): Schlüssel nach UTF-16-Code-Units sortiert, keine Leerzeichen, Texte maskiert
 * wie `JSON.stringify`, nur sichere Ganzzahlen. Andere Werte werfen einen `TypeError`.
 */
function canonical(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new TypeError("Regel enthält keine Ganzzahl");
    return Object.is(value, -0) ? "0" : String(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Regel enthält ein unbekanntes Objekt");
    }
    const record = value as Record<string, unknown>;
    const parts = Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`);
    return `{${parts.join(",")}}`;
  }
  throw new TypeError("Regel enthält einen unbekannten Wert");
}

/**
 * Prüfsumme des Inhalts einer Regel: `sha256:` + Hex klein von SHA-256 über die UTF-8-Bytes von
 * `RULE_HASH_PREFIX` + kanonisches JSON von `ruleContent(rule)`. Zeit, Nummer im Regel-Protokoll
 * und eine schon vorhandene Prüfsumme zählen nicht mit. Gleicher Inhalt ergibt immer dieselbe
 * Prüfsumme; jede Änderung am Inhalt (auch bei gleicher Kennung und Fassung) eine andere.
 */
export async function hashRule(rule: RuleDefinition): Promise<Sha256Digest> {
  const text = `${RULE_HASH_PREFIX}${canonical(ruleContent(rule))}`;
  // Nur Web Crypto (`globalThis.crypto.subtle`): läuft in Node und im Browser gleich.
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0"));
  return `sha256:${hex.join("")}`;
}

/** Regel mit optionaler Nummer im Regel-Protokoll, z. B. eine gespeicherte Regel. */
export type RuleWithSeq = RuleDefinition & { readonly seq?: number | undefined };

/**
 * Baut den Regelstand, wie das Tor ihn bekommt: jede Regel mit ihrem Inhalt, ihrer Prüfsumme
 * (`hashRule`) und ihrer Nummer im Regel-Protokoll. Ohne `stand` gilt die höchste Nummer der
 * Regeln. Regeln ohne eigene Nummer bekommen ihre Position in der Liste (ab 1); das passt für
 * Regeln, die nie gespeichert waren (z. B. in Tests).
 */
export async function ruleSnapshot(
  rules: readonly RuleWithSeq[],
  stand?: number,
): Promise<RuleSnapshot> {
  const gateRules: GateRule[] = await Promise.all(
    rules.map(async (rule, index) => ({
      ...ruleContent(rule),
      hash: await hashRule(rule),
      seq: rule.seq ?? index + 1,
    })),
  );
  const highest = gateRules.reduce((max, rule) => Math.max(max, rule.seq), 0);
  return { stand: stand ?? Math.max(highest, 1), rules: gateRules };
}
