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

// Werte der Spalten für Aufträge (ab Migration 0020). Die Arten stimmen mit `AUFTRAG_ARTEN` der
// Tor-Fassung 5 überein (ohne `keiner`: ohne Auftrag gibt es keine Zeile); ein Test prüft das.

/** Art eines Auftrags. `rueckkehr`, `sammeln` und `rueckmeldung` legt nur der Server an. */
export const AUFTRAG_ARTEN_DB = [
  "wurzel",
  "uebergabe",
  "bitte",
  "rueckkehr",
  "faecher",
  "sammeln",
  "rueckmeldung",
  "rueckgabe",
] as const;
/** Arten, die der Server ohne eigenen Geber anlegt (der Stab kehrt zurück, Antworten werden gesammelt). */
export const AUFTRAG_SERVER_ARTEN = ["rueckkehr", "sammeln", "rueckmeldung"] as const;
/** Stand eines Auftrags. Beginnt immer mit `gefragt`. */
export const AUFTRAG_STATUS = [
  "gefragt",
  "arbeitet",
  "wartet_auf_dich",
  "fertig",
  "gescheitert",
  "abgelehnt",
  "abgebrochen",
] as const;
/** Offene Stände: Der Auftrag ist noch nicht zu Ende. */
export const AUFTRAG_OFFENE_STATUS = ["gefragt", "arbeitet", "wartet_auf_dich"] as const;
/** Endzustände eines Auftrags. */
export const AUFTRAG_END_STATUS = ["fertig", "gescheitert", "abgelehnt", "abgebrochen"] as const;
/** Arten der Ereignisse eines Auftrags (nur anhängen, ohne Inhalte). */
export const AUFTRAG_EREIGNIS_TYPEN = ["auftrag.created", "auftrag.status", "stab.moved"] as const;
/** Stand eines Fadens (Kopf). */
export const FADEN_STAENDE = [
  "laufend",
  "wartet_auf_dich",
  "wartet_auf_abnahme",
  "fertig",
  "abgebrochen",
  "gescheitert",
] as const;
/**
 * Herkunft einer Nachricht in der Datenbank: zu `MESSAGE_ORIGINS` (`modell`, `fest`) kommen
 * `rueckmeldung` (feste Rückmeldung eines Teams im Chat mit Pai) und `vorschlag` (deine Nachricht
 * aus einem Antwort-Vorschlag, mit Bezug auf die Frage).
 */
export const NACHRICHT_HERKUENFTE = ["modell", "fest", "rueckmeldung", "vorschlag"] as const;
/** Fester Zuschlag je Klick „+10.000 Token“ und Höchstzahl der Zuschläge je Auftragsbaum. */
export const AUFTRAG_ZUSCHLAG_TOKENS = 10000;
export const AUFTRAG_MAX_ZUSCHLAEGE = 5;
/** Höchstlänge des Zettels eines Auftrags in Zeichen. */
export const AUFTRAG_ZETTEL_MAX = 2000;
