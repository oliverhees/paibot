/**
 * PaiBot – kanonische JSON-Form nach RFC 8785 für die Werte in Belegen (ohne Gleitkommazahlen).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

/** Werte, die sich kanonisieren lassen. Zahlen müssen sichere Ganzzahlen sein. */
export type CanonicalValue =
  | string
  | number
  | boolean
  | null
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue };

/** Gründe, aus denen ein Wert nicht kanonisiert werden kann. */
export type CanonicalizeProblem =
  | "gleitkommazahl"
  | "zahl_zu_gross"
  | "nicht_endlich"
  | "undefiniert"
  | "typ_unbekannt"
  | "zyklus";

export class CanonicalizeError extends Error {
  readonly problem: CanonicalizeProblem;
  /** Pfad zum fehlerhaften Wert, z. B. `facts.inputChars`. */
  readonly path: string;

  constructor(problem: CanonicalizeProblem, path: string) {
    super(`${problem} bei ${path === "" ? "(Wurzel)" : path}`);
    this.name = "CanonicalizeError";
    this.problem = problem;
    this.path = path;
  }
}

/**
 * Serialisiert einen Wert kanonisch nach RFC 8785: Objekt-Schlüssel sortiert nach UTF-16-Code-Units,
 * keine Leerzeichen, Texte mit der Maskierung aus RFC 8785, nur Ganzzahlen.
 *
 * Zusagen: gleiche Werte ergeben unabhängig von der Reihenfolge der Schlüssel denselben Text;
 * läuft ohne Node-APIs (auch im Browser).
 *
 * Fehler: `CanonicalizeError` bei Gleitkommazahlen, Zahlen außerhalb von
 * `Number.MAX_SAFE_INTEGER`, `NaN`/`Infinity`, `undefined` (auch als Objekt-Wert), Funktionen,
 * Symbolen, `bigint`, Datumsobjekten und zyklischen Strukturen.
 */
export function canonicalize(value: CanonicalValue): string {
  return serialize(value as unknown, "", new Set<object>());
}

function childPath(path: string, key: string): string {
  return path === "" ? key : `${path}.${key}`;
}

function serialize(value: unknown, path: string, ancestors: Set<object>): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      // JSON.stringify maskiert genau wie RFC 8785: \b \f \n \r \t, \" und \\, übrige
      // Steuerzeichen als \u00xx (klein); alles andere bleibt unverändert, auch Umlaute und Emoji.
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      return serializeNumber(value, path);
    case "undefined":
      throw new CanonicalizeError("undefiniert", path);
    case "object":
      break;
    default:
      throw new CanonicalizeError("typ_unbekannt", path);
  }

  const object = value as object;
  if (ancestors.has(object)) throw new CanonicalizeError("zyklus", path);

  if (Array.isArray(object)) {
    ancestors.add(object);
    const parts: string[] = [];
    for (let index = 0; index < object.length; index++) {
      parts.push(serialize(object[index], `${path}[${index}]`, ancestors));
    }
    ancestors.delete(object);
    return `[${parts.join(",")}]`;
  }

  const prototype = Object.getPrototypeOf(object);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new CanonicalizeError("typ_unbekannt", path);
  }

  ancestors.add(object);
  // Standard-Sortierung von JavaScript vergleicht UTF-16-Code-Units, wie RFC 8785 es verlangt.
  const keys = Object.keys(object).sort();
  const record = object as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of keys) {
    parts.push(`${JSON.stringify(key)}:${serialize(record[key], childPath(path, key), ancestors)}`);
  }
  ancestors.delete(object);
  return `{${parts.join(",")}}`;
}

function serializeNumber(value: number, path: string): string {
  if (!Number.isFinite(value)) throw new CanonicalizeError("nicht_endlich", path);
  if (!Number.isInteger(value)) throw new CanonicalizeError("gleitkommazahl", path);
  if (!Number.isSafeInteger(value)) throw new CanonicalizeError("zahl_zu_gross", path);
  // -0 wird wie in RFC 8785 als 0 geschrieben.
  return Object.is(value, -0) ? "0" : String(value);
}
