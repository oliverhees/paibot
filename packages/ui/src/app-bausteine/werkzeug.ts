/**
 * PaiBot – Typen und Regeln für die Einstufung der Werkzeuge einer App.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

/** Was der Besitzer über das Werkzeug sagt. Ohne seine Bestätigung gilt immer „schreibt“. */
/** Kurze Kennung einer Fassung zum Anzeigen: die ersten acht Zeichen des Abdrucks ohne `sha256:`. */
export function kurzeFassung(abdruck: string): string {
  return abdruck.replace(/^sha256:/, "").slice(0, 8);
}

export type WerkzeugArt = "schreibt" | "liest" | "gesperrt";

/** neu: noch nie bestätigt · bestaetigt: Fassung bestätigt · geaendert: Fassung weicht ab · entfernt: nicht mehr gemeldet */
export type WerkzeugStatus = "neu" | "bestaetigt" | "geaendert" | "entfernt";

/** Was die App über das Verhalten behauptet. Anzeige, nie ein Beleg. */
export type ServerHinweis = "nur_lesend" | "veraendert";

export type AenderungFeld = "name" | "titel" | "beschreibung" | "eingabe" | "ausgabe" | "hinweise";

export interface WerkzeugAenderung {
  feld: AenderungFeld;
  /** Fremder Text; fehlt er, gab es das vorher nicht. */
  vorher?: string;
  nachher?: string;
}

/**
 * Wie PaiBot das Werkzeug jetzt behandelt, egal was die Eigenschaften sonst sagen:
 * nur eine bestätigte Fassung hat die Einstufung des Besitzers; neu zählt als „schreibt“;
 * geändert und entfernt sind gesperrt.
 */
export function wirksameArt(status: WerkzeugStatus, art: WerkzeugArt | undefined): WerkzeugArt {
  if (status === "geaendert" || status === "entfernt") return "gesperrt";
  if (status === "neu") return "schreibt";
  return art ?? "schreibt";
}

/** Geht das Werkzeug an Bots mit Zugriff „darf lesen“? Nur bestätigt und als „liest“. */
export function wirdAngeboten(status: WerkzeugStatus, art: WerkzeugArt | undefined): boolean {
  return status === "bestaetigt" && art === "liest";
}

export interface WerkzeugSumme {
  gesamt: number;
  lesen: number;
  schreiben: number;
  gesperrt: number;
  offen: number;
  geaendert: number;
}

export function werkzeugSumme(
  liste: readonly { status: WerkzeugStatus; art?: WerkzeugArt | undefined }[],
): WerkzeugSumme {
  const summe: WerkzeugSumme = {
    gesamt: liste.length,
    lesen: 0,
    schreiben: 0,
    gesperrt: 0,
    offen: 0,
    geaendert: 0,
  };
  for (const w of liste) {
    if (w.status === "neu") summe.offen += 1;
    else if (w.status === "geaendert") summe.geaendert += 1;
    else if (w.status === "entfernt") summe.gesperrt += 1;
    else if (w.art === "liest") summe.lesen += 1;
    else if (w.art === "gesperrt") summe.gesperrt += 1;
    else summe.schreiben += 1;
  }
  return summe;
}

/** Was an einem Werkzeug außer Name und Beschreibung noch lesbarer Text ans Modell geht. */
export type SchemaTextArt =
  | "feldname"
  | "feldbeschreibung"
  | "enum"
  | "default"
  | "beispiel"
  | "typ"
  | "pflicht"
  | "grenze"
  | "zusatz"
  | "ausgabe";

export interface SchemaText {
  /** Wo im Schema der Text steht, z. B. `aufgabe.status`. Fremder Text wie alles hier. */
  pfad: string;
  art: SchemaTextArt;
  text: string;
}
