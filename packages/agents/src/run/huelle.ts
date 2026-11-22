/**
 * PaiBot – Feste Hülle eines Werkzeug-Ergebnisses für das Modell: Daten, Fehler oder Ablehnung.
 * Texte kommen nur aus Text-Schlüsseln, nie aus Meldungen eines Werkzeugs oder Gründen des Tors.
 * Dazu das deterministische Kürzen zu großer Ergebnisse.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { BOUNDED_JSON_LIMITS, boundedJsonSchema } from "@paibot/shared/belege";
import type { ErrorCode } from "@paibot/shared/fehler";
import type { JsonValue, ToolResult } from "@paibot/shared/motor";
import { errorText, isTextKey, type TextKey, t } from "@paibot/shared/texte";
import { type Decision, LIMITS_BY_ID, PRECONDITIONS } from "@paibot/shared/tor";
import { type ToolEnvelope, type ToolKey, toolEnvelopeSchema } from "@paibot/shared/werkzeug";
import type { z } from "zod";

/** Text eines Schlüssels, der keine Platzhalter hat. */
export function plainText(key: TextKey): string {
  return (t as unknown as (key: TextKey) => string)(key);
}

/** Längster Text einer Hülle. */
export const ENVELOPE_TEXT_MAX = 500;

function bounded(text: string): string {
  const chars = Array.from(text);
  return chars.length <= ENVELOPE_TEXT_MAX
    ? text
    : `${chars.slice(0, ENVELOPE_TEXT_MAX - 1).join("")}…`;
}

/** Hülle mit Daten. Wirft, wenn sie nicht zum Vertrag passt (der Aufrufer macht daraus einen Fehler). */
export function dataEnvelope(toolKey: ToolKey, inhalt: JsonValue, gekuerzt: boolean): ToolEnvelope {
  return toolEnvelopeSchema.parse({
    paibot: "werkzeug-ergebnis",
    werkzeug: toolKey,
    art: "daten",
    status: "ok",
    inhalt,
    ...(gekuerzt ? { gekuerzt: true } : {}),
  });
}

/** Hülle für einen Fehler (`fehler`) oder eine Ablehnung (`abgelehnt`) mit Code und festem Text. */
export function codeEnvelope(
  toolKey: ToolKey,
  status: "fehler" | "abgelehnt",
  code: ErrorCode,
  text: string,
): ToolEnvelope {
  return toolEnvelopeSchema.parse({
    paibot: "werkzeug-ergebnis",
    werkzeug: toolKey,
    art: "daten",
    status,
    code,
    text: bounded(text),
  });
}

/** Text der Hülle bei einem Fehler des Werkzeugs (Zeitgrenze, Fehler) oder bei einem Abbruch. */
export function errorEnvelopeText(code: ErrorCode): string {
  if (code === "werkzeug_zeitgrenze") return t("werkzeug.huelle.zeitgrenze");
  if (code === "werkzeug_fehler") return t("werkzeug.huelle.fehler");
  return errorText(code);
}

/** Namen der angebotenen Werkzeuge für die Hülle „unbekannt“, so gekürzt, dass der Text passt. */
export function unknownToolText(offered: readonly string[]): string {
  const empty = t("werkzeug.huelle.keine");
  let namen = offered.length === 0 ? empty : "";
  for (const name of offered) {
    const next = namen === "" ? name : `${namen}, ${name}`;
    if (t("werkzeug.huelle.unbekannt", { namen: `${next}, …` }).length > ENVELOPE_TEXT_MAX) {
      namen = namen === "" ? "…" : `${namen}, …`;
      break;
    }
    namen = next;
  }
  return t("werkzeug.huelle.unbekannt", { namen });
}

