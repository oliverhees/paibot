/**
 * PaiBot – Register eines Laufs um die bestätigten Werkzeuge aus Apps erweitern
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import type { Sha256Digest } from "@paibot/shared/grundtypen";
import type { AppId, AppToolId } from "@paibot/shared/ids";
import type { JsonValue, ToolSpec } from "@paibot/shared/motor";
import { TOOL_NAME_PATTERN } from "@paibot/shared/objekte";
import type { ToolDefinition, ToolKey } from "@paibot/shared/werkzeug";
import { toolKeySchema } from "@paibot/shared/werkzeug";
import { z } from "zod";
import type { AppAufrufErgebnis } from "../run/app-anschluss";
import { cleanText, hasUnwanted, jsonUeberGrenzen } from "../run/bereinigen";
import {
  type ExcludedTool,
  MAX_TOOL_DESCRIPTION_CHARS,
  PLACEHOLDER_TOOL_KEY,
  type RegisteredTool,
  type ToolRegistry,
  ToolRegistryError,
} from "./register";

/** Ein bestätigtes, unverändertes Werkzeug einer App, wie die Steuerung es aus der Datenbank kennt. */
export interface AppWerkzeugEintrag {
  readonly appId: AppId;
  readonly appToolId: AppToolId;
  /** Name beim Server; geht nie an das Modell. */
  readonly originalName: string;
  readonly kurzname: string;
  readonly toolKey: ToolKey;
  /** Name für das Modell: `<kurzname>__<name>`. */
  readonly modelName: string;
  readonly version: number;
  /** Abdruck der Rohform aus der Datenbank (nicht neu gerechnet). */
  readonly toolDigest: Sha256Digest;
  readonly description: string;
  /** Das gekürzte Schema, das der Besitzer gesehen hat und das an das Modell geht. */
  readonly inputSchema: Record<string, JsonValue>;
  /** Prüft die Argumente gegen das Prüf-Schema der Schicht; muss nicht werfen, tut es aber nie nach außen. */
  pruefeArgumente(argumente: unknown): boolean;
  /** Der Aufruf bei der App; wirft nie. */
  rufeAuf(argumente: JsonValue, signal: AbortSignal): Promise<AppAufrufErgebnis>;
}

/** Zeitgrenze des Werkzeugs: knapp über der eigenen Frist der Schicht, damit deren Satz gilt. */
export const APP_TOOL_TIMEOUT_MS = 40_000;
/** Obergrenze der Ergebnis-Zeichen eines App-Werkzeugs (die Grenzen des Laufs gelten zusätzlich). */
export const APP_TOOL_MAX_OUTPUT_CHARS = 1_024_000;

/** Höchstzahl der Werkzeuge aus Apps in einem Lauf; der Rest wird nicht angeboten. */
export const MAX_APP_WERKZEUGE_JE_LAUF = 32;

/** Ein Werkzeug, das nicht ins Register kam, mit der App, zu der es gehört. */
export interface AppAusgeschlossen extends ExcludedTool {
  readonly appId: AppId;
}

const DIGEST = /^sha256:[0-9a-f]{64}$/u;
const MAX_KENNUNG_ZEICHEN = 128;

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const entry of Object.values(value)) deepFreeze(entry);
    Object.freeze(value);
  }
  return value;
}

/** Kennung für die Meldung: nur ein Text, bereinigt, höchstens 128 Zeichen, sonst fester Ersatz. */
function kennungFuerMeldung(eintrag: unknown): string {
  const ersatz = "(ohne Kennung)";
  try {
    const key = (eintrag as { toolKey?: unknown } | null | undefined)?.toolKey;
    if (typeof key !== "string") return ersatz;
    const sauber = Array.from(cleanText(key)).slice(0, MAX_KENNUNG_ZEICHEN).join("");
    return sauber === "" ? ersatz : sauber;
  } catch {
    return ersatz;
  }
}

/** Prüft einen Eintrag; wirft `ToolRegistryError` mit festem Text. */
function pruefe(
  eintrag: AppWerkzeugEintrag,
  belegteNamen: ReadonlySet<string>,
  belegteKennungen: ReadonlySet<string>,
): void {
  if (
    typeof eintrag.modelName !== "string" ||
    !TOOL_NAME_PATTERN.test(eintrag.modelName) ||
    !eintrag.modelName.includes("__")
  ) {
    throw new ToolRegistryError("Name ungültig");
  }
  if (belegteNamen.has(eintrag.modelName)) throw new ToolRegistryError("Name doppelt");
  if (
    !toolKeySchema.safeParse(eintrag.toolKey).success ||
    eintrag.toolKey === PLACEHOLDER_TOOL_KEY ||
    !eintrag.toolKey.startsWith(`mcp/${eintrag.kurzname}/`)
  ) {
    throw new ToolRegistryError("Kennung ungültig");
  }
  if (belegteKennungen.has(eintrag.toolKey)) throw new ToolRegistryError("Kennung doppelt");
  if (
    typeof eintrag.description !== "string" ||
    eintrag.description.length === 0 ||
    eintrag.description.length > MAX_TOOL_DESCRIPTION_CHARS ||
    hasUnwanted(eintrag.description)
  ) {
    throw new ToolRegistryError("Beschreibung ungültig");
  }
  if (typeof eintrag.toolDigest !== "string" || !DIGEST.test(eintrag.toolDigest)) {
    throw new ToolRegistryError("Abdruck ungültig");
  }
  if (!Number.isSafeInteger(eintrag.version) || eintrag.version < 1) {
    throw new ToolRegistryError("Fassung ungültig");
  }
  const schema: unknown = eintrag.inputSchema;
  // Größe und Tiefe, bevor irgendetwas mit dem fremden Schema gerechnet wird.
  if (
    typeof schema !== "object" ||
    schema === null ||
    Array.isArray(schema) ||
    jsonUeberGrenzen(schema)
  ) {
    throw new ToolRegistryError("Schema nicht lesbar");
  }
}

