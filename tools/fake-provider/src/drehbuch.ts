/**
 * PaiBot – Drehbuch des Test-Anbieters: je Chat-Anfrage ein fester Schritt mit Text, Denk-Text,
 * Werkzeug-Aufrufen (auch absichtlich ungültigen), Verbrauchsangabe und Abschlussgrund.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

/** Ein Werkzeug-Aufruf im Drehbuch. Alles darf absichtlich ungültig sein. */
export interface FakeScriptToolCall {
  /** Kennung; Standard `call_fake_<Nummer>`. Leer ("") und beliebig lang erlaubt. */
  id?: string;
  /** Name, wie gesendet; auch "", "a.b", 65 Zeichen, Unicode erlaubt. */
  name: string;
  /** Objekt (als JSON gesendet) oder fertiger Text – auch kaputtes JSON wie `{"frage": "Not`. */
  arguments: Record<string, unknown> | string;
  /** Im Strom: in so viele Stücke teilen (Standard 3). */
  pieces?: number;
}

/** Ein Schritt = Antwort auf genau eine Chat-Anfrage. */
export interface FakeScriptStep {
  /** Text der Antwort (auch zusammen mit Aufrufen). Fehlt er, gibt es keinen Text. */
  text?: string;
  /** Werkzeug-Aufrufe dieses Schritts; gesendet unabhängig davon, ob die Anfrage `tools` anbot. */
  toolCalls?: FakeScriptToolCall[];
  /** Denk-Text, gesendet im Feld `reasoning` oder `reasoning_content` (Standard `reasoning`). */
  reasoning?: { text: string; field?: "reasoning" | "reasoning_content" };
  /** `false`: keine Verbrauchsangabe senden, auch wenn sie verlangt ist. Sonst feste Zahlen. */
  usage?: false | { prompt: number; completion: number };
  /** `finish_reason`; Standard: `tool_calls` mit Aufrufen, sonst `stop`. */
  finish?: "stop" | "tool_calls" | "length";
}

export interface FakeScript {
  steps: FakeScriptStep[];
  /** Was nach dem letzten Schritt kommt: `normal` (wie ohne Drehbuch, Standard) oder `letzten-wiederholen` (endlose Aufrufe). */
  after?: "normal" | "letzten-wiederholen";
}

/** Standard-Zahl der Stücke je Aufruf im Strom. */
export const DEFAULT_SCRIPT_PIECES = 3;

/** Obergrenze für `pieces`, damit die Steuerung keine unsinnigen Werte annimmt. */
const MAX_PIECES = 10_000;

/** Baut `count` Aufrufe, z. B. 500 in einem Schritt: `toolCallsRepeated(500, (i) => ({ name: "t", arguments: { i } }))`. */
export function toolCallsRepeated(
  count: number,
  make: (index: number) => FakeScriptToolCall,
): FakeScriptToolCall[] {
  return Array.from({ length: count }, (_, index) => make(index));
}

/** Der Schritt, der zur wievielten Anfrage (ab 0) gehört; `undefined` = normales Verhalten. */
export function stepAt(
  script: FakeScript | undefined,
  position: number,
): { index: number; step: FakeScriptStep } | undefined {
  if (script === undefined) return undefined;
  const direct = script.steps[position];
  if (direct !== undefined) return { index: position, step: direct };
  if (script.after === "letzten-wiederholen" && script.steps.length > 0) {
    const index = script.steps.length - 1;
    const last = script.steps[index];
    if (last !== undefined) return { index, step: last };
  }
  return undefined;
}

