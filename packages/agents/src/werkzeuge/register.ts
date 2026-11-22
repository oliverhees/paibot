/**
 * PaiBot – Register der Werkzeuge: prüft jede Beschreibung beim Aufbau, rechnet ihren Abdruck
 * genau einmal, friert alles ein und hält den Platzhalter für unbekannte Werkzeuge.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { toolDefinitionDigest } from "@paibot/gate";
import { TOOL_GATE_ACTIONS } from "@paibot/shared/aktionen";
import type { Sha256Digest } from "@paibot/shared/grundtypen";
import type { JsonValue, ToolSpec } from "@paibot/shared/motor";
import { TOOL_NAME_PATTERN } from "@paibot/shared/objekte";
import type { ToolDefinition, ToolKey } from "@paibot/shared/werkzeug";
import { toolKeySchema } from "@paibot/shared/werkzeug";
import { z } from "zod";
import { hasUnwanted } from "../run/bereinigen";
import { builtinTools } from "./eingebaut";

/** Ein Werkzeug im Register: eingefrorene Beschreibung, Abdruck und Angebot an das Modell. */
export interface RegisteredTool {
  readonly definition: ToolDefinition<JsonValue, JsonValue>;
  /** Abdruck der Beschreibung, einmal beim Aufbau gerechnet. */
  readonly toolDigest: Sha256Digest;
  /** So sieht das Modell das Werkzeug (Name, Beschreibung, JSON-Schema der Eingabe). */
  readonly spec: ToolSpec;
}

/** Kennung, Abdruck und Art, mit denen ein Aufruf eines unbekannten Werkzeugs durchs Tor geht. */
export interface ToolPlaceholder {
  readonly toolKey: ToolKey;
  readonly toolDigest: Sha256Digest;
  readonly source: "eingebaut";
  /** Streng angenommen: Ein unbekanntes Werkzeug könnte schreiben, nach außen wirken, Fremdes liefern. */
  readonly kind: "schreiben";
  readonly reach: "nach_aussen";
  readonly foreignContent: true;
}

export interface ToolRegistry {
  /** Alle Werkzeuge in fester Reihenfolge. */
  readonly tools: readonly RegisteredTool[];
  byModelName(name: string): RegisteredTool | undefined;
  readonly placeholder: ToolPlaceholder;
}

/** Kennung des Platzhalters für unbekannte Werkzeuge; kein echtes Werkzeug darf sie tragen. */
export const PLACEHOLDER_TOOL_KEY: ToolKey = "eingebaut/unbekannt";

/** Längste Beschreibung eines Werkzeugs an das Modell. */
export const MAX_TOOL_DESCRIPTION_CHARS = 1000;

/** Fehler beim Aufbau des Registers; der Start bricht damit ab. */
export class ToolRegistryError extends Error {
  constructor(reason: string) {
    super(`Werkzeug-Register: ${reason}`);
    this.name = "ToolRegistryError";
  }
}

/** Feste Beschreibung des Platzhalters; nur ihr Abdruck geht in die Fakten. */
const PLACEHOLDER_DESCRIPTION = {
  description: "Platzhalter für einen Werkzeug-Namen, den PaiBot nicht kennt.",
  foreignContent: true,
  inputSchema: {},
  key: PLACEHOLDER_TOOL_KEY,
  kind: "schreiben",
  modelName: "unbekannt",
  reach: "nach_aussen",
  source: "eingebaut",
  version: 1,
} as const;

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const entry of Object.values(value)) deepFreeze(entry);
    Object.freeze(value);
  }
  return value;
}

function isStrictObject(schema: unknown): boolean {
  if (!(schema instanceof z.ZodObject)) return false;
  const catchall = (
    schema as unknown as { _zod: { def: { catchall?: { _zod?: { def?: { type?: string } } } } } }
  )._zod.def.catchall;
  return catchall?._zod?.def?.type === "never";
}

