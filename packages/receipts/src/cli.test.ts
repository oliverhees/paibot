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
import {
  encodeAnchor,
  parseAnchor,
  type ReceiptEntry,
  type ReceiptExportHeader,
} from "@paibot/shared/belege";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runCli } from "./cli";
import { exportJsonl } from "./jsonl";
import {
  buildChain,
  keyInfo,
  sendAction,
  sendFacts,
  signedEntry,
  TEST_INSTALLATION,
  type TestKey,
  testEvaluate,
  testKey,
} from "./testhilfen";
import { createAnchor } from "./verify";

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

describe("runCli mit Anker", () => {
  it("ohne Anker: Hinweis, dass ein Kürzen am Ende nicht erkennbar ist", async () => {
    const result = await run(["export.jsonl"], { "export.jsonl": valid });
    expect(result.out).toContain("Kette gültig, alle Schlüssel aus der Kette.");
    expect(result.out).toContain(
      "Ohne Anker geprüft: Ob am Ende Belege fehlen, ist so nicht erkennbar.",
    );
  });

  it("anker gibt den Anker der geprüften Kette als eine Zeile aus", async () => {
    const result = await run(["anker", "export.jsonl"], { "export.jsonl": valid });
    expect(result.code).toBe(0);
    const anchor = parseAnchor(result.out.at(-1) ?? "");
    expect(anchor).toMatchObject({ seq: 8, hash: chain[7]?.hash, startPublicKey: key.publicKey });
    const broken = structuredClone(chain);
    broken.splice(2, 1);
    const bad = await run(["anker", "e.jsonl"], { "e.jsonl": await exportText(broken) });
    expect(bad.code).toBe(1);
    expect(bad.out.some((line) => line.startsWith('{"format":"pb-anker"'))).toBe(false);
  });

  it("--anker als Text oder Datei: passende Kette gültig, gekürzte Kette Exit-Code 1", async () => {
    const anchor = encodeAnchor(createAnchor(chain[0] as ReceiptEntry, chain[7] as ReceiptEntry));
    const asText = await run(["export.jsonl", "--anker", anchor], { "export.jsonl": valid });
    expect(asText.code).toBe(0);
    expect(asText.out).not.toContain(
      "Ohne Anker geprüft: Ob am Ende Belege fehlen, ist so nicht erkennbar.",
    );
    const files = {
      "export.jsonl": await exportText(chain.slice(0, 6)),
      "pb-anker.json": `${anchor}\n`,
    };
    const short = await run(["export.jsonl", "--anker", "pb-anker.json"], files);
    expect(short.code).toBe(1);
    expect(short.out).toContain("Kette ungültig.");
    expect(short.out).toContain(
      "  ✗ Die Kette ist kürzer als der Anker: Am Ende fehlen Belege. (8)",
    );
    // Ohne Anker fällt dieselbe gekürzte Kette nicht auf.
    expect((await run(["export.jsonl"], files)).code).toBe(0);
    expect((await run(["--anker=pb-anker.json", "export.jsonl"], files)).code).toBe(1);
  });

  it("ungültiger oder fehlender Anker: Exit-Code 2", async () => {
    const kaputt = await run(["export.jsonl", "--anker", "{kein anker}"], {
      "export.jsonl": valid,
    });
    expect(kaputt.code).toBe(2);
    expect(kaputt.err).toEqual(["Der Text ist kein gültiger Anker."]);
    expect((await run(["export.jsonl", "--anker"], { "export.jsonl": valid })).code).toBe(2);
    expect(
      (await run(["export.jsonl", "--anker", "fehlt.json"], { "export.jsonl": valid })).code,
    ).toBe(2);
    expect(
      (await run(["anker", "export.jsonl", "--anker", "x"], { "export.jsonl": valid })).code,
    ).toBe(2);
  });

  it("Schlüsselwechsel ohne Beglaubigung: Exit-Code 3", async () => {
    const next = testKey();
    const entries = structuredClone(chain);
    const change = await signedEntry(
      {
        type: "key_change",
        facts: {
          newKeyId: next.keyId,
          publicKey: next.publicKey,
          previousKeyId: key.keyId,
          signedBy: "new",
        },
      },
      entries.at(-1),
      next,
    );
    entries.push(change);
    const action = sendAction();
    const facts = sendFacts();
    entries.push(
      await signedEntry(
        { type: "decision", action, decision: testEvaluate(action, facts), facts },
        change,
        next,
      ),
    );
    const result = await run(["e.jsonl"], { "e.jsonl": await exportText(entries) });
    expect(result.code).toBe(3);
    expect(result.out).toContain(
      "Kette in sich gültig, aber die Vertrauenskette ist unterbrochen.",
    );
  });

  it("die Kopfzeile des Exports trägt den Anker", async () => {
    const anchor = createAnchor(chain[0] as ReceiptEntry, chain[7] as ReceiptEntry);
    let text = "";
    for await (const line of exportJsonl(
      {
        format: "pb-belege",
        v: 1,
        installationId: TEST_INSTALLATION,
        publicKeys: [keyInfo(key)],
        anchor,
      },
      chain,
    )) {
      text += line;
    }
    const first = text.slice(0, text.indexOf("\n"));
    expect(first.endsWith(`,"anchor":${encodeAnchor(anchor)}}`)).toBe(true);
    expect((await run(["e.jsonl"], { "e.jsonl": text })).code).toBe(0);
  });
});
