/**
 * PaiBot – Schlüssel der Datenbank-Sperren, die Prozesse untereinander abstimmen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

/** Sperre beim Anhängen eines Belegs an die Kette. */
export const BELEGE_LOCK_KEY = 2026112001;

/** Sperre beim Anwenden der Migrationen. */
export const MIGRATION_LOCK_KEY = 2026112002;

/**
 * Sperre beim Anlegen eines Bots. Sie hält Zählen und Einfügen zusammen, damit die Grenze „Bots
 * insgesamt“ auch bei gleichzeitigen Anfragen und über mehrere Prozesse hinweg hält.
 */
export const BOTS_LOCK_KEY = 2026112801;

/**
 * Sperre für die Leitung eines Teams. Sie hält das Prüfen der Mitgliedschaft und das Schreiben der
 * Leitung zusammen (`teams.aendernUnterLeitungspruefung`) und schließt dabei das Versetzen eines
 * Bots (`bots.setTeam`) aus, damit die Leitung eines Teams niemals außerhalb dieses Teams steht –
 * auch bei gleichzeitigen Anfragen und über mehrere Prozesse hinweg.
 */
export const TEAMS_LOCK_KEY = 2026112802;
