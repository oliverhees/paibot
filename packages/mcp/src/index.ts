/**
 * PaiBot – MCP-Schicht: fremde MCP-Server nur lesend ansprechen. Verbinden, Werkzeug-Liste holen,
 * bereinigen und abdrucken, Eingaben prüfen, Werkzeuge aufrufen, Ergebnisse in Text verwandeln.
 * Noch an keine Stelle von PaiBot angeschlossen (kein Tor, keine Datenbank, kein Lauf).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-07
 */

export * from "./abdruck";
export * from "./bereinigen";
export * from "./ergebnis";
export * from "./fehler";
export * from "./grenzen";
export * from "./namen";
export * from "./schema";
export * from "./struktur";
// Aus der Verbindungs-Datei nur das, was von außen gebraucht wird. Ein Aufruf ohne Prüfung der
// Argumente (`McpVerbindung.rufeAuf`) gehört nicht dazu: Aufgerufen wird nur über `rufeWerkzeugAuf`.
export {
  type AdressePruefung,
  holeWerkzeuge,
  type McpFetch,
  type McpRohListe,
  type McpVerbindungOptionen,
  pruefeAdresse,
  rufeWerkzeugAuf,
  type WerkzeugAbruf,
  type WerkzeugAbrufOptionen,
  type WerkzeugAufrufOptionen,
} from "./verbindung";
export * from "./werkzeug";
