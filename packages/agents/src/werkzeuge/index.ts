/**
 * PaiBot – Werkzeuge: Register und eingebaute Werkzeuge.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

export { type BelegFelder, belegFelder, dokuAusHuelle } from "./beleg-felder";
export {
  DokuIndexFehler,
  dokuIndexAusText,
  dokuIndexPfad,
  INDEX_FASSUNG,
  ladeDokuIndex,
  MAX_INDEX_BYTES,
} from "./doku/index-laden";
export { type DokuTreffer, type GeladenerDokuIndex, kurzStand, sucheImIndex } from "./doku/suche";
export {
  DOKU_MODEL_NAME,
  DOKU_TOOL_KEY,
  type DokuEingabe,
  type DokuErgebnis,
  dokuEingabeSchema,
  dokuErgebnisSchema,
  dokuNachschlagen,
  dokuQuellen,
} from "./doku/werkzeug";
export { builtinTools, type EingebauteTeile } from "./eingebaut";
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
