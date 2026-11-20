/**
 * PaiBot – Vertrag für den Motor, der eine Runde Gespräch erzeugt. Reine Typen, unabhängig von
 * jeder Bibliothek.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { ErrorCode } from "./errors";
import type { Sha256Digest } from "./grundtypen";
import type { ModelId, ProviderId } from "./id";
import type { Route } from "./objects";

declare const resolvedModelBrand: unique symbol;

/** Was sich über einen Modell-Zugang sagen lässt, ohne Geheimnis; so erscheint er in Logs und JSON. */
export interface ResolvedModelSummary {
  readonly providerId: ProviderId;
  readonly modelId: ModelId;
  /** Name des Modells beim Anbieter bzw. in der Datenschleuse. */
  readonly slug: string;
  /** Anzeigename für die Oberfläche, z. B. im Hinweis an der Antwort. */
  readonly label: string;
  readonly route: Route;
  /** OpenAI-kompatible Basis-URL, z. B. die des Anbieters oder der Datenschleuse. */
  readonly baseUrl: string;
  /** Abdruck von Anbieter-ID und Basis-URL, wie er in den Fakten von `modell.anfragen` steht. */
  readonly targetDigest?: Sha256Digest;
}

/**
 * Zugang zu einem Modell für genau einen Lauf. Nur die Anbieter-Schicht erzeugt ihn, und nur
 * gegen eine Berechtigung des Tors; er gilt nur, solange die Berechtigung gilt.
 *
 * Der Schlüssel ist in `fetch` eingeschlossen: `fetch` setzt die Kopfzeile `authorization` selbst
 * und erreicht nur das erlaubte Ziel. Als JSON (`toJSON`) und in Logs erscheint nur die
 * `ResolvedModelSummary`, nie der Schlüssel.
 */
export interface ResolvedModel extends ResolvedModelSummary {
  /**
   * Schlüssel im Klartext.
   *
   * @deprecated Nicht mehr lesen. `fetch` setzt die Anmeldung selbst; das Feld wird leer (`""`)
   * und entfällt danach.
   */
  readonly apiKey: string;
  /** Zusätzliche Kopfzeilen, z. B. die Sitzungs-ID der Unterhaltung für die Datenschleuse. */
  readonly headers: Readonly<Record<string, string>>;
  /** `fetch`, das nur erlaubte Ziele erreicht und die Anmeldung setzt. Der Motor nutzt nur diese Funktion. */
  readonly fetch: typeof fetch;
  /** Ausgabe ohne Geheimnis; wird Pflicht, sobald die Anbieter-Schicht sie setzt. */
  readonly toJSON?: () => ResolvedModelSummary;
  readonly [resolvedModelBrand]: true;
}

/** Was ein Motor kann. */
export interface MotorCapabilities {
  streaming: boolean;
  tools: boolean;
  reasoning: boolean;
  abort: boolean;
  /**
   * `true`, wenn der Motor Werkzeuge selbst ausführt. PaiBot erwartet hier `false`: Werkzeug-Wünsche
   * kommen als Ereignis `tool-call` heraus, ausgeführt wird erst nach dem Tor.
   */
  toolsExecutedInternally: boolean;
}

/** Wert, der sich verlustfrei als JSON übertragen lässt. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

/** Beschreibung eines Werkzeugs für das Modell, ohne Ausführung. */
export interface ToolSpec {
  name: string;
  description: string;
  /** JSON-Schema der Argumente. */
  inputSchema: { [key: string]: JsonValue };
}

/** Wunsch des Modells, ein Werkzeug aufzurufen. */
export interface ToolCall {
  /** Kennung des Aufrufs, über die das Ergebnis zugeordnet wird. */
  callId: string;
  name: string;
  input: JsonValue;
}

/** Ergebnis eines Werkzeug-Aufrufs für die nächste Runde. Abgelehnte Aufrufe haben `denied`. */
export interface ToolResult {
  callId: string;
  name: string;
  status: "ok" | "error" | "denied";
  output: JsonValue;
}

/** Eintrag im Verlauf einer Runde. */
export type TurnMessage =
  | { role: "user"; text: string }
  | { role: "assistant"; text: string; toolCalls?: ToolCall[] }
  | { role: "tool"; results: ToolResult[] };

/**
 * Eingabe für eine Runde. Eine Runde ist genau ein Modell-Schritt: Wünscht das Modell Werkzeuge,
 * endet die Runde mit `tool-call`-Ereignissen; die Ergebnisse kommen in der nächsten Runde als
 * `role: "tool"` im Verlauf zurück.
 */
export interface TurnInput {
  system: string;
  history: TurnMessage[];
  model: ResolvedModel;
  limits: { maxOutputTokens: number; timeoutMs: number };
  /** In der Basis leer bzw. nicht gesetzt. */
  tools?: ToolSpec[];
}

/** Fehlercodes, die ein Motor melden kann. */
export type MotorErrorCode = Extract<
  ErrorCode,
  | "anbieter_nicht_erreichbar"
  | "schluessel_ungueltig"
  | "limit_erreicht"
  | "schleuse_blockiert"
  | "unterbrochen"
  | "intern"
>;

export const MOTOR_ERROR_CODES = [
  "anbieter_nicht_erreichbar",
  "schluessel_ungueltig",
  "limit_erreicht",
  "schleuse_blockiert",
  "unterbrochen",
  "intern",
] as const satisfies readonly MotorErrorCode[];

/** Was der Motor während einer Runde liefert. */
export type MotorEvent =
  | { type: "text-delta"; text: string }
  | ({ type: "tool-call" } & ToolCall)
  | { type: "finish"; finishReason: string; usage: { input: number; output: number } }
  | { type: "error"; code: MotorErrorCode; retryable: boolean; detail?: string };

/**
 * Ein Motor erzeugt eine Runde Gespräch: genau einen Modell-Schritt. Er führt nie selbst ein
 * Werkzeug aus und speichert nichts. Unterbrechen geschieht über `signal`; danach liefert der Motor
 * keine weiteren Ereignisse.
 */
export interface Motor {
  readonly id: string;
  capabilities(): MotorCapabilities;
  runTurn(input: TurnInput, signal: AbortSignal): AsyncIterable<MotorEvent>;
}