/** Feste Art je Fehlerart von Zod. */
function artKey(code: string | undefined): TextKey {
  switch (code) {
    case "invalid_type":
      return "werkzeug.huelle.art.typ";
    case "too_big":
      return "werkzeug.huelle.art.zu_gross";
    case "too_small":
      return "werkzeug.huelle.art.zu_klein";
    case "unrecognized_keys":
      return "werkzeug.huelle.art.unbekannt";
    case "invalid_format":
    case "invalid_value":
    case "invalid_union":
      return "werkzeug.huelle.art.format";
    default:
      return "werkzeug.huelle.art.ungueltig";
  }
}

/**
 * Text der Hülle bei ungültiger Eingabe: `feld` ist der erste Schlüssel des Pfads, aber nur, wenn
 * er im Schema steht (`schemaKeys`), sonst „Eingabe“; `art` ist ein fester Text je Fehlerart.
 * Werte der Eingabe stehen nie im Text.
 */
export function invalidInputText(
  issue: z.core.$ZodIssue | undefined,
  schemaKeys: readonly string[],
): string {
  const first = issue?.path[0];
  const feld =
    typeof first === "string" && schemaKeys.includes(first) ? first : t("werkzeug.huelle.feld");
  return bounded(t("werkzeug.huelle.eingabe", { feld, art: plainText(artKey(issue?.code)) }));
}

function preconditionTitle(name: string): TextKey | undefined {
  for (const [id, entry] of Object.entries(PRECONDITIONS)) {
    const key = `regel.${id}`;
    if (entry.name === name && isTextKey(key)) return key;
  }
  return undefined;
}

function limitTitle(name: string): TextKey | undefined {
  for (const [id, limitName] of Object.entries(LIMITS_BY_ID)) {
    const key = `regel.${id}`;
    if (limitName === name && isTextKey(key)) return key;
  }
  return undefined;
}

/**
 * Text der Hülle bei einer Ablehnung, die weder „unbekannt“, „Eingabe ungültig“ noch „fragen“ ist:
 * „Nicht erlaubt: <Titel>.“ mit dem Titel der ersten verletzten Vorbedingung, sonst der ersten
 * verletzten Grenze, sonst der entscheidenden Regel, sonst dem Text des Codes. Nie der Grund des
 * Tors (`decision.reason`).
 */
export function deniedText(decision: Decision, code: ErrorCode): string {
  const precondition = decision.preconditions.find((check) => check.result === "verletzt");
  const limit = decision.limits.find((check) => check.result === "verletzt");
  const ruleKey =
    decision.matchedRules[0] === undefined ? undefined : `regel.${decision.matchedRules[0].id}`;
  const key =
    (precondition === undefined ? undefined : preconditionTitle(precondition.name)) ??
    (limit === undefined ? undefined : limitTitle(limit.name)) ??
    (ruleKey !== undefined && isTextKey(ruleKey) ? ruleKey : undefined);
  const titel = key === undefined ? errorText(code).replace(/\.$/, "") : plainText(key);
  return bounded(t("werkzeug.huelle.abgelehnt", { titel }));
}

/** Status für den Rückweg an das Modell: `ok` → `ok`, `fehler` → `error`, `abgelehnt` → `denied`. */
export function resultStatus(envelope: ToolEnvelope): ToolResult["status"] {
  if (envelope.status === "ok") return "ok";
  return envelope.status === "fehler" ? "error" : "denied";
}

/** Länge eines Inhalts, so wie gekürzt wird: Zeichen von `JSON.stringify`. */
export function contentChars(value: JsonValue): number {
  return JSON.stringify(value).length;
}

