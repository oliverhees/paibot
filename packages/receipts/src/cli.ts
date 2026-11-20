/**
 * PaiBot – Befehl `belege:pruefen`: prüft einen Beleg-Export ohne Datenbank.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.0 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { notImplemented } from "@paibot/stub";

/** Ein- und Ausgabe des Befehls, für Tests austauschbar. */
export interface CliIo {
  readFile(path: string): Promise<string>;
  out(line: string): void;
  err(line: string): void;
}

/**
 * `pnpm belege:pruefen <datei.jsonl>`: liest den Export (`parseJsonl`), prüft die Kette mit den
 * öffentlichen Schlüsseln aus der ersten Zeile (`verifyChain`) und gibt das Ergebnis auf Deutsch aus.
 *
 * Rückgabe ist der Exit-Code: 0 = Kette gültig, 1 = Kette ungültig (mit Stelle), 2 = Aufruf oder
 * Datei fehlerhaft.
 */
export function runCli(argv: readonly string[], io: CliIo): Promise<number> {
  return notImplemented("receipts.runCli", argv, io);
}
