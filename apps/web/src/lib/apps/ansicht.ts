/**
 * PaiBot – Umrechnung der Antworten der App-Routen in das, was die Bausteine der Oberfläche
 * anzeigen (Status und Einstufung eines Werkzeugs, lesbare Schema-Texte, Zähler, Art des Fehlers).
 * Reine Funktionen ohne Importe von Server-Code: Die Datei wird auch im Browser geladen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import type {
  AppFehlerArt,
  SchemaText,
  ServerHinweis,
  WerkzeugArt,
  WerkzeugListeEintrag,
  WerkzeugStatus,
} from "@paibot/ui";

/** Ein Werkzeug, wie `GET /api/apps/:id/werkzeuge` es liefert (siehe `werkzeugAnsicht`). */
export interface WerkzeugAntwort {
  id: string;
  version: number;
  stand: "neu" | "bestaetigt" | "geaendert" | "entfernt" | "gesperrt";
  klasse: "lesen" | "schreiben" | "gesperrt";
  /** Abdruck genau dieser Fassung; ihn schickt der Besitzer beim Einstufen mit. */
  abdruck: string;
  modellText: { name: string; beschreibung: string; schema: unknown };
  hinweiseLautApp: { nurLesend: boolean | null; destruktiv: boolean | null };
}

/** Zugriff eines Bots auf eine App, wie die Liste ihn liefert. */
export interface ZugriffAntwort {
  botId: string;
  name: string;
  zugriff: "keiner" | "lesen";
}

const STATUS: Record<WerkzeugAntwort["stand"], WerkzeugStatus> = {
  neu: "neu",
  bestaetigt: "bestaetigt",
  geaendert: "geaendert",
  entfernt: "entfernt",
  // Vom Besitzer gesperrt: eine bestätigte Fassung mit der Einstufung „gesperrt“.
  gesperrt: "bestaetigt",
};

const ART: Record<WerkzeugAntwort["klasse"], WerkzeugArt> = {
  lesen: "liest",
  schreiben: "schreibt",
  gesperrt: "gesperrt",
};

function serverHinweis(h: WerkzeugAntwort["hinweiseLautApp"]): ServerHinweis | undefined {
  if (h.destruktiv === true) return "veraendert";
  if (h.nurLesend === true) return "nur_lesend";
  return undefined;
}

/**
 * Ein Werkzeug für die Liste. Name und Beschreibung sind genau der gespeicherte Text, der ans
 * Modell geht; die Hinweise der App stehen nur als Anzeige („laut App“) und ändern die Einstufung
 * nie. Das Schema gilt als prüfbar, wenn alle seine Texte gezeigt werden können.
 */
export function werkzeugEintrag(w: WerkzeugAntwort): WerkzeugListeEintrag {
  const hinweis = serverHinweis(w.hinweiseLautApp);
  const schema = schemaTexteVollstaendig(w.modellText.schema);
  return {
    id: w.id,
    name: w.modellText.name,
    beschreibung: w.modellText.beschreibung,
    status: STATUS[w.stand],
    art: ART[w.klasse],
    fassung: w.abdruck,
    // Ist das Schema nicht ganz zeigbar, lässt sich „liest“ nicht wählen: Bestätigt wird nur, was
    // der Besitzer vollständig gesehen hat.
    schemaPruefbar: schema.vollstaendig,
    schemaTexte: schema.texte,
    ...(hinweis === undefined ? {} : { serverHinweis: hinweis }),
  };
}

/**
 * Tiefe, ab der PaiBot ein Schema nicht mehr ganz zeigt (Schutz vor zu tiefer Rekursion; die
 * Datenbank lässt ohnehin höchstens 64 KB je Schema zu). Wird sie überschritten, gilt das Schema
 * als nicht vollständig zeigbar, und „liest“ lässt sich nicht wählen.
 */
const MAX_TIEFE = 64;

function alsText(wert: unknown): string | undefined {
  if (typeof wert === "string") return wert;
  if (typeof wert === "number" || typeof wert === "boolean" || wert === null) return String(wert);
  try {
    return JSON.stringify(wert);
  } catch {
    return undefined;
  }
}

