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
import type { AppId, AppToolId } from "@paibot/shared/ids";
import type { JsonValue, ToolSpec } from "@paibot/shared/motor";
import { TOOL_NAME_PATTERN } from "@paibot/shared/objekte";
import type { ToolDefinition, ToolKey } from "@paibot/shared/werkzeug";
import { toolKeySchema } from "@paibot/shared/werkzeug";
import { z } from "zod";
import { cleanText, hasUnwanted } from "../run/bereinigen";
import { builtinTools } from "./eingebaut";

/** Woher ein Werkzeug aus einer App kommt; nur bei Werkzeugen mit Quelle `mcp` gesetzt. */
export interface AppBezug {
  readonly appId: AppId;
  readonly appToolId: AppToolId;
  /** Name beim Server; geht nie an das Modell. */
  readonly originalName: string;
  /** Kurzname der App (Spalte `server` der Aufrufe). */
  readonly kurzname: string;
}

/** Ein Werkzeug im Register: eingefrorene Beschreibung, Abdruck und Angebot an das Modell. */
export interface RegisteredTool {
  /** Nur bei Werkzeugen aus einer App (Quelle `mcp`). */
  readonly app?: AppBezug;
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

/** Ein Werkzeug, das beim Aufbau nicht ins Register kam (nur mit `ausschliessen`). */
export interface ExcludedTool {
  /** Kennung, wie die Beschreibung sie nannte (höchstens 128 Zeichen). */
  readonly key: string;
  /** Warum es fehlt; immer ein `ToolRegistryError` mit festem Text. */
  readonly fehler: ToolRegistryError;
}

/** Optionen für `createToolRegistry`. */
export interface ToolRegistryOptions {
  /**
   * Ein Werkzeug, dessen Beschreibung nicht passt oder dessen Abdruck sich nicht rechnen lässt,
   * wird ausgeschlossen und in `ausgeschlossen` gemeldet; die anderen bleiben. Ohne die Option
   * (Standard) bricht der Aufbau beim ersten Fehler mit einem `ToolRegistryError` ab. Gedacht für
   * Werkzeuge aus fremden Quellen: Ein einzelnes kaputtes Schema darf nicht alle anderen mitreißen.
   */
  ausschliessen?: boolean;
}

export interface ToolRegistry {
  /** Alle Werkzeuge in fester Reihenfolge. */
  readonly tools: readonly RegisteredTool[];
  /** Werkzeuge, die beim Aufbau ausgeschlossen wurden (leer ohne `ausschliessen`). */
  readonly ausgeschlossen: readonly ExcludedTool[];
  byModelName(name: string): RegisteredTool | undefined;
  readonly placeholder: ToolPlaceholder;
}

/** Kennung des Platzhalters für unbekannte Werkzeuge; kein echtes Werkzeug darf sie tragen. */
export const PLACEHOLDER_TOOL_KEY: ToolKey = "eingebaut/unbekannt";

/** Längste Beschreibung eines Werkzeugs an das Modell. */
export const MAX_TOOL_DESCRIPTION_CHARS = 1000;

/** Fehler beim Aufbau des Registers; der Start bricht damit ab. */
export class ToolRegistryError extends Error {
  /** Der feste Grund ohne Vorsatz; nie Text aus einer Beschreibung oder einer Bibliothek. */
  readonly grund: string;
  constructor(reason: string) {
    super(`Werkzeug-Register: ${reason}`);
    this.name = "ToolRegistryError";
    this.grund = reason;
  }
}

/**
 * Macht aus jedem Fehler beim Aufbau einen neuen `ToolRegistryError` aus festen Texten. Ein
 * Fehler, der kein `ToolRegistryError` ist, bekommt den festen Grund „Beschreibung nicht lesbar“.
 * Der Test auf die Klasse steht in einem eigenen `try`: Ein Objekt, dessen Prüfung wirft (etwa ein
 * Proxy mit `getPrototypeOf`), lässt nie seinen Text heraus.
 */
export function festerFehler(error: unknown): ToolRegistryError {
  try {
    if (error instanceof ToolRegistryError) return new ToolRegistryError(error.grund);
  } catch {
    // fällt auf den festen Grund zurück
  }
  return new ToolRegistryError("Beschreibung nicht lesbar");
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

/** Namen, die jedes Objekt über seinen Prototyp schon „hat“ (`constructor`, `toString`, `__proto__` …). */
const PROTOTYPE_NAMES: ReadonlySet<string> = new Set(Object.getOwnPropertyNames(Object.prototype));

/** Tiefste Verschachtelung, die das Register liest; darüber gilt das Schema als nicht lesbar. */
const MAX_SCHEMA_DEPTH = 32;

type SchemaDef = { type?: string } & Record<string, unknown>;

/** Die festen Namen, die ein Schlüssel-Schema vorgibt; leer bei freien Schlüsseln. */
function festeSchluessel(schema: unknown): string[] {
  if (typeof schema !== "object" || schema === null) return [];
  const values = (schema as { _zod?: { values?: unknown } })._zod?.values;
  if (!(values instanceof Set)) return [];
  return Array.from(values, String);
}

/**
 * Hat das Schema auf irgendeiner Ebene ein Feld mit einem Namen aus `Object.prototype`? zod liest
 * ein fehlendes Feld über den Prototyp: `z.object({ constructor: z.unknown() }).safeParse({})`
 * gelingt mit einer Funktion als Wert. Das gilt auf jeder Ebene, auch in `optional`, Liste,
 * Vereinigung, Schnitt, Tupel, Schlüssel-Wert-Liste und `lazy`. Das Register geht das Schema
 * deshalb ganz durch (jedes Schema nur einmal, ein Kreis über `lazy` endet). Ein Schema, das tiefer
 * als `MAX_SCHEMA_DEPTH` liegt oder sich nicht lesen lässt (`lazy` wirft), wird mit einem eigenen
 * festen Grund abgewiesen (`ToolRegistryError`, „Schema nicht lesbar“).
 */
function hasPrototypeField(schema: unknown, seen = new Set<unknown>(), depth = 0): boolean {
  if (depth > MAX_SCHEMA_DEPTH) throw new ToolRegistryError("Schema nicht lesbar");
  if (typeof schema !== "object" || schema === null || seen.has(schema)) return false;
  const def = (schema as { _zod?: { def?: SchemaDef } })._zod?.def;
  if (def === undefined) return false;
  seen.add(schema);
  const next = (child: unknown) => hasPrototypeField(child, seen, depth + 1);
  const all = (children: unknown) => Array.isArray(children) && children.some(next);
  switch (def.type) {
    case "object": {
      const shape = def.shape as Record<string, unknown> | undefined;
      if (shape === undefined) return false;
      return (
        Object.getOwnPropertyNames(shape).some((name) => PROTOTYPE_NAMES.has(name)) ||
        Object.getOwnPropertyNames(shape).some((name) => next(shape[name])) ||
        next(def.catchall)
      );
    }
    case "array":
      return next(def.element);
    case "optional":
    case "nullable":
    case "default":
    case "prefault":
    case "nonoptional":
    case "readonly":
    case "catch":
    case "promise":
    case "success":
      return next(def.innerType);
    case "union":
      return all(def.options);
    case "intersection":
      return next(def.left) || next(def.right);
    case "tuple":
      return all(def.items) || next(def.rest);
    case "record":
      // Feste Schlüssel legt zod als eigene Felder an, auch `constructor`. Welche es sind, sagt das
      // Schema selbst (`_zod.values`), egal wie es umhüllt ist (`catch`, `prefault`, `pipe` …).
      return (
        festeSchluessel(def.keyType).some((name) => PROTOTYPE_NAMES.has(name)) ||
        next(def.keyType) ||
        next(def.valueType)
      );
    case "map":
      return next(def.keyType) || next(def.valueType);
    case "set":
      return next(def.valueType);
    case "pipe":
      return next(def.in) || next(def.out);
    case "lazy": {
      let inner: unknown;
      try {
        inner = (def.getter as () => unknown)();
      } catch {
        // Der Text der Bibliothek oder des fremden Codes wird nie weitergegeben.
        throw new ToolRegistryError("Schema nicht lesbar");
      }
      return next(inner);
    }
    default:
      return false;
  }
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
  if (hasPrototypeField(def.input) || hasPrototypeField(def.output)) {
    throw new ToolRegistryError("Feldname aus Object.prototype");
  }
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
 * Die Kennung für die Liste der Ausgeschlossenen: nur ein Text, nie ein Aufruf von `toString` oder
 * eines Getters (fremder Code kann werfen), und nur, wenn er das Schema für Werkzeug-Kennungen
 * erfüllt (kein Zeilenumbruch, kein Tabulator, höchstens 140 Zeichen). Alles andere bekommt einen
 * festen Ersatz.
 */
export function kennungFuerMeldung(key: unknown): string {
  const ersatz = "(ohne Kennung)";
  try {
    if (typeof key !== "string" || !toolKeySchema.safeParse(key).success) return ersatz;
    return Array.from(cleanText(key)).slice(0, 128).join("") || ersatz;
  } catch {
    return ersatz;
  }
}

/** Prüft eine Beschreibung und baut ihr Werkzeug im Register (ohne es einzutragen). */
async function buildTool(
  original: ToolDefinition<JsonValue, JsonValue>,
  keys: ReadonlySet<string>,
  names: ReadonlyMap<string, RegisteredTool>,
): Promise<RegisteredTool> {
  check(original);
  if (keys.has(original.key)) throw new ToolRegistryError("Kennung doppelt");
  if (names.has(original.modelName)) throw new ToolRegistryError("Name doppelt");
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
  return Object.freeze({ definition, toolDigest, spec });
}

/**
 * Baut ein Register aus Beschreibungen. Wirft (`ToolRegistryError`) bei doppelter Kennung oder
 * doppeltem Namen, ungültigem Namen oder Namen mit „__“, ungültiger Beschreibung (leer, über
 * 1 000 Zeichen, Steuer-, Bidi- oder unsichtbare Zeichen), unbekannter Aktion des Tors, Eingabe
 * ohne strenges Objekt, bei einem Feld in Eingabe- oder Ausgabe-Schema (auf jeder Ebene), das wie
 * ein Name aus `Object.prototype` heißt, und bei der Kennung des Platzhalters. Der Abdruck jeder Beschreibung wird
 * hier einmal gerechnet; Beschreibung, Grenzen und Angebot sind danach eingefroren. Jeder Fehler ist
 * ein `ToolRegistryError` mit festem Text (nie der Text der Bibliothek). Mit `ausschliessen` fällt
 * nur das fehlerhafte Werkzeug heraus (siehe `ausgeschlossen`), die anderen bleiben.
 */
export async function createToolRegistry(
  defs: readonly ToolDefinition<JsonValue, JsonValue>[],
  options: ToolRegistryOptions = {},
): Promise<ToolRegistry> {
  const keys = new Set<string>();
  const names = new Map<string, RegisteredTool>();
  const tools: RegisteredTool[] = [];
  const ausgeschlossen: ExcludedTool[] = [];
  for (const original of defs) {
    try {
      const tool = await buildTool(original, keys, names);
      keys.add(tool.definition.key);
      names.set(tool.definition.modelName, tool);
      tools.push(tool);
    } catch (error) {
      // Ein Fehler der Bibliothek (etwa beim Umwandeln des Schemas) trägt nie seinen Text weiter;
      // eingetragen wird immer ein neuer Fehler aus festen Texten.
      const fehler = festerFehler(error);
      if (options.ausschliessen !== true) throw fehler;
      let kennung: unknown;
      try {
        kennung = (original as { key?: unknown } | null | undefined)?.key;
      } catch {
        kennung = undefined;
      }
      ausgeschlossen.push(Object.freeze({ key: kennungFuerMeldung(kennung), fehler }));
    }
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
    ausgeschlossen: Object.freeze(ausgeschlossen),
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
