/**
 * PaiBot – Die eingebauten Werkzeuge der Auslieferung. Das Werkzeug „In der Doku nachschlagen“
 * ist gebaut (`doku/werkzeug.ts`), in dieser Fassung aber noch nicht eingeschaltet.
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

/** Was die eingebauten Werkzeuge zum Aufbau brauchen. */
export interface EingebauteTeile {
  /** Geladener Doku-Index (`ladeDokuIndex`); wird erst mit dem Einschalten genutzt. */
  dokuIndex?: GeladenerDokuIndex;
}

/**
 * Alle eingebauten Werkzeuge in fester Reihenfolge. In dieser Fassung leer, auch mit Doku-Index:
 * Das Nachschlagen in der Doku wird erst zusammen mit der Anzeige der Schritte im Chat
 * eingeschaltet.
 */
export function builtinTools(
  _teile: EingebauteTeile = {},
): readonly ToolDefinition<JsonValue, JsonValue>[] {
  return [];
}
