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

import { t } from "@paibot/shared/texte";
import type {
  AppFehlerArt,
  SchemaText,
  ServerHinweis,
  WerkzeugAenderung,
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
  /**
   * Bei einer geänderten Fassung: die Fassung, die der Besitzer zuletzt bestätigt hatte. Daraus
   * entsteht „Was hat sich geändert“.
   */
  frueher?: FassungAntwort;
  /** Die zuletzt bestätigte Fassung liegt außerhalb der geladenen Fassungen: Der Vergleich fehlt. */
  vergleichUnvollstaendig?: true;
}

/** Eine frühere Fassung eines Werkzeugs, wie sie zum Vergleichen gebraucht wird. */
export type FassungAntwort = Pick<
  WerkzeugAntwort,
  "version" | "klasse" | "abdruck" | "modellText" | "hinweiseLautApp"
>;

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
    ...(w.frueher === undefined || (w.stand !== "geaendert" && w.stand !== "neu")
      ? {}
      : { bisher: bisherigeArt(w.frueher.klasse), aenderungen: aenderungenZwischen(w.frueher, w) }),
    ...(w.vergleichUnvollstaendig === true && (w.stand === "geaendert" || w.stand === "neu")
      ? { vergleichUnvollstaendig: true }
      : {}),
  };
}

/** Einstufung der Oberfläche zur Klasse einer früher bestätigten Fassung. */
export function bisherigeArt(klasse: WerkzeugAntwort["klasse"]): WerkzeugArt {
  return ART[klasse];
}

function hinweisText(h: FassungAntwort["hinweiseLautApp"]): string {
  if (h.destruktiv === true) return "laut App: verändert Daten";
  if (h.nurLesend === true) return "laut App: nur lesend";
  return "laut App: keine Angabe";
}

function schemaZeilen(schema: unknown): string[] {
  return schemaTexteVollstaendig(schema).texte.map((e) => `${e.pfad} (${e.art}): ${e.text}`);
}

/**
 * Was sich zwischen zwei Fassungen eines Werkzeugs geändert hat: Name, Beschreibung, Texte der
 * Eingabe und Hinweise der App, jeweils vorher und nachher in voller Länge (es ist der Text, der
 * ans Modell ginge). Beim Schema stehen nur die Zeilen, die abweichen. Ändert sich nur die Form
 * des Schemas (Typ, Pflichtfeld), ohne dass sich ein Text ändert, stehen beide Fassungen im Ganzen
 * da, damit nichts unsichtbar bleibt.
 */
export function aenderungenZwischen(
  alt: Pick<FassungAntwort, "modellText" | "hinweiseLautApp">,
  neu: Pick<FassungAntwort, "modellText" | "hinweiseLautApp">,
): WerkzeugAenderung[] {
  const aus: WerkzeugAenderung[] = [];
  if (alt.modellText.name !== neu.modellText.name) {
    aus.push({ feld: "name", vorher: alt.modellText.name, nachher: neu.modellText.name });
  }
  if (alt.modellText.beschreibung !== neu.modellText.beschreibung) {
    aus.push({
      feld: "beschreibung",
      vorher: alt.modellText.beschreibung,
      nachher: neu.modellText.beschreibung,
    });
  }
  const vorherZeilen = schemaZeilen(alt.modellText.schema);
  const nachherZeilen = schemaZeilen(neu.modellText.schema);
  const nurAlt = vorherZeilen.filter((z) => !nachherZeilen.includes(z));
  const nurNeu = nachherZeilen.filter((z) => !vorherZeilen.includes(z));
  if (nurAlt.length > 0 || nurNeu.length > 0) {
    aus.push({ feld: "eingabe", vorher: nurAlt.join("\n"), nachher: nurNeu.join("\n") });
  } else {
    const a = JSON.stringify(alt.modellText.schema);
    const n = JSON.stringify(neu.modellText.schema);
    if (a !== n) aus.push({ feld: "eingabe", vorher: a, nachher: n });
  }
  const ha = hinweisText(alt.hinweiseLautApp);
  const hn = hinweisText(neu.hinweiseLautApp);
  if (ha !== hn) aus.push({ feld: "hinweise", vorher: ha, nachher: hn });
  return aus;
}

