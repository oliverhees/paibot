/**
 * PaiBot – Nahtstellen eines Laufs mit Werkzeugen und die Fakten je Schritt. Jeder dieser Werte
 * entsteht in genau einer Funktion hier; spätere Fassungen (Werkzeuge von Apps, Ketten über
 * mehrere Läufe, Freigaben) ändern nur diese Stellen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { type Database, repo } from "@paibot/db";
import type { DeniedToolCall, GateDenied } from "@paibot/gate";
import type { RunTrigger } from "@paibot/shared/aktionen";
import type { RunId } from "@paibot/shared/ids";
import type { Run, Settings } from "@paibot/shared/objekte";
import type { RegisteredTool, ToolRegistry } from "../werkzeuge/register";

/** Zähler einer Kette: Schritte, Werkzeug-Aufrufe und Token (Eingabe plus Ausgabe). */
export interface ChainCounters {
  schritte: number;
  aufrufe: number;
  token: number;
}

/** Nahtstelle 1: alle Werkzeuge, die dieser Lauf anbieten darf. In dieser Fassung: das Register. */
export function werkzeugeFuerLauf(_run: Run, registry: ToolRegistry): readonly RegisteredTool[] {
  return registry.tools;
}

/** Nahtstelle 2: Zähler zu Beginn des Laufs. In dieser Fassung ist jede Kette ein Lauf: alles 0. */
export function kettenStand(_run: Run): ChainCounters {
  return { schritte: 0, aufrufe: 0, token: 0 };
}

/**
 * Nahtstelle 3: Hat die tatsächlich gesendete Anfrage fremde Inhalte? Frisch aus der Datenbank,
 * immer über `tool_calls.run_id`, nie über die Nachricht:
 * - Läufe, deren End-Antwort im gesendeten Verlauf steht (`historyRunIds`): ein Aufruf mit
 *   `untrusted_input` oder ein erfolgreicher Aufruf mit `foreign_content`;
 * - dieser Lauf: ein erfolgreicher Aufruf mit `foreign_content`.
 * Fällt eine End-Antwort aus dem Verlauf, zählt ihr Lauf nicht mehr.
 */
export async function untrustedInput(
  db: Database,
  input: { runId: RunId; historyRunIds: readonly RunId[] },
): Promise<boolean> {
  const own = await repo.toolCalls.listForRun(db, input.runId);
  if (own.some((call) => call.foreignContent === true && call.status === "succeeded")) return true;
  for (const runId of new Set(input.historyRunIds)) {
    if (runId === input.runId) continue;
    const calls = await repo.toolCalls.listForRun(db, runId);
    const foreign = calls.some(
      (call) =>
        call.untrustedInput === true ||
        (call.foreignContent === true && call.status === "succeeded"),
    );
    if (foreign) return true;
  }
  return false;
}

/** Nahtstelle 4: was nach „fragen“ des Tors geschieht. In dieser Fassung immer „abgelehnt“. */
export function nachFrage(denied: GateDenied): { art: "abgelehnt"; decision: DeniedToolCall } {
  return { art: "abgelehnt", decision: denied.toolCallDecision() };
}

/** Auslöser des Laufs. In dieser Fassung gibt es nur den Chat. */
export function laufAusloeser(_run: Run): RunTrigger {
  return "chat";
}

/** Größter Wert je gemeldeter Token-Zahl; mehr gilt als dieser Wert. */
export const MAX_REPORTED_TOKENS = 1_000_000_000;

/** Eine gemeldete oder geschätzte Token-Zahl als sichere Ganzzahl in 0 … 1 000 000 000. */
export function kappeToken(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Math.floor(value), MAX_REPORTED_TOKENS);
}

/** Summe zweier Zähler, nie über `Number.MAX_SAFE_INTEGER`. */
export function addiereToken(a: number, b: number): number {
  return Math.min(a + b, Number.MAX_SAFE_INTEGER);
}

/** Mindest-Ausgabe eines Schritts, auch wenn der Rest der Lauf-Grenze kleiner ist. */
export const MIN_STEP_OUTPUT_TOKENS = 1000;

/**
 * Ausgabegrenze eines Schritts: `min(Ausgabegrenze des Bots, max(Rest, 1 000))` mit
 * `Rest = maxRunTokens − runTokens − ⌈Eingabe ÷ 4⌉`. Ist der Rest kleiner als 1 000, liegt die
 * Schätzung über der Lauf-Grenze, und G-18 lehnt den Schritt ab.
 */
export function ausgabeGrenze(input: {
  botMaxOutputTokens: number;
  maxRunTokens: number;
  runTokens: number;
  inputChars: number;
}): number {
  const rest = input.maxRunTokens - input.runTokens - Math.ceil(input.inputChars / 4);
  return Math.max(1, Math.min(input.botMaxOutputTokens, Math.max(rest, MIN_STEP_OUTPUT_TOKENS)));
}

/** Was `schrittFakten` braucht. */
export interface SchrittEingabe {
  run: Run;
  settings: Pick<Settings, "maxStepsPerRun" | "maxTokensPerRun">;
  step: number;
  stand: ChainCounters;
  inputChars: number;
  /** Ausgabegrenze dieses Schritts (`ausgabeGrenze`). */
  ausgabe: number;
  /** Zahl der angebotenen Werkzeuge in diesem Schritt. */
  toolCount: number;
  untrustedInput: boolean;
}

/** Die Lauf-Fakten von `modell.anfragen`, die von Schritt zu Schritt wechseln. */
export interface SchrittFakten {
  step: number;
  maxSteps: number;
  runTokens: number;
  stepTokenEstimate: number;
  maxRunTokens: number;
  toolCount: number;
  untrustedInput: boolean;
  trigger: RunTrigger;
}

/** Die Lauf-Fakten eines Schritts; kein anderer Code setzt diese Werte. */
export function schrittFakten(input: SchrittEingabe): SchrittFakten {
  return {
    step: input.step,
    maxSteps: input.settings.maxStepsPerRun,
    runTokens: Math.min(input.stand.token, Number.MAX_SAFE_INTEGER),
    stepTokenEstimate: addiereToken(Math.ceil(input.inputChars / 4), input.ausgabe),
    maxRunTokens: input.settings.maxTokensPerRun,
    toolCount: input.toolCount,
    untrustedInput: input.untrustedInput,
    trigger: laufAusloeser(input.run),
  };
}

/** Tagesverbrauch für das Tor: Wert vom Lauf-Anfang plus Verbrauch dieses Laufs. */
export function tokensHeute(amAnfang: number, stand: ChainCounters): number {
  return addiereToken(amAnfang, stand.token);
}
