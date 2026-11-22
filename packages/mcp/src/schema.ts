/**
 * PaiBot – Eingabe-Schema eines fremden Werkzeugs: prüfen, für das Modell auf eine Positivliste
 * kürzen und bereinigen, in ein eigenes Prüf-Schema umwandeln. Was sich nicht sicher umwandeln
 * lässt, wird abgewiesen, nicht geraten.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { z } from "zod";
import { kanonischeForm } from "./abdruck";
import { bereinigeText } from "./bereinigen";
import type { McpGrenzen } from "./grenzen";
import { OBJEKT_NAMEN, pruefeStruktur } from "./struktur";

/** Warum ein Schema nicht bestätigbar ist. */
export const SCHEMA_PROBLEME = [
  /** Wurzel ist kein Objekt-Schema. */
  "wurzel_kein_objekt",
  /** Zu groß (Bytes, Knoten oder Zeichen). */
  "zu_gross",
  /** Zu tief verschachtelt oder zyklisch. */
  "zu_tief",
  /** Ein Schlüssel heißt wie ein Name von `Object.prototype` (`constructor`, `__proto__` …). */
  "schluessel_verboten",
  /** Ein Stichwort, das PaiBot nicht prüfen kann (`$ref`, `pattern`, `oneOf`, `not` …). */
  "stichwort_nicht_pruefbar",
  /** Ein Wert hat nicht die erwartete Form. */
  "form_ungueltig",
  /** Ein Feld-Name oder Aufzählungswert ändert sich bei der Bereinigung oder ist zu lang. */
  "text_nicht_bereinigbar",
  /** Die Umwandlung in ein Prüf-Schema ist gescheitert. */
  "umwandlung_gescheitert",
] as const;

export type SchemaProblem = (typeof SCHEMA_PROBLEME)[number];

/** Gründe, aus denen Argumente abgewiesen werden. */
export type ArgumentProblem = "zu_gross" | "unzulaessig" | "passt_nicht";

export type ArgumentErgebnis =
  | { ok: true; wert: Record<string, unknown> }
  | { ok: false; problem: ArgumentProblem };

/** Prüft die Argumente eines Aufrufs gegen das Prüf-Schema des Werkzeugs. */
export type ArgumentPruefer = (argumente: unknown) => ArgumentErgebnis;

export type SchemaErgebnis =
  | {
      ok: true;
      /** Gekürztes, bereinigtes Schema: genau das, was ans Modell geht und der Besitzer sieht. */
      modell: Record<string, unknown>;
      pruefer: ArgumentPruefer;
      /** Zeichen aller Texte im gekürzten Schema (für die Zählung der Beschreibungs-Größe). */
      textZeichen: number;
    }
  | { ok: false; problem: SchemaProblem };

/** Stichwörter, die ans Modell gehen (Positivliste). `additionalProperties` nur als `true`/`false`. */
export const MODELL_STICHWORTE: readonly string[] = [
  "type",
  "properties",
  "required",
  "items",
  "enum",
  "description",
  "minimum",
  "maximum",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "additionalProperties",
];

/** Stichwörter, die nur prüfen (nicht ans Modell gehen). */
const NUR_PRUEFEN: readonly string[] = ["const", "exclusiveMinimum", "exclusiveMaximum"];

/** Beschreibende Stichwörter ohne Wirkung auf die Prüfung; sie fallen überall weg. */
const IGNORIERT: ReadonlySet<string> = new Set([
  "title",
  "default",
  "examples",
  "example",
  "$comment",
  "$schema",
  "$id",
  "format",
  "deprecated",
  "readOnly",
  "writeOnly",
]);

const ERLAUBTE_TYPEN: ReadonlySet<string> = new Set([
  "string",
  "number",
  "integer",
  "boolean",
  "object",
  "array",
  "null",
]);

const MAX_EINTRAEGE = 100;
const MAX_NAME = 64;

class Abweisung extends Error {
  readonly problem: SchemaProblem;
  constructor(problem: SchemaProblem) {
    super(problem);
    this.problem = problem;
  }
}