function istObjekt(wert: unknown): wert is Record<string, unknown> {
  return typeof wert === "object" && wert !== null && !Array.isArray(wert);
}

/** Alle lesbaren Texte eines Schemas, und ob wirklich alle erfasst sind. */
export interface SchemaTexteErgebnis {
  texte: SchemaText[];
  /** `false`, wenn ein Teil nicht erfasst wurde (zu tief oder ein Kreis). Dann nichts bestätigen. */
  vollstaendig: boolean;
}

/**
 * Alles Lesbare aus dem Schema, das mit dem Werkzeug ans Modell geht: Feldnamen,
 * Feldbeschreibungen, Auswahlwerte, Vorgaben und Beispiele, je mit ihrem Pfad (`aufgabe.status`,
 * bei Listen `eintraege[]`), **vollständig und in voller Länge**: nichts wird gekürzt oder
 * weggelassen, denn der Besitzer bestätigt genau das, was das Modell bekommt. Nur Text: nichts
 * wird ausgewertet, geladen oder umgewandelt. Wirft nie.
 */
export function schemaTexteVollstaendig(schema: unknown): SchemaTexteErgebnis {
  const texte: SchemaText[] = [];
  const gesehen = new Set<unknown>();
  let vollstaendig = true;

  const nimm = (pfad: string, art: SchemaText["art"], wert: unknown) => {
    const text = alsText(wert);
    if (text !== undefined && text !== "") texte.push({ pfad, art, text });
  };

  const gehe = (knoten: unknown, pfad: string, tiefe: number) => {
    if (!istObjekt(knoten)) return;
    if (tiefe > MAX_TIEFE || gesehen.has(knoten)) {
      vollstaendig = false;
      return;
    }
    gesehen.add(knoten);
    if (pfad !== "") {
      if (typeof knoten.description === "string")
        nimm(pfad, "feldbeschreibung", knoten.description);
      if (Array.isArray(knoten.enum)) for (const v of knoten.enum) nimm(pfad, "enum", v);
      if ("default" in knoten) nimm(pfad, "default", knoten.default);
      if (Array.isArray(knoten.examples))
        for (const v of knoten.examples) nimm(pfad, "beispiel", v);
    }
    if (istObjekt(knoten.properties)) {
      for (const [name, kind] of Object.entries(knoten.properties)) {
        const kindPfad = pfad === "" ? name : `${pfad}.${name}`;
        nimm(kindPfad, "feldname", name);
        gehe(kind, kindPfad, tiefe + 1);
      }
    }
    if (istObjekt(knoten.items)) gehe(knoten.items, `${pfad}[]`, tiefe + 1);
  };

  gehe(schema, "", 0);
  return { texte, vollstaendig };
}

/** Wie `schemaTexteVollstaendig`, nur die Texte. */
export function werkzeugSchemaTexte(schema: unknown): SchemaText[] {
  return schemaTexteVollstaendig(schema).texte;
}

/** Wie vielen Bots der Zugriff „darf lesen“ gegeben ist. */
export function zugriffZaehler(zugriff: readonly ZugriffAntwort[]): number {
  return zugriff.filter((z) => z.zugriff === "lesen").length;
}

const FEHLER_ARTEN: Record<string, AppFehlerArt> = {
  app_nicht_erreichbar: "nicht_erreichbar",
  app_zugang_ungueltig: "zugang_ungueltig",
  app_adresse_unzulaessig: "adresse_unzulaessig",
  app_kein_mcp: "kein_mcp",
  app_befehl_nicht_erlaubt: "befehl_nicht_erlaubt",
  app_version_unbekannt: "version_unbekannt",
  app_braucht_eingabe: "braucht_eingabe",
};

/** Fehler-Text der Oberfläche zu einem Code der Routen; `undefined`, wenn es kein App-Fehler ist. */
export function appFehlerArt(code: string): AppFehlerArt | undefined {
  return FEHLER_ARTEN[code];
}
