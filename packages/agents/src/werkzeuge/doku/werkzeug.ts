/**
 * PaiBot – Das Werkzeug „In der Doku nachschlagen“: Eintrag fürs Register (eingebaut, nur lesen,
 * intern, eigener Inhalt), Schemas von Eingabe und Ergebnis, feste Beschreibung an das Modell.
 * Es sucht nur im geladenen Index, den die Fabrik bekommt; es liest keine Datei und geht nicht
 * ins Netz.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import type { JsonValue } from "@paibot/shared/motor";
import type { ToolDefinition, ToolKey, ToolSourceRef } from "@paibot/shared/werkzeug";
import { z } from "zod";
import {
  type GeladenerDokuIndex,
  MAX_ABSCHNITTE,
  MAX_TEXT_JE_ABSCHNITT,
  MAX_ZEICHEN_GESAMT,
  sucheImIndex,
} from "./suche";

/** Kennung des Werkzeugs; R-010 erlaubt genau diese. */
export const DOKU_TOOL_KEY: ToolKey = "eingebaut/doku.nachschlagen";

/** Name des Werkzeugs für das Modell. */
export const DOKU_MODEL_NAME = "doku_nachschlagen";

/** Zeitgrenze eines Aufrufs. */
export const DOKU_TIMEOUT_MS = 2000;

/** Feste Beschreibung an das Modell. */
export const DOKU_BESCHREIBUNG =
  "Sucht in der Doku dieser PaiBot-Version. Nutze es für jede Frage dazu, wie PaiBot funktioniert, was es kann oder wie man etwas einstellt. „frage“: die Frage in wenigen Worten. „andere_begriffe“: bis zu zwei andere Wörter für dasselbe. Liefert passende Abschnitte mit Seite und Titel oder „nichts_gefunden“.";

/** Eingabe: eine Frage (3 bis 200 Zeichen) und bis zu zwei andere Begriffe (je 1 bis 80). */
export const dokuEingabeSchema = z.strictObject({
  frage: z.string().min(3).max(200),
  andere_begriffe: z.array(z.string().min(1).max(80)).max(2).optional(),
});
export type DokuEingabe = z.infer<typeof dokuEingabeSchema>;

const trefferSchema = z.strictObject({
  id: z.string().max(300),
  seite: z.string().max(200),
  anker: z.string().max(200),
  titel: z.string().max(300),
  text: z.string().max(MAX_TEXT_JE_ABSCHNITT),
});

/** Name der durchsuchten Quelle, wie ihn das Modell im leeren Ergebnis sieht. */
export const DOKU_QUELLE = "Doku von PaiBot";

/** Ergebnis: gefundene Abschnitte mit dem Doku-Stand oder „nichts gefunden“. */
export const dokuErgebnisSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("gefunden"),
    stand: z.string().max(80),
    abschnitte: z.array(trefferSchema).min(1).max(MAX_ABSCHNITTE),
  }),
  z.strictObject({
    status: z.literal("nichts_gefunden"),
    stand: z.string().max(80),
    /** Wo gesucht wurde. */
    quelle: z.literal(DOKU_QUELLE),
    /** Zahl der Fundstellen; hier immer 0. */
    gefunden: z.literal(0),
  }),
]);
export type DokuErgebnis = z.infer<typeof dokuErgebnisSchema>;

/** Quellen eines Ergebnisses: Seite, Anker und Titel je Abschnitt, in der Reihenfolge des Ergebnisses. */
export function dokuQuellen(ergebnis: DokuErgebnis): ToolSourceRef[] {
  if (ergebnis.status !== "gefunden") return [];
  return ergebnis.abschnitte.map((a) => ({ seite: a.seite, anker: a.anker, titel: a.titel }));
}

/**
 * Das Werkzeug über einem geladenen Index. Der Index kommt nur über diese Fabrik (es gibt keinen
 * Anschluss dafür); `run` liest nur ihn.
 */
export function dokuNachschlagen(
  index: GeladenerDokuIndex,
): ToolDefinition<DokuEingabe & JsonValue, DokuErgebnis & JsonValue> {
  const maxOutputChars = MAX_ZEICHEN_GESAMT;
  return {
    key: DOKU_TOOL_KEY,
    modelName: DOKU_MODEL_NAME,
    version: 1,
    title: "werkzeug.titel.doku_nachschlagen",
    description: DOKU_BESCHREIBUNG,
    source: "eingebaut",
    kind: "lesen",
    reach: "intern",
    // Eigener Inhalt, solange der Index nur beim Bau aus dem Repo entsteht.
    foreignContent: false,
    gateAction: "werkzeug.aufrufen",
    input: dokuEingabeSchema as unknown as z.ZodType<DokuEingabe & JsonValue>,
    output: dokuErgebnisSchema as unknown as z.ZodType<DokuErgebnis & JsonValue>,
    limits: { timeoutMs: DOKU_TIMEOUT_MS, maxOutputChars },
    async run(eingabe) {
      const anfragen = [eingabe.frage, ...(eingabe.andere_begriffe ?? [])];
      const abschnitte = sucheImIndex(index, anfragen, maxOutputChars, (liste) => ({
        status: "gefunden",
        stand: index.stand,
        abschnitte: liste,
      }));
      const output: DokuErgebnis =
        abschnitte.length === 0
          ? { status: "nichts_gefunden", stand: index.stand, quelle: DOKU_QUELLE, gefunden: 0 }
          : { status: "gefunden", stand: index.stand, abschnitte };
      return { status: "ok", output: output as DokuErgebnis & JsonValue };
    },
    sources: (ergebnis) => dokuQuellen(ergebnis),
  };
}
