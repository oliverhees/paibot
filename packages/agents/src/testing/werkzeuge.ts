/**
 * PaiBot – Test-Werkzeuge für Läufe mit Werkzeugen: lesend, mit fremden Inhalten, schreibend,
 * langsam, werfend, mit riesigem Ergebnis. Jeder Aufruf landet in einem Protokoll, damit Tests
 * zählen können, wie oft ein Werkzeug wirklich lief. Dazu eine Test-Regel, die ausgewählte
 * Test-Werkzeuge erlaubt. Nur für Tests, nie in der Auslieferung.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { newId } from "@paibot/shared/ids";
import type { JsonValue } from "@paibot/shared/motor";
import { ACTOR_FACT, type RuleDefinition } from "@paibot/shared/tor";
import type { ToolContext, ToolDefinition, ToolKey, ToolOutcome } from "@paibot/shared/werkzeug";
import { z } from "zod";

/** Modell-Namen der Test-Werkzeuge. */
export const TEST_TOOL_NAMES = [
  "test_lesen",
  "test_fremd",
  "test_schreiben",
  "test_langsam",
  "test_langsam_schreiben",
  "test_wirft",
  "test_riesig",
] as const;
export type TestToolName = (typeof TEST_TOOL_NAMES)[number];

/** Kennung eines Test-Werkzeugs, z. B. `eingebaut/test_lesen`. */
export function testToolKey(name: TestToolName): ToolKey {
  return `eingebaut/${name}`;
}

/**
 * Kennung, die die Standard-Regel R-010 erlaubt (lesen, intern, eingebaut). Eigene Regeln stehen
 * im Band ab `OWN_RULE_PRIORITY.min` und damit hinter R-005 („fragen“); durch das echte Tor kommt
 * ein Werkzeug-Aufruf in dieser Fassung deshalb nur mit dieser Kennung als `allow`.
 */
export const R010_TOOL_KEY: ToolKey = "eingebaut/doku.nachschlagen";

/** Test-Werkzeuge, die nur lesen und intern wirken; nur sie dürfen die Kennung von R-010 tragen. */
export const R010_CAPABLE: readonly TestToolName[] = [
  "test_lesen",
  "test_fremd",
  "test_langsam",
  "test_wirft",
  "test_riesig",
];

/** Merkmal in der Fehlermeldung von `test_wirft`; darf nie beim Modell, im Log oder in einer Zeile stehen. */
export const TEST_SECRET_MARKER = "GEHEIM-4711";

/**
 * Text, den `test_fremd` liefert: mit Steuerzeichen (U+0007), Bidi-Zeichen (U+202E, U+202C,
 * U+2066, U+2069, U+061C, U+200E) und unsichtbaren Zeichen (U+200B, U+FEFF). Nach dem Bereinigen
 * bleibt `TEST_FOREIGN_CLEAN`.
 */
export const TEST_FOREIGN_TEXT =
  "Fremder Text\u0007 mit \u202egespiegelt\u202c und un\u200bsicht\ufeffbar \u2066eingebettet\u2069\u061c\u200e.";
/** `TEST_FOREIGN_TEXT` ohne Steuer-, Bidi- und unsichtbare Zeichen. */
export const TEST_FOREIGN_CLEAN = "Fremder Text mit gespiegelt und unsichtbar eingebettet.";

/** Standard-Länge des Ergebnisses von `test_riesig`. */
export const TEST_HUGE_CHARS = 100_000;

/** Ein Aufruf eines Test-Werkzeugs, wie ihn das Protokoll festhält. */
export interface TestToolCall {
  name: TestToolName;
  input: JsonValue;
  /** Berechtigung des Tors, wie das Werkzeug sie bekam (ungeprüft festgehalten). */
  permit: ToolContext["permit"];
  runId: ToolContext["runId"];
  startedAt: number;
  /** Wann das Signal abbrach (Millisekunden seit 1970), falls es während des Laufs abbrach. */
  abortedAt?: number;
  /** Das Werkzeug ist zu Ende gelaufen (ohne Abbruch). */
  finished: boolean;
}

/** Protokoll aller Aufrufe der Test-Werkzeuge. */
export interface TestToolProtocol {
  readonly calls: readonly TestToolCall[];
  /** Zahl der Aufrufe, ohne Namen über alle Werkzeuge. */
  count(name?: TestToolName): number;
  reset(): void;
}

