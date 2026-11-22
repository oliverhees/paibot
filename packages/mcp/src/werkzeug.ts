/**
 * PaiBot – Werkzeuge eines fremden Servers aufbereiten: Rohform prüfen, Abdruck bilden, Namen und
 * Beschreibung bereinigen, Schema kürzen, Namen für das Modell vergeben und die frische Liste mit
 * der gespeicherten vergleichen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { abdruckVonText, abdruckVonWert } from "./abdruck";
import { bereinigeText } from "./bereinigen";
import { type McpGrenzen, mitStandardGrenzen } from "./grenzen";
import { vergebeModellNamen } from "./namen";
import { type ArgumentPruefer, type SchemaProblem, verarbeiteSchema } from "./schema";
import { pruefeStruktur } from "./struktur";

/** Ein Werkzeug genau so, wie der Server es geliefert hat (alle Felder, auch unbekannte). */
export type McpWerkzeugRoh = Readonly<Record<string, unknown>>;

/** Warum ein Werkzeug nicht bestätigt werden kann. */
export type McpWerkzeugProblem =
  | "werkzeug_ungueltig"
  | "werkzeug_zu_gross"
  | "name_ungueltig"
  | "name_doppelt"
  | `schema_${SchemaProblem}`;

/** Hinweise des Servers (`annotations`): nur Anzeige „laut App“, nie ein Beleg. */
export interface McpHinweise {
  nurLesend: boolean | null;
  destruktiv: boolean | null;
  wiederholbar: boolean | null;
  offeneWelt: boolean | null;
}

export interface McpWerkzeugBereinigt {
  /** Name genau wie vom Server; geht nur an den Server, nie ans Modell. */
  originalName: string;
  /** Bereinigter Name für Anzeige und Schlüssel (höchstens 128 Zeichen). */
  anzeigeName: string;
  /** Name für das Modell: `<app-kurzname>__<name bereinigt>`. */
  modellName: string;
  /** Bereinigter Titel (nur Anzeige). */
  titel: string | null;
  /** Bereinigte Beschreibung (höchstens 1 000 Zeichen); geht ans Modell. */
  beschreibung: string;
  /** Gekürztes, bereinigtes Eingabe-Schema; geht ans Modell. `null`, wenn nicht bestätigbar. */
  schemaFuerModell: Record<string, unknown> | null;
  /** Zeichen von Beschreibung und allen Texten im Schema (Zählung der Beschreibungs-Größe). */
  modellTextZeichen: number;
  /** Abdruck der Rohform; ändert sich bei jedem geänderten Zeichen. */
  abdruck: string;
  hinweise: McpHinweise;
  /** `true`, wenn der Besitzer das Werkzeug bestätigen darf (alles prüfbar). */
  bestaetigbar: boolean;
  problem: McpWerkzeugProblem | null;
  /** Prüft die Argumente eines Aufrufs; `null`, wenn nicht bestätigbar. */
  pruefer: ArgumentPruefer | null;
  /** Bei der Bereinigung wurde in Name, Titel oder Beschreibung etwas entfernt oder gekürzt. */
  textVeraendert: boolean;
}

export interface WerkzeugListeOptionen {
  /** Kurzname der App (`^[a-z0-9][a-z0-9_-]{0,63}$`). */
  appKurzname: string;
  grenzen?: Partial<McpGrenzen>;
  /** Modell-Namen, die in der Installation schon vergeben sind (andere Apps). */
  bereitsVergeben?: ReadonlySet<string>;
  /**
   * Die gespeicherte Zuordnung Original-Name → Modell-Name dieser App (aus der Datenbank). **Pflicht**:
   * beim ersten Abruf eine leere Zuordnung. Die Namen darin bleiben unverändert und gelten als
   * vergeben, auch wenn ihr Werkzeug fehlt; nur neue Werkzeuge bekommen einen frischen Namen.
   */
  bekannteNamen: ReadonlyMap<string, string>;
}

const MAX_NAME_ROH = 256;
const MAX_ANZEIGENAME = 128;
const MAX_TITEL = 200;

function einfachesObjekt(wert: unknown): wert is Record<string, unknown> {
  return typeof wert === "object" && wert !== null && !Array.isArray(wert);
}