/** Teilt `text` zeichenweise (nie mitten in einem Zeichen) in höchstens `count` Stücke. */
export function splitInto(text: string, count: number): string[] {
  const characters = Array.from(text);
  if (characters.length === 0) return [];
  const parts = Math.max(1, Math.min(Math.floor(count), characters.length));
  const size = Math.ceil(characters.length / parts);
  const pieces: string[] = [];
  for (let i = 0; i < characters.length; i += size)
    pieces.push(characters.slice(i, i + size).join(""));
  return pieces;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unknownKey(
  value: Record<string, unknown>,
  allowed: readonly string[],
): string | undefined {
  return Object.keys(value).find((key) => !allowed.includes(key));
}

function checkToolCall(value: unknown, where: string): FakeScriptToolCall | string {
  if (!isObject(value)) return `${where}: erwartet ein Objekt.`;
  const extra = unknownKey(value, ["id", "name", "arguments", "pieces"]);
  if (extra !== undefined) return `${where}: unbekanntes Feld \`${extra}\`.`;
  if (typeof value.name !== "string") return `${where}: \`name\` muss Text sein.`;
  if (typeof value.arguments !== "string" && !isObject(value.arguments)) {
    return `${where}: \`arguments\` muss ein Objekt oder Text sein.`;
  }
  if (value.id !== undefined && typeof value.id !== "string") {
    return `${where}: \`id\` muss Text sein.`;
  }
  if (value.pieces !== undefined) {
    const pieces = value.pieces;
    if (
      typeof pieces !== "number" ||
      !Number.isInteger(pieces) ||
      pieces < 1 ||
      pieces > MAX_PIECES
    ) {
      return `${where}: \`pieces\` muss eine ganze Zahl von 1 bis ${MAX_PIECES} sein.`;
    }
  }
  return value as unknown as FakeScriptToolCall;
}

function checkStep(value: unknown, where: string): FakeScriptStep | string {
  if (!isObject(value)) return `${where}: erwartet ein Objekt.`;
  const extra = unknownKey(value, ["text", "toolCalls", "reasoning", "usage", "finish"]);
  if (extra !== undefined) return `${where}: unbekanntes Feld \`${extra}\`.`;
  if (value.text !== undefined && typeof value.text !== "string") {
    return `${where}: \`text\` muss Text sein.`;
  }
  if (value.toolCalls !== undefined) {
    if (!Array.isArray(value.toolCalls)) return `${where}: \`toolCalls\` muss eine Liste sein.`;
    for (const [i, call] of value.toolCalls.entries()) {
      const checked = checkToolCall(call, `${where}.toolCalls[${i}]`);
      if (typeof checked === "string") return checked;
    }
  }
  if (value.reasoning !== undefined) {
    const reasoning = value.reasoning;
    if (!isObject(reasoning) || typeof reasoning.text !== "string") {
      return `${where}: \`reasoning\` braucht \`text\` (Text).`;
    }
    if (unknownKey(reasoning, ["text", "field"]) !== undefined) {
      return `${where}: \`reasoning\` kennt nur \`text\` und \`field\`.`;
    }
    if (
      reasoning.field !== undefined &&
      reasoning.field !== "reasoning" &&
      reasoning.field !== "reasoning_content"
    ) {
      return `${where}: \`reasoning.field\` muss reasoning oder reasoning_content sein.`;
    }
  }
  if (value.usage !== undefined && value.usage !== false) {
    const usage = value.usage;
    const whole = (v: unknown) => typeof v === "number" && Number.isInteger(v) && v >= 0;
    if (
      !isObject(usage) ||
      unknownKey(usage, ["prompt", "completion"]) !== undefined ||
      !whole(usage.prompt) ||
      !whole(usage.completion)
    ) {
      return `${where}: \`usage\` muss false sein oder \`prompt\` und \`completion\` (ganze Zahlen ab 0) haben.`;
    }
  }
  if (
    value.finish !== undefined &&
    value.finish !== "stop" &&
    value.finish !== "tool_calls" &&
    value.finish !== "length"
  ) {
    return `${where}: \`finish\` muss stop, tool_calls oder length sein.`;
  }
  return value as FakeScriptStep;
}

/** Prüft die Form eines Drehbuchs (z. B. aus der Steuerung); liefert es oder den Grund der Ablehnung. */
export function checkScript(value: unknown): FakeScript | string {
  if (!isObject(value)) return "Das Drehbuch muss ein JSON-Objekt mit `steps` sein.";
  const extra = unknownKey(value, ["steps", "after"]);
  if (extra !== undefined) return `Drehbuch: unbekanntes Feld \`${extra}\`.`;
  if (!Array.isArray(value.steps)) return "Drehbuch: `steps` muss eine Liste sein.";
  if (
    value.after !== undefined &&
    value.after !== "normal" &&
    value.after !== "letzten-wiederholen"
  ) {
    return "Drehbuch: `after` muss normal oder letzten-wiederholen sein.";
  }
  if (value.after === "letzten-wiederholen" && value.steps.length === 0) {
    return "Drehbuch: `letzten-wiederholen` braucht mindestens einen Schritt.";
  }
  for (const [i, step] of value.steps.entries()) {
    const checked = checkStep(step, `steps[${i}]`);
    if (typeof checked === "string") return checked;
  }
  return value as unknown as FakeScript;
}
