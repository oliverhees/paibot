/**
 * PaiBot – Beleg-Export im JSONL-Format schreiben und lesen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { ReceiptEntry, ReceiptExportHeader } from "@paibot/shared/belege";
import { notImplemented } from "@paibot/stub";

/** Medientyp des Exports. */
export const EXPORT_MEDIA_TYPE = "application/x-ndjson";

/**
 * Schreibt den Export Zeile für Zeile, jede Zeile mit `\n` am Ende.
 *
 * - Zeile 1: `header` (`{"format":"pb-belege","v":1,"installationId":…,"publicKeys":[…]}`).
 * - Jede weitere Zeile: ein Eintrag mit den Schlüsseln in genau der Reihenfolge
 *   `seq, id, hash, signature, keyId, body`; `body` in kanonischer Form.
 *
 * Zusagen: Einträge erscheinen in der gelieferten Reihenfolge; nichts wird gepuffert außer der
 * aktuellen Zeile.
 */
export function exportJsonl(
  header: ReceiptExportHeader,
  entries: Iterable<ReceiptEntry> | AsyncIterable<ReceiptEntry>,
): AsyncIterable<string> {
  return notImplemented("receipts.exportJsonl", header, entries);
}

/** Gelesener Export. */
export interface ParsedExport {
  header: ReceiptExportHeader;
  entries: ReceiptEntry[];
}

/** Fehler beim Lesen eines Exports, mit der Zeilennummer (ab 1). */
export class ExportFormatError extends Error {
  readonly line: number;

  constructor(line: number, message: string) {
    super(`Zeile ${line}: ${message}`);
    this.name = "ExportFormatError";
    this.line = line;
  }
}

/**
 * Liest einen Export. Leere Zeilen am Ende werden ignoriert.
 *
 * Fehler: `ExportFormatError`, wenn die erste Zeile nicht `receiptExportHeaderSchema` besteht oder
 * eine Eintragszeile kein JSON ist bzw. `receiptEntrySchema` nicht besteht. Die Kette selbst
 * prüft `verifyChain`.
 */
export function parseJsonl(text: string): ParsedExport {
  return notImplemented("receipts.parseJsonl", text);
}
