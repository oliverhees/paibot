/**
 * PaiBot – Die eingebauten Werkzeuge der Auslieferung: „In der Doku nachschlagen“
 * (`doku/werkzeug.ts`). Es braucht den geladenen Doku-Index; ohne ihn gibt es keine Werkzeuge,
 * sondern einen Fehler.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import type { JsonValue } from "@paibot/shared/motor";
import type { ToolDefinition } from "@paibot/shared/werkzeug";
import type { GeladenerDokuIndex } from "./doku/suche";
import { dokuNachschlagen } from "./doku/werkzeug";

/** Was die eingebauten Werkzeuge zum Aufbau brauchen. */
export interface EingebauteTeile {
  /** Geladener Doku-Index (`ladeDokuIndex`); ohne ihn wirft `builtinTools`. */
  dokuIndex?: GeladenerDokuIndex;
}

/**
 * Alle eingebauten Werkzeuge in fester Reihenfolge: das Nachschlagen in der Doku. Fehlt der
 * Doku-Index, wirft die Funktion; es gibt nie still ein Register ohne das Werkzeug.
 */
export function builtinTools(
  teile: EingebauteTeile = {},
): readonly ToolDefinition<JsonValue, JsonValue>[] {
  if (teile.dokuIndex === undefined) {
    throw new Error(
      "Doku-Index fehlt: das Werkzeug „In der Doku nachschlagen“ lässt sich nicht bauen.",
    );
  }
  return [dokuNachschlagen(teile.dokuIndex) as unknown as ToolDefinition<JsonValue, JsonValue>];
}
