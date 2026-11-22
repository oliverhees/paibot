/**
 * PaiBot – Werkzeug-Aufrufe für die Anzeige im Chat: aus der gespeicherten Zeile wird eine kleine
 * Projektion (Zustand, Fundstellen, Kurzform der Frage, Belege). Das Ergebnis im Ganzen, die Texte
 * der Abschnitte und der Abdruck der Argumente verlassen den Server nie.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import type { ToolCallRecord } from "@paibot/shared/objekte";
import type { QuelleAnzeige, WerkzeugAnzeige, WerkzeugAnzeigeStatus } from "./typen";

/** Kennung des Werkzeugs „In der Doku nachschlagen“. */
export const WERKZEUG_DOKU = "eingebaut/doku.nachschlagen";

/** So viele Fundstellen gehen je Aufruf zur Oberfläche. */
export const QUELLEN_GRENZE = 10;
/** So viele Zeichen der Frage gehen zur Oberfläche. */
export const EINGABE_GRENZE = 120;
/** So viele Zeichen hat ein Name vom Modell. */
export const NAME_GRENZE = 64;
/** So viele Aufrufe gehen je Lauf zur Oberfläche. */
export const AUFRUFE_JE_LAUF = 64;

const SEITE_GRENZE = 200;
const ANKER_GRENZE = 200;
const TITEL_GRENZE = 300;

const STATUS: Record<ToolCallRecord["status"], WerkzeugAnzeigeStatus> = {
  requested: "laeuft",
  waiting_approval: "laeuft",
  approved: "laeuft",
  running: "laeuft",
  succeeded: "fertig",
  failed: "fehlgeschlagen",
  denied: "abgelehnt",
  cancelled: "abgebrochen",
};

/** Wert als Objekt, sonst `undefined`. */
function objekt(wert: unknown): Record<string, unknown> | undefined {
  return typeof wert === "object" && wert !== null && !Array.isArray(wert)
    ? (wert as Record<string, unknown>)
    : undefined;
}

/** Höchstens `grenze` Zeichen (ganze Zeichen, keine halben). */
function kuerzen(text: string, grenze: number): string {
  const zeichen = [...text];
  return zeichen.length <= grenze ? text : zeichen.slice(0, grenze).join("");
}

/**
 * Fundstellen und „nichts gefunden“ aus dem gespeicherten Ergebnis eines Nachschlagens: nur aus der
 * Hülle mit Zustand „ok“, nur die gesendeten Abschnitte (eine gekürzte Hülle trägt weniger), nur
 * Seite, Anker und Titel.
 */
function ausErgebnis(output: unknown): { quellen: QuelleAnzeige[]; nichtsGefunden: boolean } {
  const huelle = objekt(output);
  const inhalt = objekt(huelle?.inhalt);
  if (huelle?.paibot !== "werkzeug-ergebnis" || huelle.status !== "ok" || inhalt === undefined) {
    return { quellen: [], nichtsGefunden: false };
  }
  if (inhalt.status === "nichts_gefunden") return { quellen: [], nichtsGefunden: true };
  if (inhalt.status !== "gefunden" || !Array.isArray(inhalt.abschnitte)) {
    return { quellen: [], nichtsGefunden: false };
  }
  const quellen: QuelleAnzeige[] = [];
  for (const roh of inhalt.abschnitte) {
    const a = objekt(roh);
    if (
      a !== undefined &&
      typeof a.seite === "string" &&
      typeof a.anker === "string" &&
      typeof a.titel === "string"
    ) {
      quellen.push({
        seite: kuerzen(a.seite, SEITE_GRENZE),
        anker: kuerzen(a.anker, ANKER_GRENZE),
        titel: kuerzen(a.titel, TITEL_GRENZE),
      });
    }
    if (quellen.length >= QUELLEN_GRENZE) break;
  }
  return { quellen, nichtsGefunden: false };
}

/** Die Projektion eines Aufrufs. */
export function werkzeugAnzeige(z: ToolCallRecord): WerkzeugAnzeige {
  const key = z.toolKey ?? "";
  const doku = key === WERKZEUG_DOKU;
  const ergebnis = doku && z.status === "succeeded" ? ausErgebnis(z.output) : undefined;
  const frage = doku ? objekt(z.input)?.frage : undefined;
  const belegId = z.resultReceiptId ?? z.decisionReceiptId;
  return {
    actionId: z.actionId,
    runId: z.runId,
    step: z.step ?? 0,
    position: z.position,
    key,
    name: z.name,
    status: STATUS[z.status],
    ...(z.errorCode === undefined ? {} : { code: z.errorCode }),
    ...(ergebnis === undefined || ergebnis.nichtsGefunden || ergebnis.quellen.length === 0
      ? {}
      : { quellen: ergebnis.quellen }),
    ...(ergebnis?.nichtsGefunden === true ? { nichtsGefunden: true } : {}),
    ...(typeof frage === "string" && frage !== ""
      ? { eingabeKurz: kuerzen(frage, EINGABE_GRENZE) }
      : {}),
    ...(z.rawName === undefined ? {} : { nameVomModell: kuerzen(z.rawName, NAME_GRENZE) }),
    ...(z.decisionReceiptId === undefined ? {} : { entscheidungBelegId: z.decisionReceiptId }),
    ...(belegId === undefined ? {} : { belegId }),
  };
}

/** Projektionen mehrerer Aufrufe, je Lauf höchstens `AUFRUFE_JE_LAUF`, in der Reihenfolge der Eingabe. */
export function werkzeugeAnzeigen(zeilen: readonly ToolCallRecord[]): WerkzeugAnzeige[] {
  const zaehler = new Map<string, number>();
  const aus: WerkzeugAnzeige[] = [];
  for (const z of zeilen) {
    const n = zaehler.get(z.runId) ?? 0;
    if (n >= AUFRUFE_JE_LAUF) continue;
    zaehler.set(z.runId, n + 1);
    aus.push(werkzeugAnzeige(z));
  }
  return aus;
}