interface Zustand {
  grenzen: McpGrenzen;
  textZeichen: number;
}

function istObjekt(wert: unknown): wert is Record<string, unknown> {
  return typeof wert === "object" && wert !== null && !Array.isArray(wert);
}

function istZahl(wert: unknown): wert is number {
  return typeof wert === "number" && Number.isFinite(wert);
}

function istGanzzahlNichtNegativ(wert: unknown): wert is number {
  return typeof wert === "number" && Number.isInteger(wert) && wert >= 0;
}

/** Name eines Felds: darf sich bei der Bereinigung nicht ändern und ist höchstens 64 Zeichen lang. */
function pruefeFeldName(name: string, zustand: Zustand): string {
  if (OBJEKT_NAMEN.has(name)) throw new Abweisung("schluessel_verboten");
  if (name.length === 0 || name.length > MAX_NAME) throw new Abweisung("text_nicht_bereinigbar");
  const sauber = bereinigeText(name, { maxZeichen: MAX_NAME, zeilenumbrueche: false });
  if (sauber.text !== name) throw new Abweisung("text_nicht_bereinigbar");
  zustand.textZeichen += name.length;
  return name;
}

/** Wert einer Aufzählung bzw. Konstante: kurzer Text, der sich nicht ändert, oder Zahl, Ja/Nein, null. */
function pruefeFestenWert(wert: unknown, zustand: Zustand): void {
  if (typeof wert === "string") {
    if (wert.length > zustand.grenzen.maxFeldTextZeichen)
      throw new Abweisung("text_nicht_bereinigbar");
    const sauber = bereinigeText(wert, {
      maxZeichen: zustand.grenzen.maxFeldTextZeichen,
      zeilenumbrueche: false,
    });
    if (sauber.text !== wert) throw new Abweisung("text_nicht_bereinigbar");
    zustand.textZeichen += wert.length;
    return;
  }
  if (wert === null || typeof wert === "boolean" || istZahl(wert)) return;
  throw new Abweisung("form_ungueltig");
}

interface Teil {
  modell: Record<string, unknown>;
  pruef: Record<string, unknown>;
}

/**
 * Verarbeitet ein Schema auf einer Ebene. Rekursion nur bis zur Höchsttiefe, und nur nachdem
 * `pruefeStruktur` Tiefe, Größe und Kreise des Ganzen schon angenommen hat.
 */
