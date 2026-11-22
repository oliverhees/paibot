/**
 * PaiBot – Datenbankschema: Aufzählungen der Spaltenwerte, abgeleitet aus den gemeinsamen Verträgen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

export {
  ACTION_TYPES,
  ACTIVE_RUN_STATUSES,
  AVATAR_SHAPES,
  BOT_COLORS,
  CONVERSATION_EVENT_TYPES,
  FINISHED_TOOL_CALL_STATUSES,
  MESSAGE_ORIGINS,
  MESSAGE_ROLES,
  MESSAGE_STATUSES,
  PROVIDER_KINDS,
  PROVIDER_TEMPLATE_KEYS,
  RECEIPT_TYPES,
  REGIONS,
  ROUTES,
  RULE_EFFECTS,
  RULE_SOURCES,
  RUN_STATUSES,
  SCHLEUSE_MODES,
  SESSION_AUTH_LEVELS,
  SESSION_METHODS,
  STAGES,
  STORED_ACTION_TYPES,
  TOOL_CALL_STATUSES,
  TOOL_KINDS,
  TOOL_REACHES,
  TOOL_RESULT_STATUSES,
  TOOL_SOURCES,
} from "@paibot/shared";

// Werte der Spalten für Teams (ab Migration 0017). Sie stehen hier, weil die Verträge der Fassung 4
// sie nicht als Aufzählung führen; das Format des Entwurfs in der Web-App benutzt dieselben Wörter.

/** Art einer Unterhaltung: Direkt-Chat mit einem Bot, Faden eines Teams, Entwurf eines Teams. */
export const CONVERSATION_KINDS = ["direkt", "faden", "entwurf"] as const;
/** Wie ein Team zusammenarbeitet. */
export const TEAM_ZUSAMMENARBEIT = ["aus", "leitung_fuehrt"] as const;
/** Wer Ergebnisse abnimmt. */
export const FADEN_ABNAHMEN = ["leitung", "besitzer", "ohne"] as const;
/** Woher ein Faden kommt. In Fassung 4 nur vom Besitzer; `stabschef` kommt mit Fassung 5. */
export const FADEN_HERKUENFTE = ["besitzer"] as const;
/** Stand eines Entwurfs für ein Team. */
export const ENTWURF_STATUS = [
  "offen",
  "angelegt",
  "zurueckgenommen",
  "verworfen",
  "verfallen",
] as const;
/** Woher ein Entwurf kommt. In Fassung 4 nur `vorlage` oder `datei`. */
export const ENTWURF_HERKUENFTE = ["vorlage", "datei"] as const;
/** Was ein Entwurf anlegen kann. */
export const TEAM_ANLAGE_ARTEN = ["bot", "team"] as const;
