/**
 * PaiBot – Tests für den Beleg-Export im JSONL-Format.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import type { ReceiptEntry, ReceiptExportHeader } from "@paibot/shared/belege";
import { beforeAll, describe, expect, it } from "vitest";
import { canonicalize } from "./canonical";
import { EXPORT_MEDIA_TYPE, ExportFormatError, exportJsonl, parseJsonl } from "./jsonl";
import { buildChain, keyInfo, TEST_INSTALLATION, type TestKey, testKey } from "./testhilfen";
import { verifyChain } from "./verify";

let key: TestKey;
let chain: ReceiptEntry[];
let header: ReceiptExportHeader;

async function collect(lines: AsyncIterable<string>): Promise<string[]> {
  const result: string[] = [];
  for await (const line of lines) result.push(line);
  return result;
}

beforeAll(async () => {
  key = testKey();
  chain = await buildChain(6, key);
  header = {
    format: "pb-belege",
    v: 1,
    installationId: TEST_INSTALLATION,
    publicKeys: [keyInfo(key)],
  };
});

function errorLine(text: string): number {
  try {
    parseJsonl(text);
  } catch (error) {
    if (error instanceof ExportFormatError) return error.line;
    throw error;
  }
  throw new Error("parseJsonl hätte werfen müssen.");
}

describe("exportJsonl", () => {
  it("schreibt Kopfzeile und Einträge in fester Reihenfolge, jede Zeile mit Zeilenumbruch", async () => {
    const lines = await collect(exportJsonl(header, chain));
    expect(lines).toHaveLength(7);
    for (const line of lines) expect(line.endsWith("\n")).toBe(true);
    expect(lines[0]).toBe(
      `{"format":"pb-belege","v":1,"installationId":"${TEST_INSTALLATION}","publicKeys":[{"keyId":"${key.keyId}","publicKey":"${key.publicKey}","fingerprint":"${key.fingerprint}"}]}\n`,
    );
    const first = JSON.parse(lines[1] ?? "") as object;
    expect(Object.keys(first)).toEqual(["seq", "id", "hash", "signature", "keyId", "body"]);
    // Körper in kanonischer Form: Schlüssel sortiert.
    const bodyText = (lines[1] ?? "").slice((lines[1] ?? "").indexOf('"body":') + 7, -2);
    expect(bodyText).toBe(canonicalize(chain[0]?.body as never));
    expect(EXPORT_MEDIA_TYPE).toBe("application/x-ndjson");
  });

  it("lässt sich lesen und ohne Datenbank prüfen", async () => {
    const text = (await collect(exportJsonl(header, chain))).join("");
    const parsed = parseJsonl(text);
    expect(parsed.header).toEqual(header);
    expect(parsed.entries).toHaveLength(6);
    const report = await verifyChain(parsed.entries, parsed.header.publicKeys);
    expect(report.ok).toBe(true);
    expect(report.head).toEqual({ seq: 6, hash: chain[5]?.hash });
  });

  it("nimmt auch asynchrone Folgen und Zeilenenden mit \\r\\n", async () => {
    async function* stream() {
      yield* chain;
    }
    const text = (await collect(exportJsonl(header, stream()))).join("").replaceAll("\n", "\r\n");
    expect(parseJsonl(`${text}\n\n`).entries).toHaveLength(6);
  });
});

describe("parseJsonl", () => {
  it("meldet die Zeilennummer bei Fehlern", async () => {
    const lines = await collect(exportJsonl(header, chain));
    expect(errorLine("")).toBe(1);
    expect(errorLine("kein json\n")).toBe(1);
    expect(errorLine(`{"format":"anderes","v":1}\n`)).toBe(1);
    expect(errorLine([lines[0], lines[1], "{nicht json\n"].join(""))).toBe(3);
    expect(errorLine([lines[0], "\n", lines[1]].join(""))).toBe(2);
    const wrong = JSON.parse(lines[2] ?? "") as { body: { seq: number } };
    wrong.body.seq = 99;
    expect(errorLine([lines[0], lines[1], `${JSON.stringify(wrong)}\n`].join(""))).toBe(3);
  });

  it("die Meldung nennt die Zeile", () => {
    expect(() => parseJsonl("x")).toThrow(/^Zeile 1: /);
  });
});