function verarbeite(schema: unknown, ebene: number, zustand: Zustand): Teil {
  if (!istObjekt(schema)) throw new Abweisung("form_ungueltig");
  if (ebene > zustand.grenzen.maxSchemaTiefe) throw new Abweisung("zu_tief");
  const modell: Record<string, unknown> = {};
  const pruef: Record<string, unknown> = {};

  for (const schluessel of Object.keys(schema)) {
    const wert = schema[schluessel];
    if (IGNORIERT.has(schluessel)) continue;
    if (!MODELL_STICHWORTE.includes(schluessel) && !NUR_PRUEFEN.includes(schluessel)) {
      throw new Abweisung("stichwort_nicht_pruefbar");
    }
    switch (schluessel) {
      case "type": {
        const typen = Array.isArray(wert) ? wert : [wert];
        if (
          typen.length === 0 ||
          typen.length > ERLAUBTE_TYPEN.size ||
          !typen.every((typ) => typeof typ === "string" && ERLAUBTE_TYPEN.has(typ))
        ) {
          throw new Abweisung("form_ungueltig");
        }
        modell.type = Array.isArray(wert) ? [...wert] : wert;
        pruef.type = Array.isArray(wert) ? [...wert] : wert;
        break;
      }
      case "description": {
        if (typeof wert !== "string") throw new Abweisung("form_ungueltig");
        const sauber = bereinigeText(wert, {
          maxZeichen: zustand.grenzen.maxFeldTextZeichen,
          zeilenumbrueche: false,
          kuerzungsMarke: "…",
        });
        modell.description = sauber.text;
        zustand.textZeichen += sauber.text.length;
        break;
      }
      case "properties": {
        if (!istObjekt(wert)) throw new Abweisung("form_ungueltig");
        const namen = Object.keys(wert);
        if (namen.length > MAX_EINTRAEGE) throw new Abweisung("zu_gross");
        const m: Record<string, unknown> = {};
        const p: Record<string, unknown> = {};
        for (const name of namen) {
          pruefeFeldName(name, zustand);
          const teil = verarbeite(wert[name], ebene + 1, zustand);
          m[name] = teil.modell;
          p[name] = teil.pruef;
        }
        modell.properties = m;
        pruef.properties = p;
        break;
      }
      case "required": {
        if (!Array.isArray(wert) || wert.length > MAX_EINTRAEGE)
          throw new Abweisung("form_ungueltig");
        for (const name of wert) {
          if (typeof name !== "string") throw new Abweisung("form_ungueltig");
          pruefeFeldName(name, zustand);
        }
        modell.required = [...wert];
        pruef.required = [...wert];
        break;
      }
      case "items": {
        const teil = verarbeite(wert, ebene + 1, zustand);
        modell.items = teil.modell;
        pruef.items = teil.pruef;
        break;
      }
      case "enum": {
        if (!Array.isArray(wert) || wert.length === 0 || wert.length > MAX_EINTRAEGE) {
          throw new Abweisung("form_ungueltig");
        }
        for (const eintrag of wert) pruefeFestenWert(eintrag, zustand);
        modell.enum = [...wert];
        pruef.enum = [...wert];
        break;
      }
      case "const": {
        pruefeFestenWert(wert, zustand);
        pruef.const = wert;
        break;
      }
      case "additionalProperties": {
        if (typeof wert !== "boolean") throw new Abweisung("stichwort_nicht_pruefbar");
        modell.additionalProperties = wert;
        pruef.additionalProperties = wert;
        break;
      }
      case "minimum":
      case "maximum": {
        if (!istZahl(wert)) throw new Abweisung("form_ungueltig");
        modell[schluessel] = wert;
        pruef[schluessel] = wert;
        break;
      }
      case "exclusiveMinimum":
      case "exclusiveMaximum": {
        if (!istZahl(wert)) throw new Abweisung("form_ungueltig");
        pruef[schluessel] = wert;
        break;
      }
      case "minLength":
      case "maxLength":
      case "minItems":
      case "maxItems": {
        if (!istGanzzahlNichtNegativ(wert)) throw new Abweisung("form_ungueltig");
        modell[schluessel] = wert;
        pruef[schluessel] = wert;
        break;
      }
      default:
        throw new Abweisung("stichwort_nicht_pruefbar");
    }
  }
  schliesseObjektAb(modell, pruef);
  return { modell, pruef };
}

/**
 * Macht aus einem Objekt-Schema die strenge Form: Jeder Name in `required` muss unter `properties`
 * stehen (sonst ist das Werkzeug nicht bestätigbar), und fehlt `additionalProperties`, wird
 * `additionalProperties: false` eingetragen, sowohl im Schema für das Modell als auch im
 * Prüf-Schema. Ob der Prüfer für Argumente das danach tatsächlich durchsetzt, hängt von der
 * Umwandlung in `z.fromJSONSchema` ab: Bei einem Teilschema ohne `type` werden zusätzliche Felder
 * trotzdem angenommen.
 */
function schliesseObjektAb(modell: Record<string, unknown>, pruef: Record<string, unknown>): void {
  const typen = Array.isArray(pruef.type) ? pruef.type : [pruef.type];
  const istObjektSchema = typen.includes("object") || pruef.properties !== undefined;
  const required = pruef.required;
  if (Array.isArray(required)) {
    const eigenschaften = istObjekt(pruef.properties) ? pruef.properties : {};
    for (const name of required) {
      if (typeof name !== "string" || !Object.hasOwn(eigenschaften, name)) {
        throw new Abweisung("form_ungueltig");
      }
    }
  }
  if (istObjektSchema && pruef.additionalProperties === undefined) {
    modell.additionalProperties = false;
    pruef.additionalProperties = false;
  }
}

