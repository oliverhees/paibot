/**
 * PaiBot – Werkzeuge: Register und eingebaute Werkzeuge.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

export { builtinTools } from "./eingebaut";
export {
  createShippedRegistry,
  createToolRegistry,
  emptyToolRegistry,
  MAX_TOOL_DESCRIPTION_CHARS,
  PLACEHOLDER_TOOL_KEY,
  type RegisteredTool,
  type ToolPlaceholder,
  type ToolRegistry,
  ToolRegistryError,
} from "./register";
