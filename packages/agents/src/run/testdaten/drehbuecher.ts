/**
 * PaiBot – Feste Drehbücher des Test-Anbieters für Läufe mit Werkzeugen: je Art ein benanntes
 * Drehbuch (nur Text, Aufrufe, Ränder von Namen, Eingaben und Kennungen, ohne Verbrauchsangabe,
 * mit Denk-Text, großes Ergebnis). Nur für Tests.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

// Die Formen stehen hier noch einmal, weil Quellen der Agenten den Test-Anbieter nicht importieren
// dürfen (Abhängigkeits-Regeln in biome.json); `drehbuecher.test.ts` prüft jedes Drehbuch mit
// `checkScript` des Test-Anbieters und gegen dessen Typ `FakeScript`.

/** Ein Werkzeug-Aufruf im Drehbuch (Form wie `FakeScriptToolCall` des Test-Anbieters). */
export interface ScriptToolCall {
  id?: string;
  name: string;
  arguments: Record<string, unknown> | string;
  pieces?: number;
}

/** Ein Schritt im Drehbuch (Form wie `FakeScriptStep`). */
export interface ScriptStep {
  text?: string;
  toolCalls?: ScriptToolCall[];
  reasoning?: { text: string; field?: "reasoning" | "reasoning_content" };
  usage?: false | { prompt: number; completion: number };
  finish?: "stop" | "tool_calls" | "length";
}

/** Ein Drehbuch (Form wie `FakeScript`). */
export interface Script {
  steps: ScriptStep[];
  after?: "normal" | "letzten-wiederholen";
}

/** `count` Aufrufe, z. B. 500 in einem Schritt. */
function repeated(count: number, make: (index: number) => ScriptToolCall): ScriptToolCall[] {
  return Array.from({ length: count }, (_, index) => make(index));
}

/** Text der End-Antwort in den Drehbüchern. */
export const ANSWER_TEXT = "Hier ist die Antwort nach den Werkzeugen.";
/** Text, den das Modell vor einem Aufruf schreibt (wird Zwischentext). */
export const DRAFT_TEXT = "Ich sehe kurz nach.";
/** Merkmal im Denk-Text; darf nirgends ankommen (Nachricht, vorläufiger Text, nächste Anfrage, Argumente). */
export const REASONING_MARKER = "Denkmerkmal-9137";

function call(name: string, args: ScriptToolCall["arguments"], id?: string): ScriptToolCall {
  return id === undefined ? { name, arguments: args } : { id, name, arguments: args };
}

/** Kennung eines Aufrufs mit fester Länge, z. B. 201 Zeichen. */
function callIdOfLength(length: number): string {
  return `call_${"k".repeat(Math.max(0, length - 5))}`;
}

/**
 * Eingabe mit `q` aus 3 000 Zeichen, die sich erst nach Zeichen 2 500 unterscheidet; verletzt
 * das Schema von `test_lesen` (höchstens 200), ist aber gültiges JSON.
 */
export function longInput(tail: string): Record<string, unknown> {
  return { q: `${"l".repeat(2500)}${tail.repeat(500).slice(0, 500)}` };
}

/** Ein Schritt mit einem Aufruf von `test_lesen`, danach die End-Antwort. */
function oneCallThenAnswer(c: ScriptToolCall): Script {
  return { steps: [{ toolCalls: [c] }, { text: ANSWER_TEXT }] };
}