function hinweiseAus(roh: unknown): McpHinweise {
  const leer: McpHinweise = {
    nurLesend: null,
    destruktiv: null,
    wiederholbar: null,
    offeneWelt: null,
  };
  if (!einfachesObjekt(roh)) return leer;
  const bool = (wert: unknown) => (typeof wert === "boolean" ? wert : null);
  return {
    nurLesend: bool(roh.readOnlyHint),
    destruktiv: bool(roh.destructiveHint),
    wiederholbar: bool(roh.idempotentHint),
    offeneWelt: bool(roh.openWorldHint),
  };
}

interface Vorstufe extends Omit<McpWerkzeugBereinigt, "modellName"> {}

function vorstufe(roh: unknown, grenzen: McpGrenzen): Vorstufe {
  const leer: Vorstufe = {
    originalName: "",
    anzeigeName: "",
    titel: null,
    beschreibung: "",
    schemaFuerModell: null,
    modellTextZeichen: 0,
    abdruck: abdruckVonText("unlesbar"),
    hinweise: { nurLesend: null, destruktiv: null, wiederholbar: null, offeneWelt: null },
    bestaetigbar: false,
    problem: "werkzeug_ungueltig",
    pruefer: null,
    textVeraendert: false,
  };
  // Zuerst ohne Rekursion; erst danach darf etwas die Rohform ablaufen (Abdruck, Schema).
  const struktur = pruefeStruktur(roh, {
    maxTiefe: grenzen.maxRohTiefe,
    maxKnoten: grenzen.maxKnoten,
  });
  if (!struktur.ok) {
    return {
      ...leer,
      abdruck: abdruckVonText(`unpruefbar:${struktur.problem}`),
      problem: struktur.problem === "typ_unzulaessig" ? "werkzeug_ungueltig" : "werkzeug_zu_gross",
    };
  }
  if (!einfachesObjekt(roh) || typeof roh.name !== "string") return leer;
  const abdruck = abdruckVonWert(roh);
  const name = roh.name;
  if (name.length === 0 || name.length > MAX_NAME_ROH) {
    return {
      ...leer,
      abdruck,
      originalName: name.slice(0, MAX_NAME_ROH),
      anzeigeName: bereinigeText(name, { maxZeichen: MAX_ANZEIGENAME, zeilenumbrueche: false })
        .text,
      problem: "name_ungueltig",
    };
  }
  const anzeige = bereinigeText(name, { maxZeichen: MAX_ANZEIGENAME, zeilenumbrueche: false });
  const titelRoh = typeof roh.title === "string" ? roh.title : null;
  const titel =
    titelRoh === null
      ? null
      : bereinigeText(titelRoh, {
          maxZeichen: MAX_TITEL,
          zeilenumbrueche: false,
          kuerzungsMarke: "…",
        });
  const beschreibungRoh = typeof roh.description === "string" ? roh.description : "";
  const beschreibung = bereinigeText(beschreibungRoh, {
    maxZeichen: grenzen.maxBeschreibungZeichen,
    zeilenumbrueche: true,
    kuerzungsMarke: "…",
  });
  const textVeraendert =
    anzeige.veraendert ||
    anzeige.gekuerzt ||
    (titel?.veraendert ?? false) ||
    (titel?.gekuerzt ?? false) ||
    beschreibung.veraendert ||
    beschreibung.gekuerzt;

  const schema = verarbeiteSchema(roh.inputSchema, grenzen);
  const basis = {
    originalName: name,
    anzeigeName: anzeige.text,
    titel: titel === null ? null : titel.text,
    beschreibung: beschreibung.text,
    abdruck,
    hinweise: hinweiseAus(roh.annotations),
    textVeraendert,
  };
  if (!schema.ok) {
    return {
      ...basis,
      schemaFuerModell: null,
      modellTextZeichen: beschreibung.text.length,
      bestaetigbar: false,
      problem: `schema_${schema.problem}`,
      pruefer: null,
    };
  }
  return {
    ...basis,
    schemaFuerModell: schema.modell,
    modellTextZeichen: beschreibung.text.length + schema.textZeichen,
    bestaetigbar: true,
    problem: null,
    pruefer: schema.pruefer,
  };
}

/**
 * Bereitet alle Werkzeuge eines Servers auf. Kein Werkzeug wirft: Was sich nicht sicher umwandeln
 * lässt, kommt mit `bestaetigbar: false` und einem Grund zurück. Die Reihenfolge bleibt erhalten.
 */
