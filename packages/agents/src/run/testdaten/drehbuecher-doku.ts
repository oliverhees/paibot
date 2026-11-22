/**
 * PaiBot – Feste Drehbücher des Test-Anbieters für Läufe mit dem Werkzeug „In der Doku
 * nachschlagen“: Treffer, nichts gefunden (einmal, zweimal, gemischt), abgelehnte Eingaben, Pfade
 * und Adressen als Frage, eine eingeschleuste Aufforderung und ein Schritt ganz ohne Wunsch.
 * Nur für Tests.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import type { Script, ScriptToolCall } from "./drehbuecher";

/** Name des Werkzeugs für das Modell. */
export const DOKU_NAME = "doku_nachschlagen";

/** Text, den das Modell vor dem Nachschlagen schreibt; darf nie als Antwort erscheinen. */
export const ENTWURF = "ENTWURF";

/** Text eines zweiten Schritts, der nach „nichts gefunden“ nie angefragt werden darf. */
export const ZWEITER_SCHRITT = "ZWEITER-SCHRITT";

/** End-Antwort nach einem Treffer; nennt die Seite nur, weil das Drehbuch sie schreibt. */
export const ANTWORT_MIT_SEITE =
  "Das steht unter Einstellungen › Grenzen (funktion-einstellungen.md).";

/** End-Antwort ohne Werkzeug-Wunsch. */
export const ANTWORT_OHNE_WUNSCH = "Gern, hier ist meine Antwort ohne Nachschlagen.";

/** Frage mit Treffer im echten Index. */
export const FRAGE_TREFFER = "Tagesbudget einstellen";

/** Frage ohne Treffer im echten Index. */
export const FRAGE_FALLE = "Wie verbinde ich Telegram?";

/** Zweite Frage ohne Treffer im echten Index. */
export const FRAGE_FALLE_2 = "Hat PaiBot eine Sprachausgabe?";

/** Eingaben, die nur gesucht werden und nie eine Datei oder Adresse öffnen dürfen. */
export const PFAD_FRAGEN = [
  "../../.env",
  "/etc/passwd",
  "file:///etc/passwd",
  "https://example.org",
] as const;

function doku(args: Record<string, unknown> | string, id?: string): ScriptToolCall {
  return id === undefined
    ? { name: DOKU_NAME, arguments: args }
    : { id, name: DOKU_NAME, arguments: args };
}

/** Eingaben an den Rändern der Grenzen (Frage 3 … 200, bis 2 andere Begriffe zu je 1 … 80). */
export const EINGABE_RAENDER = {
  frage2: { frage: "ab" },
  frage201: { frage: "a".repeat(201) },
  dreiBegriffe: { frage: "Tagesbudget", andere_begriffe: ["eins", "zwei", "drei"] },
  begriff81: { frage: "Tagesbudget", andere_begriffe: ["b".repeat(81)] },
  zusatzfeld: { frage: "Tagesbudget", seite: "funktion-chat.md" },
  zahl: { frage: 42 },
  gueltigGrenzen: {
    frage: "c".repeat(200),
    andere_begriffe: ["d".repeat(80), "e".repeat(80)],
  },
  gueltigKurz: { frage: "abc" },
} as const;

export const DOKU_SCRIPTS = {
  /** Schritt 0 schlägt nach (Treffer), Schritt 1 antwortet mit der Seite. */
  treffer: {
    steps: [{ toolCalls: [doku({ frage: FRAGE_TREFFER })] }, { text: ANTWORT_MIT_SEITE }],
  },
  /** Schritt 0: Text „ENTWURF“ und eine Frage ohne Treffer; Schritt 1 darf nie angefragt werden. */
  nichtsGefunden: {
    steps: [
      { text: ENTWURF, toolCalls: [doku({ frage: FRAGE_FALLE })] },
      { text: ZWEITER_SCHRITT },
    ],
  },
  /** Zwei Fragen ohne Treffer im selben Schritt. */
  zweimalNichts: {
    steps: [
      { text: ENTWURF, toolCalls: [doku({ frage: FRAGE_FALLE }), doku({ frage: FRAGE_FALLE_2 })] },
      { text: ZWEITER_SCHRITT },
    ],
  },
  /** Eine Frage trifft, eine nicht: der Lauf geht weiter. */
  einerTrifft: {
    steps: [
      { text: ENTWURF, toolCalls: [doku({ frage: FRAGE_TREFFER }), doku({ frage: FRAGE_FALLE })] },
      { text: ANTWORT_MIT_SEITE },
    ],
  },
  /** Ein Aufruf mit ungültiger Eingabe (abgelehnt) und einer ohne Treffer: Kurzschluss. */
  abgelehntUndNichts: {
    steps: [
      {
        text: ENTWURF,
        toolCalls: [doku(EINGABE_RAENDER.frage2), doku({ frage: FRAGE_FALLE })],
      },
      { text: ZWEITER_SCHRITT },
    ],
  },
  /** Nur ein abgelehnter Aufruf: das Modell sieht die Ablehnung, der Lauf geht weiter. */
  nurAbgelehnt: {
    steps: [
      { text: ENTWURF, toolCalls: [doku(EINGABE_RAENDER.frage2)] },
      { text: ANTWORT_OHNE_WUNSCH },
    ],
  },
  /** Alle Eingaben an den Rändern in einem Schritt; jede ungültige endet als V-13. */
  eingabeRaender: {
    steps: [
      { toolCalls: Object.values(EINGABE_RAENDER).map((args) => doku({ ...args })) },
      { text: ANTWORT_OHNE_WUNSCH },
    ],
  },
  /** Pfade und Adressen als Frage: nur Suche, kein Treffer. */
  pfade: {
    steps: [{ toolCalls: PFAD_FRAGEN.map((frage) => doku({ frage })) }, { text: ZWEITER_SCHRITT }],
  },
  /** Schritt 0 schlägt nach (findet die Aufforderung), Schritt 1 folgt ihr, Schritt 2 antwortet. */
  einschleusung: {
    steps: [
      { toolCalls: [doku({ frage: "Kompass einstellen" })] },
      { toolCalls: [{ name: "test_schreiben", arguments: { q: "erledigt" } }] },
      { text: ANTWORT_OHNE_WUNSCH },
    ],
  },
  /** Kein Werkzeug-Wunsch, obwohl das Werkzeug angeboten ist. */
  ohneWunsch: { steps: [{ text: ANTWORT_OHNE_WUNSCH }] },
} satisfies Record<string, Script>;