/** Kürzt die längste Zeichenkette (vom Ende her; bei Gleichstand die letzte) um `excess` Zeichen. */
function shortenLongestString(
  value: JsonValue,
  excess: number,
): { value: JsonValue; done: boolean } {
  type Path = (string | number)[];
  let best: { path: Path; length: number } | undefined;
  const visit = (node: JsonValue, path: Path) => {
    if (typeof node === "string") {
      if (node.length > 0 && (best === undefined || node.length >= best.length)) {
        best = { path, length: node.length };
      }
    } else if (Array.isArray(node)) {
      for (const [i, child] of node.entries()) visit(child, [...path, i]);
    } else if (node !== null && typeof node === "object") {
      for (const [key, child] of Object.entries(node)) visit(child, [...path, key]);
    }
  };
  visit(value, []);
  if (best === undefined) return { value, done: false };
  const target = best;
  const replace = (node: JsonValue, depth: number): JsonValue => {
    if (depth === target.path.length) {
      const text = node as string;
      return Array.from(text)
        .slice(0, Math.max(0, Array.from(text).length - excess))
        .join("");
    }
    const step = target.path[depth] as string | number;
    if (Array.isArray(node))
      return node.map((child, i) => (i === step ? replace(child, depth + 1) : child));
    const copy: { [key: string]: JsonValue } = {};
    for (const [key, child] of Object.entries(node as { [key: string]: JsonValue })) {
      copy[key] = key === step ? replace(child, depth + 1) : child;
    }
    return copy;
  };
  return { value: replace(value, 0), done: true };
}

/** Entfernt das letzte Element der letzten nicht leeren Liste. */
function dropLastListEntry(value: JsonValue): { value: JsonValue; done: boolean } {
  if (Array.isArray(value)) {
    for (let i = value.length - 1; i >= 0; i--) {
      const inner = dropLastListEntry(value[i] as JsonValue);
      if (inner.done)
        return { value: value.map((child, j) => (j === i ? inner.value : child)), done: true };
    }
    return value.length === 0 ? { value, done: false } : { value: value.slice(0, -1), done: true };
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value);
    for (let i = entries.length - 1; i >= 0; i--) {
      const [key, child] = entries[i] as [string, JsonValue];
      const inner = dropLastListEntry(child);
      if (inner.done) return { value: { ...value, [key]: inner.value }, done: true };
    }
  }
  return { value, done: false };
}

/**
 * Kürzt einen Inhalt deterministisch auf höchstens `maxChars` (`contentChars`): erst
 * Zeichenketten vom Ende her (die längste zuerst), dann Listen vom Ende her. `undefined`, wenn es
 * auch so nicht passt oder der gekürzte Inhalt nicht zum Vertrag der Hülle passt.
 */
export function truncateContent(
  value: JsonValue,
  maxChars: number,
): { inhalt: JsonValue; gekuerzt: boolean; chars: number } | undefined {
  const chars = contentChars(value);
  // Erst die festen Grenzen der Hülle: Zeichenketten und Listen vom Ende her kürzen.
  let current = fitBounds(value);
  let length = contentChars(current);
  for (let round = 0; length > maxChars && round < 10_000; round++) {
    const excess = length - maxChars;
    let next = shortenLongestString(current, excess);
    if (!next.done || contentChars(next.value) >= length) next = dropLastListEntry(current);
    if (!next.done) return undefined;
    current = next.value;
    length = contentChars(current);
  }
  if (length > maxChars) return undefined;
  if (!boundedJsonSchema.safeParse(current).success) return undefined;
  return { inhalt: current, gekuerzt: length < chars, chars };
}

/** Zeichenketten auf `BOUNDED_JSON_LIMITS.text` und Listen auf `.items` kürzen (vom Ende her). */
function fitBounds(value: JsonValue): JsonValue {
  if (typeof value === "string") {
    const chars = Array.from(value);
    return chars.length <= BOUNDED_JSON_LIMITS.text
      ? value
      : chars.slice(0, BOUNDED_JSON_LIMITS.text).join("");
  }
  if (Array.isArray(value)) return value.slice(0, BOUNDED_JSON_LIMITS.items).map(fitBounds);
  if (value !== null && typeof value === "object") {
    const out: { [key: string]: JsonValue } = {};
    for (const [key, child] of Object.entries(value)) out[key] = fitBounds(child);
    return out;
  }
  return value;
}
