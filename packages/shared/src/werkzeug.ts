/**
 * PaiBot – Verträge für Werkzeuge: Beschreibung eines Werkzeugs, Kontext beim Ausführen, Ausgang
 * und die feste Hülle, in der ein Ergebnis an das Modell geht. Nur Typen und Schemas; Werkzeuge
 * selbst gibt es in dieser Fassung noch nicht.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { z } from "zod";
import type { TOOL_GATE_ACTIONS, TOOL_REACHES } from "./actions";
import { errorCodeSchema } from "./errors";
import type { GatePermit } from "./gate";
import type { TextKey } from "./i18n";
import type { BotId, ConversationId, RunId } from "./id";
import type { JsonValue } from "./motor";
import { type TOOL_KINDS, type TOOL_SOURCES, type ToolKey, toolKeySchema } from "./objects";
import { boundedJsonSchema } from "./receipts";

// Die Kennung steht in `objects.ts`, weil die Fakten der Aktionen sie brauchen.
export { TOOL_KEY_PATTERN, type ToolKey, toolKeySchema } from "./objects";

/** Anschlüsse, die ein Werkzeug beim Ausführen bekommt. In dieser Fassung keine. */
// biome-ignore lint/suspicious/noEmptyInterface: wird mit den ersten Werkzeugen gefüllt
export interface ToolPorts {}

/** Was ein Werkzeug beim Ausführen bekommt: Abbruch, Berechtigung des Tors, Bezug, Anschlüsse. */
export interface ToolContext {
  signal: AbortSignal;
  permit: GatePermit<"werkzeug.aufrufen">;
  conversationId: ConversationId;
  runId: RunId;
  botId: BotId;
  ports: ToolPorts;
}

/** Fehler, die ein Werkzeug selbst meldet. */
export type ToolErrorCode =
  | "werkzeug_zeitgrenze"
  | "werkzeug_fehler"
  | "werkzeug_eingabe_ungueltig";

/** Ausgang eines Werkzeugs. */
export type ToolOutcome<O> = { status: "ok"; output: O } | { status: "error"; code: ToolErrorCode };

/** Verweis auf eine Fundstelle (z. B. ein Abschnitt der Doku). */
export interface ToolSourceRef {
  seite: string;
  anker: string;
  titel: string;
}

/** Beschreibung eines Werkzeugs: was das Modell sieht, wie es wirkt, wie es läuft. */
export interface ToolDefinition<I extends JsonValue, O extends JsonValue> {
  key: ToolKey;
  /** Name für das Modell (`TOOL_NAME_PATTERN`), eindeutig über alle Quellen. */
  modelName: string;
  /** Steigt bei jeder Änderung an Beschreibung, Schema oder Wirkung. */
  version: number;
  title: TextKey;
  /** Beschreibung an das Modell: fest, höchstens 1 000 Zeichen, ohne Steuerzeichen. */
  description: string;
  source: (typeof TOOL_SOURCES)[number];
  kind: (typeof TOOL_KINDS)[number];
  reach: (typeof TOOL_REACHES)[number];
  /** Liefert Inhalte von außerhalb von PaiBot. */
  foreignContent: boolean;
  gateAction: (typeof TOOL_GATE_ACTIONS)[number];
  /** Schema der Eingabe: streng, alle Längen begrenzt. */
  input: z.ZodType<I>;
  output: z.ZodType<O>;
  limits: { timeoutMs: number; maxOutputChars: number; maxCallsPerRun?: number };
  run(input: I, ctx: ToolContext): Promise<ToolOutcome<O>>;
  sources?(output: O): ToolSourceRef[];
}

/**
 * Feste Hülle eines Werkzeug-Ergebnisses an das Modell, nur als Nachricht mit `role: "tool"`.
 * Entweder Daten (`status: "ok"`, `inhalt` als begrenztes JSON) oder ein Fehler bzw. eine
 * Ablehnung mit Code und festem Text.
 */
export const toolEnvelopeSchema = z.discriminatedUnion("status", [
  z.strictObject({
    paibot: z.literal("werkzeug-ergebnis"),
    werkzeug: toolKeySchema,
    art: z.literal("daten"),
    status: z.literal("ok"),
    inhalt: boundedJsonSchema,
    gekuerzt: z.boolean().optional(),
  }),
  z.strictObject({
    paibot: z.literal("werkzeug-ergebnis"),
    werkzeug: toolKeySchema,
    art: z.literal("daten"),
    status: z.enum(["fehler", "abgelehnt"]),
    code: errorCodeSchema,
    text: z.string().min(1).max(500),
  }),
]);
export type ToolEnvelope = z.infer<typeof toolEnvelopeSchema>;

/** Nachricht mit Werkzeug-Ergebnis im Verlauf: `role` ist immer `"tool"`; es gibt keinen anderen Weg. */
export interface ToolResultMessage {
  role: "tool";
  callId: string;
  envelope: ToolEnvelope;
}
