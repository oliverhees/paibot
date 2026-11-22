/**
 * PaiBot – Prüfung fremder Werte (JSON-Form) vor jeder Verarbeitung: Tiefe, Anzahl der Knoten,
 * Kreise, Typen und verbotene Schlüsselnamen. Läuft ohne Rekursion (eigener Stapel) und bricht ab,
 * sobald eine Grenze überschritten ist; auch ein Objekt mit einer Million Schlüsseln hält den
 * Prozess nur so lange fest, wie die Grenze Schritte erlaubt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

/** Namen, die auf `Object.prototype` liegen (`constructor`, `toString`, `__proto__` …). */
export const OBJEKT_NAMEN: ReadonlySet<string> = new Set(
  Object.getOwnPropertyNames(Object.prototype),
);

/** Warum ein Wert abgewiesen wurde. */
export type StrukturProblem =
  | "zu_tief"
  | "zu_viele_knoten"
  | "zu_viele_zeichen"
  | "kreis"
  | "typ_unzulaessig"
  | "schluessel_verboten";

export interface StrukturGrenzen {
  /** Höchste Verschachtelung (die Wurzel zählt als Ebene 1). */
  maxTiefe: number;
  /** Höchstzahl der Knoten (Werte, Elemente und Eigenschaften zusammen). */
  maxKnoten: number;
  /** Höchstzahl der Zeichen aller Texte und Schlüssel zusammen; ohne Angabe unbegrenzt. */
  maxZeichen?: number;
  /** Schlüsselnamen, die auf keiner Ebene vorkommen dürfen (z. B. `OBJEKT_NAMEN`). */
  verboteneSchluessel?: ReadonlySet<string>;
}

export type StrukturErgebnis =
  | { ok: true; tiefe: number; knoten: number; zeichen: number }
  | { ok: false; problem: StrukturProblem };

interface Rahmen {
  wert: unknown;
  tiefe: number;
  /** `true` = Marke zum Verlassen eines Objekts (Kreis-Erkennung). */
  verlassen?: boolean;
}

function istEinfachesObjekt(wert: object): boolean {
  const prototyp = Object.getPrototypeOf(wert);
  return prototyp === Object.prototype || prototyp === null;
}

/**
 * Prüft einen Wert, bevor ihn irgendetwas rekursiv verarbeitet. Erlaubt sind nur JSON-Werte:
 * Text, endliche Zahl, `true`/`false`, `null`, Liste und einfaches Objekt. Alles andere
 * (`undefined`, Funktionen, `bigint`, Symbole, Klassen-Objekte) gilt als unzulässig.
 */
export function pruefeStruktur(wert: unknown, grenzen: StrukturGrenzen): StrukturErgebnis {
  const stapel: Rahmen[] = [{ wert, tiefe: 1 }];
  const aufDemPfad = new Set<object>();
  const verboten = grenzen.verboteneSchluessel;
  let knoten = 0;
  let zeichen = 0;
  let tiefste = 0;

  while (stapel.length > 0) {
    const rahmen = stapel.pop() as Rahmen;
    if (rahmen.verlassen === true) {
      aufDemPfad.delete(rahmen.wert as object);
      continue;
    }
    knoten += 1;
    if (knoten > grenzen.maxKnoten) return { ok: false, problem: "zu_viele_knoten" };
    if (rahmen.tiefe > grenzen.maxTiefe) return { ok: false, problem: "zu_tief" };
    if (rahmen.tiefe > tiefste) tiefste = rahmen.tiefe;

    const aktuell = rahmen.wert;
    if (aktuell === null || typeof aktuell === "boolean") continue;
    if (typeof aktuell === "number") {
      if (!Number.isFinite(aktuell)) return { ok: false, problem: "typ_unzulaessig" };
      continue;
    }
    if (typeof aktuell === "string") {
      zeichen += aktuell.length;
      if (grenzen.maxZeichen !== undefined && zeichen > grenzen.maxZeichen) {
        return { ok: false, problem: "zu_viele_zeichen" };
      }
      continue;
    }
    if (typeof aktuell !== "object") return { ok: false, problem: "typ_unzulaessig" };

    if (aufDemPfad.has(aktuell)) return { ok: false, problem: "kreis" };

    if (Array.isArray(aktuell)) {
      // Die Länge steht fest; so wird eine riesige Liste abgewiesen, ohne ein Element zu lesen.
      if (aktuell.length > grenzen.maxKnoten - knoten) {
        return { ok: false, problem: "zu_viele_knoten" };
      }
      aufDemPfad.add(aktuell);
      stapel.push({ wert: aktuell, tiefe: rahmen.tiefe, verlassen: true });
      for (let index = 0; index < aktuell.length; index++) {
        stapel.push({ wert: aktuell[index], tiefe: rahmen.tiefe + 1 });
      }
      continue;
    }

    if (!istEinfachesObjekt(aktuell)) return { ok: false, problem: "typ_unzulaessig" };
    aufDemPfad.add(aktuell);
    stapel.push({ wert: aktuell, tiefe: rahmen.tiefe, verlassen: true });
    let zaehler = 0;
    // `for … in` statt `Object.keys`: bricht nach der Grenze ab, ohne alle Schlüssel anzulegen.
    for (const schluessel in aktuell) {
      if (!Object.hasOwn(aktuell, schluessel)) continue;
      zaehler += 1;
      if (zaehler > grenzen.maxKnoten - knoten) return { ok: false, problem: "zu_viele_knoten" };
      if (verboten?.has(schluessel) === true) return { ok: false, problem: "schluessel_verboten" };
      zeichen += schluessel.length;
      if (grenzen.maxZeichen !== undefined && zeichen > grenzen.maxZeichen) {
        return { ok: false, problem: "zu_viele_zeichen" };
      }
      stapel.push({
        wert: (aktuell as Record<string, unknown>)[schluessel],
        tiefe: rahmen.tiefe + 1,
      });
    }
  }
  return { ok: true, tiefe: tiefste, knoten, zeichen };
}