export interface TestToolOptions {
  /** Wie lange `test_langsam` und `test_langsam_schreiben` laufen, wenn nichts abbricht (Standard 30 000 ms). */
  slowMs?: number;
  /** Zeitgrenze der langsamen Werkzeuge (Standard 60 000 ms); kleiner als `slowMs` prüft die Zeitgrenze. */
  slowTimeoutMs?: number;
  /** Wird aufgerufen, sobald ein langsames Werkzeug läuft (z. B. um dann Not-Aus zu setzen). */
  onSlowStarted?(call: TestToolCall): void;
  /**
   * Dieses Werkzeug trägt die Kennung `R010_TOOL_KEY`, damit das echte Tor es mit den
   * Standard-Regeln erlaubt (nur Werkzeuge aus `R010_CAPABLE`; sonst wirft der Aufbau).
   */
  allowedByR010?: TestToolName;
}

export interface TestTools {
  /** Alle Test-Werkzeuge in fester Reihenfolge (`TEST_TOOL_NAMES`). */
  readonly tools: readonly ToolDefinition<JsonValue, JsonValue>[];
  byName(name: TestToolName): ToolDefinition<JsonValue, JsonValue>;
  readonly protocol: TestToolProtocol;
}

/** Ein typisiertes Werkzeug als `ToolDefinition<JsonValue, JsonValue>`, wie ein Register es hält. */
function widen<I extends JsonValue, O extends JsonValue>(
  def: ToolDefinition<I, O>,
): ToolDefinition<JsonValue, JsonValue> {
  return def as unknown as ToolDefinition<JsonValue, JsonValue>;
}

function abortError(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  if (reason instanceof Error && reason.name === "AbortError") return reason;
  const error = new Error("Abgebrochen");
  error.name = "AbortError";
  return error;
}

