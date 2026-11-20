/**
 * PaiBot – Tests des Befehls `belege:pruefen`.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ReceiptEntry, ReceiptExportHeader } from "@paibot/shared/belege";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCli } from "./cli";
import { exportJsonl } from "./jsonl";
import { buildChain, keyInfo, TEST_INSTALLATION, type TestKey, testKey } from "./testhilfen";

let key: TestKey;
let chain: ReceiptEntry[];
let valid: string;
let dir: string;

async function exportText(entries: ReceiptEntry[]): Promise<string> {
  const header: ReceiptExportHeader = {
    format: "pb-belege",
    v: 1,
    installationId: TEST_INSTALLATION,
    publicKeys: [keyInfo(key)],
  };
  let text = "";
  for await (const line of exportJsonl(header, entries)) text += line;
  return text;
}

async function run(argv: string[], files: Record<string, string> = {}) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runCli(argv, {
    readFile: async (path) => {
      const text = files[path];
      if (text === undefined) throw new Error("ENOENT");
      return text;
    },
    out: (line) => out.push(line),
    err: (line) => err.push(line),
  });
  return { code, out, err };
}

beforeAll(async () => {
  key = testKey();
  chain = await buildChain(8, key);
  valid = await exportText(chain);
  dir = mkdtempSync(join(tmpdir(), "pb-belege-"));
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("runCli", () => {
  it("Exit-Code 0 bei gültiger Kette", async () => {
    const result = await run(["export.jsonl"], { "export.jsonl": valid });
    expect(result.code).toBe(0);
    expect(result.out[0]).toBe("Belege-Kette gültig: 8 Einträge geprüft.");
    expect(result.out[1]).toContain(`Letzter Eintrag: 8 (${chain[7]?.hash})`);
    expect(result.err).toEqual([]);
  });

  it("Exit-Code 1 bei ungültiger Kette, mit Stelle und Prüfungen", async () => {
    const broken = structuredClone(chain);
    (broken[4]?.body as { time: string }).time = "2026-11-21T10:00:00.000Z";
    const result = await run(["export.jsonl"], { "export.jsonl": await exportText(broken) });
    expect(result.code).toBe(1);
    expect(result.out[0]).toBe("Belege-Kette ungültig bei Eintrag 5: 8 Einträge geprüft.");
    expect(result.out).toContain("  ✗ Inhalt verändert");
    expect(result.out).toContain(`  ✓ Signatur gültig (Schlüssel ${key.fingerprint})`);
    expect(result.out).toContain("  ✓ Kette lückenlos bis hier");
  });

  it("Exit-Code 1, wenn ein Eintrag fehlt", async () => {
    const result = await run(["e.jsonl"], {
      "e.jsonl": await exportText(chain.filter((e) => e.seq !== 3)),
    });
    expect(result.code).toBe(1);
    expect(result.out).toContain("  ✗ Kette unterbrochen");
  });

  it("Exit-Code 2 bei falschem Aufruf, fehlender oder kaputter Datei", async () => {
    expect((await run([])).code).toBe(2);
    expect((await run(["a", "b"])).code).toBe(2);
    expect((await run(["--hilfe"])).code).toBe(2);
    const missing = await run(["fehlt.jsonl"]);
    expect(missing.code).toBe(2);
    expect(missing.err[0]).toContain("fehlt.jsonl");
    const bad = await run(["x.jsonl"], { "x.jsonl": "kein export\n" });
    expect(bad.code).toBe(2);
    expect(bad.err[0]).toContain("Zeile 1");
  });

  it("das gebündelte Werkzeug läuft in Node und meldet den Exit-Code", async () => {
    const { build } = await import("esbuild");
    const outfile = join(dir, "belege-pruefen.mjs");
    await build({
      entryPoints: [new URL("./bin.ts", import.meta.url).pathname],
      outfile,
      bundle: true,
      platform: "node",
      format: "esm",
      logLevel: "silent",
    });
    const good = join(dir, "gut.jsonl");
    writeFileSync(good, valid);
    expect(execFileSync(process.execPath, [outfile, good], { encoding: "utf8" })).toContain(
      "gültig",
    );
    const broken = structuredClone(chain);
    broken.splice(2, 1);
    const bad = join(dir, "schlecht.jsonl");
    writeFileSync(bad, await exportText(broken));
    let status: number | null = null;
    try {
      execFileSync(process.execPath, [outfile, bad], { stdio: "pipe" });
    } catch (error) {
      status = (error as { status: number | null }).status;
    }
    expect(status).toBe(1);
  });
});
