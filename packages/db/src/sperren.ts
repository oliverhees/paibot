/**
 * PaiBot – Schlüssel der Datenbank-Sperren, die Prozesse untereinander abstimmen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

/** Sperre beim Anhängen eines Belegs an die Kette. */
export const BELEGE_LOCK_KEY = 2026112001;

/** Sperre beim Anwenden der Migrationen. */
export const MIGRATION_LOCK_KEY = 2026112002;