/** Wartet `ms` oder bis `signal` abbricht (dann wirft es `AbortError`). */
function wait(ms: number, signal: AbortSignal, call: TestToolCall): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      call.abortedAt = Date.now();
      reject(abortError(signal));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      call.abortedAt = Date.now();
      reject(abortError(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

const textOutput = z.strictObject({ text: z.string().max(1_000_000) });

/**
 * Eingabe von `test_lesen`. `zahl` nimmt jede endliche Zahl an, auch `1.5`: Die Steuerung muss
 * Gleitkommazahlen selbst ablehnen, das Schema tut es hier absichtlich nicht.
 */
const readInput = z.strictObject({
  q: z.string().min(1).max(200).optional(),
  a: z.number().int().min(0).max(1000).optional(),
  zahl: z.number().optional(),
});

/** Baut frische Test-Werkzeuge mit eigenem Protokoll. */
export function createTestTools(options: TestToolOptions = {}): TestTools {
  const calls: TestToolCall[] = [];
  const slowMs = options.slowMs ?? 30_000;
  const slowTimeoutMs = options.slowTimeoutMs ?? 60_000;

  function begin(name: TestToolName, input: JsonValue, ctx: ToolContext): TestToolCall {
    const call: TestToolCall = {
      name,
      input,
      permit: ctx.permit,
      runId: ctx.runId,
      startedAt: Date.now(),
      finished: false,
    };
    calls.push(call);
    return call;
  }

  function done<O>(call: TestToolCall, output: O): ToolOutcome<O> {
    call.finished = true;
    return { status: "ok", output };
  }

  const base = {
    version: 1,
    title: "aktion.werkzeug.aufrufen",
    source: "eingebaut",
    gateAction: "werkzeug.aufrufen",
  } as const;

  const slow = (name: "test_langsam" | "test_langsam_schreiben", schreibt: boolean) =>
    widen({
      ...base,
      key: testToolKey(name),
      modelName: name,
      description: schreibt
        ? "Test: wirkt langsam nach außen, bis die Zeit um ist oder der Lauf abbricht."
        : "Test: liest langsam, bis die Zeit um ist oder der Lauf abbricht.",
      kind: schreibt ? "schreiben" : "lesen",
      reach: schreibt ? "nach_aussen" : "intern",
      foreignContent: false,
      input: z.strictObject({ q: z.string().max(200).optional() }),
      output: textOutput,
      limits: { timeoutMs: slowTimeoutMs, maxOutputChars: 1000 },
      async run(input, ctx) {
        const call = begin(name, input, ctx);
        options.onSlowStarted?.(call);
        await wait(slowMs, ctx.signal, call);
        return done(call, { text: "langsam fertig" });
      },
    });

  const tools: ToolDefinition<JsonValue, JsonValue>[] = [
    widen({
      ...base,
      key: testToolKey("test_lesen"),
      modelName: "test_lesen",
      description: "Test: liest etwas innerhalb von PaiBot und ändert nichts.",
      kind: "lesen",
      reach: "intern",
      foreignContent: false,
      input: readInput,
      output: z.strictObject({ antwort: z.string().max(200) }),
      limits: { timeoutMs: 5000, maxOutputChars: 1000 },
      async run(input, ctx) {
        return done(begin("test_lesen", input, ctx), { antwort: "gelesen" });
      },
    }),
    widen({
      ...base,
      key: testToolKey("test_fremd"),
      modelName: "test_fremd",
      description: "Test: liefert Text von außerhalb von PaiBot, mit Steuer- und Bidi-Zeichen.",
      kind: "lesen",
      reach: "intern",
      foreignContent: true,
      input: z.strictObject({ q: z.string().max(200).optional() }),
      output: textOutput,
      limits: { timeoutMs: 5000, maxOutputChars: 4000 },
      async run(input, ctx) {
        return done(begin("test_fremd", input, ctx), { text: TEST_FOREIGN_TEXT });
      },
    }),
    widen({
      ...base,
      key: testToolKey("test_schreiben"),
      modelName: "test_schreiben",
      description: "Test: würde etwas nach außen schreiben.",
      kind: "schreiben",
      reach: "nach_aussen",
      foreignContent: false,
      input: z.strictObject({ q: z.string().max(200).optional() }),
      output: textOutput,
      limits: { timeoutMs: 5000, maxOutputChars: 1000 },
      async run(input, ctx) {
        return done(begin("test_schreiben", input, ctx), { text: "geschrieben" });
      },
    }),
    slow("test_langsam", false),
    slow("test_langsam_schreiben", true),
    widen({
      ...base,
      key: testToolKey("test_wirft"),
      modelName: "test_wirft",
      description: "Test: wirft immer einen Fehler mit einem Merkmal in der Meldung.",
      kind: "lesen",
      reach: "intern",
      foreignContent: false,
      input: z.strictObject({ q: z.string().max(200).optional() }),
      output: textOutput,
      limits: { timeoutMs: 5000, maxOutputChars: 1000 },
      async run(input, ctx): Promise<ToolOutcome<{ text: string }>> {
        begin("test_wirft", input, ctx);
        throw new Error(`Verbindung zu ${TEST_SECRET_MARKER} fehlgeschlagen`);
      },
    }),
    widen({
      ...base,
      key: testToolKey("test_riesig"),
      modelName: "test_riesig",
      description: "Test: liefert ein sehr großes Ergebnis.",
      kind: "lesen",
      reach: "intern",
      foreignContent: false,
      input: z.strictObject({ zeichen: z.number().int().min(1).max(500_000).optional() }),
      output: textOutput,
      limits: { timeoutMs: 5000, maxOutputChars: 1_000_000 },
      async run(input, ctx) {
        const zeichen = input.zeichen ?? TEST_HUGE_CHARS;
        return done(begin("test_riesig", input, ctx), { text: "x".repeat(zeichen) });
      },
    }),
  ];

  const allowed = options.allowedByR010;
  if (allowed !== undefined) {
    if (!R010_CAPABLE.includes(allowed)) throw new Error(`${allowed} passt nicht zu R-010`);
    const index = tools.findIndex((tool) => tool.modelName === allowed);
    const tool = tools[index];
    if (tool !== undefined) tools[index] = { ...tool, key: R010_TOOL_KEY };
  }

  const byModelName = new Map(tools.map((tool) => [tool.modelName, tool]));

  return {
    tools,
    byName(name) {
      const tool = byModelName.get(name);
      if (tool === undefined) throw new Error(`Test-Werkzeug ${name} fehlt`);
      return tool;
    },
    protocol: {
      calls,
      count: (name) =>
        name === undefined ? calls.length : calls.filter((call) => call.name === name).length,
      reset: () => {
        calls.length = 0;
      },
    },
  };
}

/**
 * Eigene Regel nur für Tests der Auswertung (`evaluate`): erlaubt die genannten Test-Werkzeuge,
 * damit sich der Deckel D-01 („gedeckelt“) zeigen lässt. Durch das echte Tor wirkt sie nicht vor
 * R-005 (Band der eigenen Regeln), und die Datenbank nimmt in dieser Fassung keine eigenen Regeln an.
 */
export function testToolRule(names: readonly TestToolName[]): RuleDefinition {
  return {
    id: newId("rule"),
    version: 1,
    action: "werkzeug.aufrufen",
    effect: "allow",
    stage: "execute",
    conditions: [
      { fact: ACTOR_FACT, op: "eq", value: "bot" },
      { fact: "botOfConversation", op: "eq", value: true },
      { fact: "toolKey", op: "in", value: names.map(testToolKey) },
    ],
    // Vor R-005 und unter dem Band eigener Regeln (`OWN_RULE_PRIORITY`): Das Tor lehnt eine solche
    // Regel mit `intern` ab, `evaluate` wertet sie aus. Deshalb nur für `evaluate`.
    priority: 5,
    source: "owner",
    enabled: true,
    title: "Test-Werkzeuge erlaubt (nur Test)",
    reason: "Nur im Test.",
  };
}