function check(def: ToolDefinition<JsonValue, JsonValue>): void {
  if (!toolKeySchema.safeParse(def.key).success) throw new ToolRegistryError("Kennung ungültig");
  if (def.key === PLACEHOLDER_TOOL_KEY) throw new ToolRegistryError("Kennung des Platzhalters");
  if (!TOOL_NAME_PATTERN.test(def.modelName) || def.modelName.includes("__")) {
    throw new ToolRegistryError("Name ungültig");
  }
  if (
    def.description.length === 0 ||
    def.description.length > MAX_TOOL_DESCRIPTION_CHARS ||
    hasUnwanted(def.description)
  ) {
    throw new ToolRegistryError("Beschreibung ungültig");
  }
  if (!(TOOL_GATE_ACTIONS as readonly string[]).includes(def.gateAction)) {
    throw new ToolRegistryError("Aktion des Tors unbekannt");
  }
  if (!isStrictObject(def.input)) throw new ToolRegistryError("Eingabe ist kein strenges Objekt");
  if (!Number.isSafeInteger(def.version) || def.version < 1) {
    throw new ToolRegistryError("Fassung ungültig");
  }
  const { timeoutMs, maxOutputChars } = def.limits;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new ToolRegistryError("Zeitgrenze");
  if (!Number.isSafeInteger(maxOutputChars) || maxOutputChars < 1) {
    throw new ToolRegistryError("Ergebnis-Grenze");
  }
}

/**
 * Baut ein Register aus Beschreibungen. Wirft (`ToolRegistryError`) bei doppelter Kennung oder
 * doppeltem Namen, ungültigem Namen oder Namen mit „__“, ungültiger Beschreibung (leer, über
 * 1 000 Zeichen, Steuer-, Bidi- oder unsichtbare Zeichen), unbekannter Aktion des Tors, Eingabe
 * ohne strenges Objekt und bei der Kennung des Platzhalters. Der Abdruck jeder Beschreibung wird
 * hier einmal gerechnet; Beschreibung, Grenzen und Angebot sind danach eingefroren.
 */
export async function createToolRegistry(
  defs: readonly ToolDefinition<JsonValue, JsonValue>[],
): Promise<ToolRegistry> {
  const keys = new Set<string>();
  const names = new Map<string, RegisteredTool>();
  const tools: RegisteredTool[] = [];
  for (const original of defs) {
    check(original);
    if (keys.has(original.key)) throw new ToolRegistryError("Kennung doppelt");
    if (names.has(original.modelName)) throw new ToolRegistryError("Name doppelt");
    keys.add(original.key);
    const inputSchema = z.toJSONSchema(original.input) as { [key: string]: JsonValue };
    const definition = Object.freeze({
      ...original,
      limits: Object.freeze({ ...original.limits }),
    }) as ToolDefinition<JsonValue, JsonValue>;
    const toolDigest = await toolDefinitionDigest({
      description: definition.description,
      foreignContent: definition.foreignContent,
      inputSchema,
      key: definition.key,
      kind: definition.kind,
      modelName: definition.modelName,
      reach: definition.reach,
      source: definition.source,
      version: definition.version,
    });
    const spec: ToolSpec = deepFreeze({
      name: definition.modelName,
      description: definition.description,
      inputSchema,
    });
    const tool: RegisteredTool = Object.freeze({ definition, toolDigest, spec });
    tools.push(tool);
    names.set(definition.modelName, tool);
  }
  const placeholder: ToolPlaceholder = Object.freeze({
    toolKey: PLACEHOLDER_TOOL_KEY,
    toolDigest: await toolDefinitionDigest(PLACEHOLDER_DESCRIPTION),
    source: "eingebaut",
    kind: "schreiben",
    reach: "nach_aussen",
    foreignContent: true,
  } as const);
  return Object.freeze({
    tools: Object.freeze(tools),
    byModelName: (name: string) => names.get(name),
    placeholder,
  });
}

/**
 * Das Register der Auslieferung: die eingebauten Werkzeuge. Zusätzlich gilt für jedes: Quelle
 * `eingebaut` und keine fremden Inhalte; sonst bricht der Start ab.
 */
export async function createShippedRegistry(
  defs: readonly ToolDefinition<JsonValue, JsonValue>[] = builtinTools(),
): Promise<ToolRegistry> {
  for (const def of defs) {
    if (def.source !== "eingebaut") throw new ToolRegistryError("Quelle in der Auslieferung");
    if (def.foreignContent) throw new ToolRegistryError("fremde Inhalte in der Auslieferung");
  }
  return createToolRegistry(defs);
}

let empty: Promise<ToolRegistry> | undefined;

/** Das leere Register (für Läufe ohne Angabe in `RunDeps.tools`). */
export function emptyToolRegistry(): Promise<ToolRegistry> {
  empty ??= createToolRegistry([]);
  return empty;
}
