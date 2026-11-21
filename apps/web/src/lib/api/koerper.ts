/**
 * PaiBot – Grenzen für den Körper einer Anfrage (ohne weitere Abhängigkeiten, auch für
 * `next.config.ts`).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

/** Größter Körper einer Anfrage ohne eigene Angabe: reicht für Anmeldung, Einrichtung, Einstellungen. */
export const STANDARD_KOERPER_BYTES = 16 * 1024;

/** Größter Körper überhaupt (Nachricht mit `LIMITS.messageChars` Zeichen, auch voll maskiert). */
export const GROESSTER_KOERPER_BYTES = 256 * 1024;
