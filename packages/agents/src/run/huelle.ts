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
import { jsonUeberGrenzen, setOwn } from "./bereinigen";

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

/** Zeichenkette eines Werts, so wie sie in der Länge zählt: Zeichen von `JSON.stringify`. */
function jsonLength(text: string): number {
  return JSON.stringify(text).length;
}

/** Eine Zeichenkette im Wert: wo sie steht, ihre Länge und ihre Stelle in der Reihenfolge des Lesens. */
interface StringSlot {
  container: JsonValue[] | { [key: string]: JsonValue };
  key: string | number;
  /** Länge in UTF-16-Einheiten; danach wird die längste gewählt. */
  length: number;
  order: number;
}

/** Ist `a` vor `b` zu kürzen? Längere zuerst; bei Gleichstand die spätere in der Reihenfolge. */
function shortenBefore(a: StringSlot, b: StringSlot): boolean {
  return a.length > b.length || (a.length === b.length && a.order > b.order);
}

/** Heap der nicht leeren Zeichenketten, die längste (bei Gleichstand die letzte) oben. */
class StringHeap {
  private readonly items: StringSlot[] = [];

  get size(): number {
    return this.items.length;
  }

  push(slot: StringSlot): void {
    const items = this.items;
    items.push(slot);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!shortenBefore(items[i] as StringSlot, items[parent] as StringSlot)) break;
      [items[i], items[parent]] = [items[parent] as StringSlot, items[i] as StringSlot];
      i = parent;
    }
  }

  peek(): StringSlot | undefined {
    return this.items[0];
  }

  /** Nimmt die oberste Zeichenkette heraus. */
  pop(): void {
    const items = this.items;
    const last = items.pop();
    if (items.length === 0 || last === undefined) return;
    items[0] = last;
    let i = 0;
    for (;;) {
      const left = 2 * i + 1;
      const right = left + 1;
      let top = i;
      if (left < items.length && shortenBefore(items[left] as StringSlot, items[top] as StringSlot))
        top = left;
      if (
        right < items.length &&
        shortenBefore(items[right] as StringSlot, items[top] as StringSlot)
      )
        top = right;
      if (top === i) return;
      [items[i], items[top]] = [items[top] as StringSlot, items[i] as StringSlot];
      i = top;
    }
  }
}

/**
 * Kürzt die Zeichenketten des Werts (ein eigener Wert, wird verändert), die längste zuerst, bei
 * Gleichstand die letzte, jeweils um den noch fehlenden Rest (`length - maxChars`), bis der Wert
 * passt oder keine Zeichenkette mehr etwas hergibt. Gibt die neue Länge zurück. Jede Zeichenkette
 * wird einmal gelesen und die Länge nur um die Änderung nachgeführt, die Laufzeit wächst also
 * (bis auf den Heap) mit der Größe des Werts und nicht mit der Zahl der Runden.
 */
function shortenStrings(value: JsonValue, length: number, maxChars: number): number {
  const heap = new StringHeap();
  let order = 0;
  const visit = (node: JsonValue) => {
    if (Array.isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        const child = node[i] as JsonValue;
        if (typeof child === "string") {
          if (child.length > 0) heap.push({ container: node, key: i, length: child.length, order });
          order += 1;
        } else visit(child);
      }
    } else if (node !== null && typeof node === "object") {
      for (const [key, child] of Object.entries(node)) {
        if (typeof child === "string") {
          if (child.length > 0) heap.push({ container: node, key, length: child.length, order });
          order += 1;
        } else visit(child);
      }
    }
  };
  visit(value);
  while (length > maxChars) {
    const slot = heap.peek();
    if (slot === undefined) break;
    heap.pop();
    const container = slot.container as { [key: string | number]: JsonValue };
    const text = container[slot.key] as string;
    const chars = Array.from(text);
    const shorter = chars.slice(0, Math.max(0, chars.length - (length - maxChars))).join("");
    length -= jsonLength(text) - jsonLength(shorter);
    container[slot.key] = shorter;
    // Eine gekürzte Zeichenkette, die noch etwas enthält, kommt später noch einmal dran.
    if (shorter.length > 0) heap.push({ ...slot, length: shorter.length });
  }
  return length;
}

/**
 * Entfernt letzte Listeneinträge (ein eigener Wert, wird verändert), bis der Wert passt: erst in
 * den Kindern von hinten nach vorn (jedes Kind wird ganz geleert), dann die Einträge der Liste
 * selbst von hinten. Gibt die neue Länge zurück.
 */
function dropListEntries(value: JsonValue, length: number, maxChars: number): number {
  let current = length;
  const visit = (node: JsonValue): void => {
    if (current <= maxChars) return;
    if (Array.isArray(node)) {
      for (let i = node.length - 1; i >= 0 && current > maxChars; i--) visit(node[i] as JsonValue);
      while (node.length > 0 && current > maxChars) {
        const entry = node.pop() as JsonValue;
        current -= JSON.stringify(entry).length + (node.length > 0 ? 1 : 0);
      }
    } else if (node !== null && typeof node === "object") {
      const children = Object.values(node);
      for (let i = children.length - 1; i >= 0 && current > maxChars; i--)
        visit(children[i] as JsonValue);
    }
  };
  visit(value);
  return current;
}

/**
 * Kürzt einen Inhalt deterministisch auf höchstens `maxChars` (`contentChars`): erst
 * Zeichenketten vom Ende her (die längste zuerst), dann Listen vom Ende her. `undefined`, wenn es
 * auch so nicht passt oder der gekürzte Inhalt nicht zum Vertrag der Hülle passt. Die Laufzeit
 * wächst mit der Größe des Werts; ein zu tiefer, zu großer oder kreisförmiger Wert wird
 * gar nicht erst angefasst.
 */
export function truncateContent(
  value: JsonValue,
  maxChars: number,
): { inhalt: JsonValue; gekuerzt: boolean; chars: number } | undefined {
  if (jsonUeberGrenzen(value)) return undefined;
  const chars = contentChars(value);
  // Erst die festen Grenzen der Hülle: Zeichenketten und Listen vom Ende her kürzen. Das ist eine
  // eigene Kopie, die unten verändert werden darf.
  // Die Hülle um den Wert macht auch eine einzelne Zeichenkette als Wert kürzbar.
  const holder: JsonValue[] = [fitBounds(value)];
  let length = contentChars(holder[0] as JsonValue);
  if (length > maxChars) {
    length = shortenStrings(holder, length, maxChars);
    if (length > maxChars) length = dropListEntries(holder[0] as JsonValue, length, maxChars);
  }
  const current = holder[0] as JsonValue;
  // Nachgerechnet statt der mitgeführten Länge vertraut: Die Grenze muss wirklich eingehalten sein.
  const final = contentChars(current);
  if (final > maxChars) return undefined;
  if (!boundedJsonSchema.safeParse(current).success) return undefined;
  return { inhalt: current, gekuerzt: final < chars, chars };
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
    for (const [key, child] of Object.entries(value)) setOwn(out, key, fitBounds(child));
    return out;
  }
  return value;
}