/**
 * Prüft das Rohschema (Größe, Tiefe, Kreise, verbotene Schlüssel, nur bekannte Stichwörter),
 * kürzt es für das Modell, bereinigt jeden Text und baut den Prüfer für Argumente.
 */
export function verarbeiteSchema(roh: unknown, grenzen: McpGrenzen): SchemaErgebnis {
  if (!istObjekt(roh)) return { ok: false, problem: "wurzel_kein_objekt" };
  // Zuerst ohne Rekursion: Tiefe, Knoten, Kreise, Typen, verbotene Schlüssel.
  const struktur = pruefeStruktur(roh, {
    maxTiefe: grenzen.maxSchemaTiefe * 3 + 4,
    maxKnoten: 2_000,
    maxZeichen: grenzen.maxSchemaBytes,
    verboteneSchluessel: OBJEKT_NAMEN,
  });
  if (!struktur.ok) {
    if (struktur.problem === "schluessel_verboten")
      return { ok: false, problem: "schluessel_verboten" };
    if (struktur.problem === "zu_tief" || struktur.problem === "kreis") {
      return { ok: false, problem: "zu_tief" };
    }
    if (struktur.problem === "typ_unzulaessig") return { ok: false, problem: "form_ungueltig" };
    return { ok: false, problem: "zu_gross" };
  }
  if (Buffer.byteLength(kanonischeForm(roh), "utf8") > grenzen.maxSchemaBytes) {
    return { ok: false, problem: "zu_gross" };
  }
  if (roh.type !== "object") return { ok: false, problem: "wurzel_kein_objekt" };

  const zustand: Zustand = { grenzen, textZeichen: 0 };
  let teil: Teil;
  try {
    teil = verarbeite(roh, 1, zustand);
  } catch (fehler) {
    if (fehler instanceof Abweisung) return { ok: false, problem: fehler.problem };
    return { ok: false, problem: "form_ungueltig" };
  }

  let zodSchema: z.ZodType;
  try {
    zodSchema = z.fromJSONSchema(teil.pruef as Parameters<typeof z.fromJSONSchema>[0]);
  } catch {
    return { ok: false, problem: "umwandlung_gescheitert" };
  }
  return {
    ok: true,
    modell: teil.modell,
    textZeichen: zustand.textZeichen,
    pruefer: baueArgumentPruefer(zodSchema, grenzen),
  };
}

function baueArgumentPruefer(zodSchema: z.ZodType, grenzen: McpGrenzen): ArgumentPruefer {
  return (argumente) => {
    // Erst die Form und die Größe, ohne Rekursion; danach erst darf etwas rekursiv arbeiten.
    const struktur = pruefeStruktur(argumente, {
      maxTiefe: grenzen.maxSchemaTiefe * 3 + 4,
      maxKnoten: 2_000,
      maxZeichen: grenzen.maxArgumenteBytes,
      verboteneSchluessel: OBJEKT_NAMEN,
    });
    if (!struktur.ok) {
      return {
        ok: false,
        problem:
          struktur.problem === "zu_tief" ||
          struktur.problem === "zu_viele_knoten" ||
          struktur.problem === "zu_viele_zeichen"
            ? "zu_gross"
            : "unzulaessig",
      };
    }
    if (!istObjekt(argumente)) return { ok: false, problem: "unzulaessig" };
    if (Buffer.byteLength(kanonischeForm(argumente), "utf8") > grenzen.maxArgumenteBytes) {
      return { ok: false, problem: "zu_gross" };
    }
    const ergebnis = zodSchema.safeParse(argumente);
    if (!ergebnis.success || !istObjekt(ergebnis.data))
      return { ok: false, problem: "passt_nicht" };
    return { ok: true, wert: ergebnis.data };
  };
}