export function bereiteWerkzeugeAuf(
  roheListe: readonly unknown[],
  optionen: WerkzeugListeOptionen,
): McpWerkzeugBereinigt[] {
  const grenzen = mitStandardGrenzen(optionen.grenzen);
  const stufen = roheListe.map((roh) => vorstufe(roh, grenzen));
  const gesehen = new Set<string>();
  for (const stufe of stufen) {
    if (stufe.problem === "name_ungueltig" || stufe.originalName === "") continue;
    if (gesehen.has(stufe.originalName)) {
      stufe.bestaetigbar = false;
      stufe.problem = "name_doppelt";
      stufe.pruefer = null;
      stufe.schemaFuerModell = null;
    } else {
      gesehen.add(stufe.originalName);
    }
  }
  const zuBenennen = [...gesehen];
  const vergeben = new Map(
    vergebeModellNamen(
      optionen.appKurzname,
      zuBenennen,
      optionen.bereitsVergeben ?? new Set(),
      optionen.bekannteNamen,
    ).map((eintrag) => [eintrag.original, eintrag.modellName]),
  );
  // Der zweite Eintrag mit gleichem Namen teilt sich den Namen nicht: Er bekommt keinen und ist gesperrt.
  const vergebenFuer = new Set<string>();
  return stufen.map((stufe) => {
    const name = vergeben.get(stufe.originalName);
    const darfName =
      name !== undefined && stufe.problem !== "name_doppelt" && !vergebenFuer.has(name);
    if (darfName && name !== undefined) vergebenFuer.add(name);
    return { ...stufe, modellName: darfName && name !== undefined ? name : "" };
  });
}

/** Das, was ans Modell geht: Name, Beschreibung, Schema. Nur für bestätigbare Werkzeuge. */
export interface McpModellDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** Die Modell-Form eines Werkzeugs; genau sie wird gespeichert, dem Besitzer gezeigt und gesendet. */
export function modellDefinition(werkzeug: McpWerkzeugBereinigt): McpModellDefinition | null {
  if (!werkzeug.bestaetigbar || werkzeug.schemaFuerModell === null || werkzeug.modellName === "") {
    return null;
  }
  return {
    name: werkzeug.modellName,
    description: werkzeug.beschreibung,
    inputSchema: werkzeug.schemaFuerModell,
  };
}

export interface GespeichertesWerkzeug {
  originalName: string;
  abdruck: string;
}

export interface WerkzeugAbgleich {
  /** Gibt es noch nicht: Standard „schreibt“, nicht für Modelle sichtbar. */
  neu: McpWerkzeugBereinigt[];
  /** Name bekannt, Abdruck anders: gesperrt, bis der Besitzer neu bestätigt. */
  geaendert: McpWerkzeugBereinigt[];
  unveraendert: McpWerkzeugBereinigt[];
  /** Gespeichert, aber nicht mehr in der Liste. */
  entfernt: GespeichertesWerkzeug[];
}

/** Vergleicht die frische Liste mit der gespeicherten über Name und Abdruck der Rohform. */
export function vergleicheWerkzeuge(
  gespeichert: readonly GespeichertesWerkzeug[],
  frisch: readonly McpWerkzeugBereinigt[],
): WerkzeugAbgleich {
  const alt = new Map(gespeichert.map((eintrag) => [eintrag.originalName, eintrag.abdruck]));
  const ergebnis: WerkzeugAbgleich = { neu: [], geaendert: [], unveraendert: [], entfernt: [] };
  const inListe = new Set<string>();
  for (const werkzeug of frisch) {
    if (werkzeug.originalName === "") {
      ergebnis.neu.push(werkzeug);
      continue;
    }
    inListe.add(werkzeug.originalName);
    const bisher = alt.get(werkzeug.originalName);
    if (bisher === undefined) ergebnis.neu.push(werkzeug);
    else if (bisher === werkzeug.abdruck && werkzeug.problem !== "name_doppelt") {
      ergebnis.unveraendert.push(werkzeug);
    } else ergebnis.geaendert.push(werkzeug);
  }
  for (const eintrag of gespeichert) {
    if (!inListe.has(eintrag.originalName)) ergebnis.entfernt.push(eintrag);
  }
  return ergebnis;
}