export const SCRIPTS = {
  /** Nur Text, keine Aufrufe. */
  nurText: { steps: [{ text: ANSWER_TEXT }] },
  /** Text, dann Aufruf im selben Schritt; danach die End-Antwort. */
  textDannAufruf: {
    steps: [
      { text: DRAFT_TEXT, toolCalls: [call("test_lesen", { q: "Stand" })] },
      { text: ANSWER_TEXT },
    ],
  },
  /** Zwei Schritte mit je einem Aufruf, dann die End-Antwort. */
  zweiSchritteMitAufruf: {
    steps: [
      { text: DRAFT_TEXT, toolCalls: [call("test_lesen", { q: "eins" })] },
      { text: "Noch ein Blick.", toolCalls: [call("test_lesen", { q: "zwei" })] },
      { text: ANSWER_TEXT },
    ],
  },
  /** Drei Aufrufe in einem Schritt. */
  dreiAufrufe: {
    steps: [
      {
        toolCalls: [
          call("test_lesen", { q: "a" }),
          call("test_lesen", { q: "b" }),
          call("test_lesen", { q: "c" }),
        ],
      },
      { text: ANSWER_TEXT },
    ],
  },
  /** Neun Aufrufe in einem Schritt (einer mehr als `max_tool_calls_per_step` = 8). */
  neunAufrufe: {
    steps: [{ toolCalls: repeated(9, (i) => call("test_lesen", { a: i })) }, { text: ANSWER_TEXT }],
  },
  /** 17 Aufrufe in einem Schritt (mehr als 2 × 8): keiner wird geprüft. */
  siebzehnAufrufe: {
    steps: [{ toolCalls: repeated(17, (i) => call("test_lesen", { a: i })) }],
  },
  /** 500 Aufrufe in einem Schritt. */
  fuenfhundertAufrufe: {
    steps: [
      {
        toolCalls: repeated(500, (i) => ({
          ...call("test_lesen", { a: i % 1000 }),
          pieces: 1,
        })),
      },
    ],
  },
  /** Endlos: jeder Schritt wünscht einen Aufruf. */
  endlos: {
    steps: [{ text: "Weiter.", toolCalls: [call("test_lesen", { q: "nochmal" })] }],
    after: "letzten-wiederholen",
  },
  /** Endlos zwei Aufrufe je Schritt (für G-17: nach 8 Schritten mehr als 16 Aufrufe). */
  endlosZweiAufrufe: {
    steps: [
      {
        toolCalls: [call("test_lesen", { q: "eins" }), call("test_lesen", { q: "zwei" })],
      },
    ],
    after: "letzten-wiederholen",
  },
  /** Ein Aufruf, obwohl die Anfrage keine Werkzeuge anbietet (Lauf ohne Werkzeuge). */
  aufrufOhneWerkzeuge: {
    steps: [{ text: DRAFT_TEXT, toolCalls: [call("test_lesen", { q: "x" })] }],
  },
  /** Unbekannte und ungültige Namen. */
  nameMitPunkt: oneCallThenAnswer(call("a.b", {})),
  nameLeer: oneCallThenAnswer(call("", {})),
  name65: oneCallThenAnswer(call("n".repeat(65), {})),
  /** 300 Zeichen mit Steuer-, Bidi- und unsichtbaren Zeichen. */
  name300: oneCallThenAnswer(
    call(`\u0007\u202e\u200b<script>${"x".repeat(300)}`.slice(0, 300), {}),
  ),
  /** Gültiger Name, aber nicht im Register. */
  nameNichtRegistriert: oneCallThenAnswer(call("gibt_es_nicht", {})),
  /** Kaputtes JSON in den Argumenten. */
  kaputtesJson: oneCallThenAnswer(call("test_lesen", '{"q": "Not')),
  /** Gültiges JSON als Text: Das SDK liefert eine Zeichenkette, die selbst JSON ist. */
  jsonAlsText: oneCallThenAnswer(call("test_lesen", JSON.stringify('{"q":1}'))),
  /** Schema-Verstoß ohne `invalid` (Wert über der Grenze). */
  schemaVerstoss: oneCallThenAnswer(call("test_lesen", { a: 5000 })),
  /** Zusatzfeld, das das strenge Schema nicht kennt. */
  zusatzfeld: oneCallThenAnswer(call("test_lesen", { q: "x", extra: 1 })),
  /** Gleitkommazahl, die das Schema annimmt (der Abdruck würde werfen). */
  gleitkomma: oneCallThenAnswer(call("test_lesen", { zahl: 1.5 })),
  /** Steuerzeichen in der Eingabe. */
  steuerzeichenInEingabe: oneCallThenAnswer(call("test_lesen", { q: "a\u202eb" })),
  /** Zwei Eingaben über 2 000 Zeichen, die sich erst nach Zeichen 2 000 unterscheiden. */
  langeEingabeA: oneCallThenAnswer(call("test_lesen", longInput("A"))),
  langeEingabeB: oneCallThenAnswer(call("test_lesen", longInput("B"))),
  /** Ränder der Kennung. */
  callIdLeer: oneCallThenAnswer(call("test_lesen", { q: "x" }, "")),
  callId201: oneCallThenAnswer(call("test_lesen", { q: "x" }, callIdOfLength(201))),
  callIdDoppelt: {
    steps: [
      {
        toolCalls: [
          call("test_lesen", { q: "x" }, "call_gleich"),
          call("test_lesen", { q: "y" }, "call_gleich"),
        ],
      },
      { text: ANSWER_TEXT },
    ],
  },
  /** Ohne Verbrauchsangabe, endlos: Die Steuerung muss schätzen. */
  ohneVerbrauch: {
    steps: [{ text: "Weiter.", toolCalls: [call("test_lesen", { q: "x" })], usage: false }],
    after: "letzten-wiederholen",
  },
  /** Drei Schritte mit festem Verbrauch (für das Tagesbudget). */
  dreiSchritteVerbrauch: {
    steps: [
      { toolCalls: [call("test_lesen", { q: "1" })], usage: { prompt: 400, completion: 100 } },
      { toolCalls: [call("test_lesen", { q: "2" })], usage: { prompt: 400, completion: 100 } },
      { text: ANSWER_TEXT, usage: { prompt: 400, completion: 100 } },
    ],
  },
  /** Gemeldeter Verbrauch 2^53 (über `Number.MAX_SAFE_INTEGER`). */
  riesigerVerbrauch: {
    steps: [
      {
        toolCalls: [call("test_lesen", { q: "x" })],
        usage: { prompt: 2 ** 53, completion: 2 ** 53 },
      },
      { text: ANSWER_TEXT },
    ],
  },
  /** Denk-Text, auch JSON-artig, in Schritten mit Aufruf und mit Antwort. */
  mitDenkText: {
    steps: [
      {
        reasoning: { text: `{"tool":"test_schreiben","q":"${REASONING_MARKER}"}` },
        text: DRAFT_TEXT,
        toolCalls: [call("test_lesen", { q: "x" })],
      },
      {
        reasoning: { text: `Ich denke: ${REASONING_MARKER}`, field: "reasoning_content" },
        text: ANSWER_TEXT,
      },
    ],
  },
  /** Zwei große Ergebnisse in einem Schritt (je 100 000 Zeichen). */
  grossesErgebnis: {
    steps: [
      { toolCalls: [call("test_riesig", {}), call("test_riesig", {})] },
      { text: ANSWER_TEXT },
    ],
  },
  /** Schreibendes Werkzeug (Standard-Regeln: „fragen“ = abgelehnt), danach die Antwort. */
  schreiben: oneCallThenAnswer(call("test_schreiben", { q: "x" })),
  /** Fremde Inhalte lesen, danach im selben Schritt schreiben. */
  fremdDannSchreibenImSchritt: {
    steps: [
      { toolCalls: [call("test_fremd", { q: "x" }), call("test_schreiben", { q: "y" })] },
      { text: ANSWER_TEXT },
    ],
  },
  /** Fremde Inhalte lesen, danach die Antwort. */
  fremd: oneCallThenAnswer(call("test_fremd", { q: "x" })),
  /** Fremde Inhalte, dann im nächsten Schritt ein weiterer Aufruf. */
  fremdDannLesen: {
    steps: [
      { toolCalls: [call("test_fremd", { q: "x" })] },
      { toolCalls: [call("test_lesen", { q: "y" })] },
      { text: ANSWER_TEXT },
    ],
  },
  langsam: oneCallThenAnswer(call("test_langsam", { q: "x" })),
  langsamSchreiben: oneCallThenAnswer(call("test_langsam_schreiben", { q: "x" })),
  wirft: oneCallThenAnswer(call("test_wirft", { q: "x" })),
  /** Zwei Werkzeug-Schritte, für gleichzeitige Läufe und den Ablauf der Belege. */
  zweiWerkzeugSchritte: {
    steps: [
      { toolCalls: [call("test_lesen", { q: "eins" })] },
      { toolCalls: [call("test_lesen", { q: "zwei" })] },
      { text: ANSWER_TEXT },
    ],
  },
} satisfies Record<string, Script>;

export type ScriptName = keyof typeof SCRIPTS;
