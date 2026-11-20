/**
 * PaiBot – Beleg-Export im JSONL-Format schreiben und lesen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import {
  type ReceiptEntry,
  type ReceiptExportHeader,
  receiptEntrySchema,
  receiptExportHeaderSchema,
} from "@paibot/shared/belege";
import { t } from "@paibot/shared/texte";
import { type CanonicalValue, canonicalize } from "./canonical";

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
export async function* exportJsonl(
  header: ReceiptExportHeader,
  entries: Iterable<ReceiptEntry> | AsyncIterable<ReceiptEntry>,
): AsyncIterable<string> {
  yield `${headerLine(header)}\n`;
  for await (const entry of entries) yield `${entryLine(entry)}\n`;
}

/** Kopfzeile mit fester Reihenfolge der Schlüssel. */
function headerLine(header: ReceiptExportHeader): string {
  const keys = header.publicKeys.map(
    (key) =>
      `{"keyId":${JSON.stringify(key.keyId)},"publicKey":${JSON.stringify(key.publicKey)},"fingerprint":${JSON.stringify(key.fingerprint)}}`,
  );
  return `{"format":${JSON.stringify(header.format)},"v":${header.v},"installationId":${JSON.stringify(header.installationId)},"publicKeys":[${keys.join(",")}]}`;
}

/** Eintragszeile mit den Schlüsseln `seq, id, hash, signature, keyId, body`. */
function entryLine(entry: ReceiptEntry): string {
  const body = canonicalize(entry.body as unknown as CanonicalValue);
  return `{"seq":${canonicalize(entry.seq)},"id":${JSON.stringify(entry.id)},"hash":${JSON.stringify(entry.hash)},"signature":${JSON.stringify(entry.signature)},"keyId":${JSON.stringify(entry.keyId)},"body":${body}}`;
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
    super(t("belege.export.zeile", { zeile: line, grund: message }));
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
  const lines = text.split("\n").map((line) => (line.endsWith("\r") ? line.slice(0, -1) : line));
  while (lines.length > 0 && lines[lines.length - 1]?.trim() === "") lines.pop();
  if (lines.length === 0) throw new ExportFormatError(1, t("belege.export.datei_leer"));

  const headerValue = parseLine(lines[0] ?? "", 1);
  const header = receiptExportHeaderSchema.safeParse(headerValue);
  if (!header.success) {
    throw new ExportFormatError(1, t("belege.export.kopfzeile"));
  }

  const entries: ReceiptEntry[] = [];
  for (let index = 1; index < lines.length; index++) {
    const lineNumber = index + 1;
    const value = parseLine(lines[index] ?? "", lineNumber);
    if (!receiptEntrySchema.safeParse(value).success) {
      throw new ExportFormatError(lineNumber, t("belege.export.kein_beleg"));
    }
    // Der gelesene Wert bleibt unverändert, damit die Prüfsumme über genau diese Daten läuft.
    entries.push(value as ReceiptEntry);
  }
  return { header: header.data, entries };
}

function parseLine(line: string, lineNumber: number): unknown {
  if (line.trim() === "") throw new ExportFormatError(lineNumber, t("belege.export.zeile_leer"));
  try {
    return JSON.parse(line) as unknown;
  } catch {
    throw new ExportFormatError(lineNumber, t("belege.export.kein_json"));
  }
}