function baue(eintrag: AppWerkzeugEintrag): RegisteredTool {
  const input = z.custom<JsonValue>((wert) => {
    try {
      return eintrag.pruefeArgumente(wert) === true;
    } catch {
      // Der Text eines Fehlers aus dem Prüfer geht nie weiter.
      return false;
    }
  });
  const definition = Object.freeze({
    key: eintrag.toolKey,
    modelName: eintrag.modelName,
    version: eintrag.version,
    title: "schritte.werkzeug.titel.unbekannt",
    description: eintrag.description,
    source: "mcp",
    kind: "lesen",
    reach: "nach_aussen",
    foreignContent: true,
    gateAction: "werkzeug.aufrufen",
    input,
    output: z.string(),
    limits: Object.freeze({
      timeoutMs: APP_TOOL_TIMEOUT_MS,
      maxOutputChars: APP_TOOL_MAX_OUTPUT_CHARS,
    }),
    async run(wert: JsonValue, kontext: { signal: AbortSignal }) {
      const ergebnis = await eintrag.rufeAuf(wert, kontext.signal);
      if (ergebnis.status === "ok") return { status: "ok" as const, output: ergebnis.text };
      return { status: "error" as const, code: "werkzeug_fehler" as const };
    },
  }) as unknown as ToolDefinition<JsonValue, JsonValue>;
  const spec: ToolSpec = deepFreeze({
    name: eintrag.modelName,
    description: eintrag.description,
    inputSchema: structuredClone(eintrag.inputSchema),
  });
  return Object.freeze({
    definition,
    toolDigest: eintrag.toolDigest,
    spec,
    app: Object.freeze({
      appId: eintrag.appId,
      appToolId: eintrag.appToolId,
      originalName: eintrag.originalName,
      kurzname: eintrag.kurzname,
    }),
  });
}

/**
 * Baut aus dem Register der eingebauten Werkzeuge und den bestätigten Werkzeugen der Apps das
 * Register eines Laufs. Ein Eintrag mit ungültigem Namen, Beschreibung, Abdruck oder Schema fällt
 * allein heraus (`ausgeschlossen`, mit festem Grund); die anderen bleiben. Das Schema einer App
 * wird nie in zod umgewandelt: Es wird als JSON nach Größe und Tiefe geprüft und geht so an das
 * Modell, die Argumente prüft der Prüfer der MCP-Schicht.
 */
export async function erweitereRegister(
  basis: ToolRegistry,
  eintraege: readonly AppWerkzeugEintrag[],
): Promise<{ registry: ToolRegistry; ausgeschlossen: readonly AppAusgeschlossen[] }> {
  const namen = new Map<string, RegisteredTool>(
    basis.tools.map((t) => [t.definition.modelName, t]),
  );
  const kennungen = new Set<string>(basis.tools.map((t) => t.definition.key));
  const tools: RegisteredTool[] = [...basis.tools];
  const ausgeschlossen: AppAusgeschlossen[] = [];
  for (const eintrag of eintraege) {
    try {
      if (tools.length - basis.tools.length >= MAX_APP_WERKZEUGE_JE_LAUF) {
        throw new ToolRegistryError("zu viele Werkzeuge aus Apps");
      }
      pruefe(eintrag, new Set(namen.keys()), kennungen);
      const tool = baue(eintrag);
      namen.set(eintrag.modelName, tool);
      kennungen.add(eintrag.toolKey);
      tools.push(tool);
    } catch (fehler) {
      const grund =
        fehler instanceof ToolRegistryError
          ? fehler
          : new ToolRegistryError("Beschreibung nicht lesbar");
      ausgeschlossen.push(
        Object.freeze({ appId: eintrag.appId, key: kennungFuerMeldung(eintrag), fehler: grund }),
      );
    }
  }
  const registry: ToolRegistry = Object.freeze({
    tools: Object.freeze(tools),
    ausgeschlossen: basis.ausgeschlossen,
    byModelName: (name: string) => namen.get(name),
    placeholder: basis.placeholder,
  });
  return { registry, ausgeschlossen: Object.freeze(ausgeschlossen) };
}
