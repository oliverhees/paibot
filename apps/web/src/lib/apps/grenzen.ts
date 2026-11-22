/**
 * PaiBot – Grenzwerte der Eingaben für Apps. Diese Datei hat keine Importe und darf keine bekommen:
 * `routen.ts` bindet die Eingaben ein und wird auch im Browser geladen, dort darf kein Server-Code
 * (Verschlüsselung, MCP-Schicht) ankommen. Wer Server-Code braucht, importiert `adresse.ts` oder
 * `token.ts` direkt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

/** Längste Adresse, die die Web-App liest. */
export const MAX_ADRESSE_ZEICHEN = 2000;

/** Längster Token, den die Web-App annimmt. */
export const MAX_TOKEN_ZEICHEN = 4096;