/**
 * Tiefe, ab der PaiBot ein Schema nicht mehr ganz zeigt (Schutz vor zu tiefer Rekursion; die
 * Datenbank lässt ohnehin höchstens 64 KB je Schema zu). Wird sie überschritten, gilt das Schema
 * als nicht vollständig zeigbar, und „liest“ lässt sich nicht wählen.
 */
const MAX_TIEFE = 64;

/** Zahlen- und Längengrenzen im Schema: Sie gehen ans Modell und stehen in der Liste der Texte. */
const GRENZ_STICHWORTE = [
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
] as const;

/** Name der Wurzel des Schemas in der Liste der Texte. */
const WURZEL = "(Werkzeug)";

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
    // Auch die Wurzel des Schemas geht ans Modell (ihre Beschreibung bleibt erhalten): Sie steht
    // unter dem Namen „(Werkzeug)“ in der Liste, nicht unter einem Feld.
    const ort = pfad === "" ? WURZEL : pfad;
    // Auch Typ, Pflichtfelder und Grenzen gehen ans Modell: Sie stehen als eigene Zeilen da.
    if (typeof knoten.type === "string") nimm(ort, "typ", knoten.type);
    else if (Array.isArray(knoten.type)) for (const v of knoten.type) nimm(ort, "typ", v);
    if (Array.isArray(knoten.required) && knoten.required.length > 0) {
      for (const v of knoten.required) nimm(ort, "pflicht", v);
    }
    for (const grenze of GRENZ_STICHWORTE) {
      if (grenze in knoten) nimm(ort, "grenze", `${grenze} ${alsText(knoten[grenze])}`);
    }
    if (typeof knoten.additionalProperties === "boolean") {
      nimm(ort, "zusatz", knoten.additionalProperties ? "ja" : "nein");
    }
    if (typeof knoten.description === "string") nimm(ort, "feldbeschreibung", knoten.description);
    if (Array.isArray(knoten.enum)) for (const v of knoten.enum) nimm(ort, "enum", v);
    if ("default" in knoten) nimm(ort, "default", knoten.default);
    if (Array.isArray(knoten.examples)) for (const v of knoten.examples) nimm(ort, "beispiel", v);
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

/** Klasse der Route zu einer Einstufung der Oberfläche: „liest“ wird `lesen`, nie etwas anderes. */
export function klasseVon(art: WerkzeugArt): "lesen" | "schreiben" | "gesperrt" {
  return { liest: "lesen", schreibt: "schreiben", gesperrt: "gesperrt" }[art] as
    | "lesen"
    | "schreiben"
    | "gesperrt";
}

/** Körper von `PUT /api/apps/:id/werkzeuge/:werkzeug`: die Klasse und der Abdruck der gesehenen Fassung. */
export function einstufenKoerper(art: WerkzeugArt, fassung: string) {
  return { klasse: klasseVon(art), gesehenerAbdruck: fassung };
}

/** Eine Meldung zu einer App oder zur Seite. */
export interface Meldung {
  art: "ok" | "fehler";
  text: string;
  ausweg?: string;
  /** Die Liste der Werkzeuge, die PaiBot nicht prüfen kann (fremde Namen). */
  nichtPruefbar?: readonly string[];
  hinweis?: string;
}

/**
 * Fehler der Route als Meldung: der feste Satz der Route mit Ausweg und, bei 429, der Wartezeit;
 * nie ein Text der App. Fehlt der Ausweg, steht die Wartezeit allein da.
 */
export function fehlerMeldung(
  fehler: { text: string; ausweg?: string | undefined },
  wartenSekunden?: number,
): Meldung {
  const warten =
    wartenSekunden === undefined
      ? undefined
      : t("apps.seite.aktion.warten", { sekunden: String(wartenSekunden) });
  const ausweg = [fehler.ausweg, warten].filter((x) => x !== undefined && x !== "").join(" ");
  return { art: "fehler", text: fehler.text, ...(ausweg === "" ? {} : { ausweg }) };
}
