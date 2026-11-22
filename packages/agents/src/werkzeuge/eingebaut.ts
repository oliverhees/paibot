/**
 * PaiBot – Die eingebauten Werkzeuge der Auslieferung. In dieser Fassung gibt es noch keins.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import type { JsonValue } from "@paibot/shared/motor";
import type { ToolDefinition } from "@paibot/shared/werkzeug";

/** Alle eingebauten Werkzeuge in fester Reihenfolge; in dieser Fassung leer. */
export function builtinTools(): readonly ToolDefinition<JsonValue, JsonValue>[] {
  return [];
}
