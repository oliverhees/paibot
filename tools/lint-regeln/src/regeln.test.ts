/**
 * PaiBot – Test, dass `pnpm lint` verbotene Importe zwischen den Paketen und Text-Kennungen für
 * Modelle ablehnt und erlaubte Importe durchlässt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const BIOME = createRequire(import.meta.url).resolve("@biomejs/biome/bin/biome");

interface Diagnostic {
  category: string;
  message: string;
}

/**
 * Legt eine Datei in `<ordner>/__lint_versuch_<pid>__/<name>` an (außerhalb von `src`, damit
 * Typprüfung und Bau sie nie sehen), prüft sie mit Biome und löscht sie wieder.
 */
function lint(folder: string, source: string, name = "versuch.ts"): Diagnostic[] {
  const dir = path.join(ROOT, folder, `__lint_versuch_${process.pid}__`);
  const file = path.join(dir, name);
  mkdirSync(dir, { recursive: true });
  try {
    writeFileSync(file, source);
    let output: string;
    try {
      output = execFileSync(
        process.execPath,
        [BIOME, "lint", "--reporter=json", path.relative(ROOT, file)],
        { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      );
    } catch (error) {
      output = (error as { stdout: string }).stdout;
    }
    const report = JSON.parse(output) as { diagnostics: Diagnostic[] };
    return report.diagnostics.filter(
      (d) => d.category === "lint/style/noRestrictedImports" || d.category === "plugin",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const IMPORT_RULE = "lint/style/noRestrictedImports";

describe("Importe zwischen den Paketen", () => {
  it("die Web-App importiert weder den Motor noch den Modell-Zugang noch die Modell-Bibliothek", () => {
    const found = lint(
      "apps/web",
      [
        'import { createAiSdkMotor } from "@paibot/agents";',
        'import { createFakeMotor } from "@paibot/agents/testing";',
        'import { resolveModel } from "@paibot/llm/modell";',
        'import { streamText } from "ai";',
        "export const x = [createAiSdkMotor, createFakeMotor, resolveModel, streamText];",
      ].join("\n"),
    );
    expect(found.filter((d) => d.category === IMPORT_RULE)).toHaveLength(4);
  });

  it("die Web-App darf Tor, Belege, Warteschlange und die übrige Anbieter-Schicht nutzen", () => {
    const found = lint(
      "apps/web",
      [
        'import { createGate } from "@paibot/gate";',
        'import { testConnection } from "@paibot/llm";',
        'import { verifyChain } from "@paibot/receipts/pruefen";',
        'import { createQueue } from "@paibot/jobs";',
        "export const x = [createGate, testConnection, verifyChain, createQueue];",
      ].join("\n"),
    );
    expect(found).toEqual([]);
  });

  it("nur der Motor importiert die Modell-Bibliothek, nur die Warteschlange pg-boss", () => {
    expect(lint("packages/llm", 'export { streamText } from "ai";')).not.toEqual([]);
    expect(lint("packages/agents", 'export { streamText } from "ai";')).not.toEqual([]);
    expect(lint("packages/gate", 'export * from "@ai-sdk/openai-compatible";')).not.toEqual([]);
    expect(lint("apps/worker", 'export { PgBoss } from "pg-boss";')).not.toEqual([]);
    expect(lint("packages/jobs", 'export { PgBoss } from "pg-boss";')).toEqual([]);
  });

  it("kein Paket importiert aus apps/*", () => {
    expect(lint("packages/gate", 'export * from "../../apps/web/src/lib/routen";')).not.toEqual([]);
    expect(lint("packages/receipts", 'export * from "@paibot/worker";')).not.toEqual([]);
  });

  it("die Pakete halten ihre Schichten ein", () => {
    expect(lint("packages/gate", 'export * from "@paibot/db";')).not.toEqual([]);
    expect(lint("packages/crypto", 'export * from "@paibot/shared";')).not.toEqual([]);
    expect(lint("packages/llm", 'export * from "@paibot/agents";')).not.toEqual([]);
    expect(lint("packages/shared", 'export * from "@paibot/gate";')).not.toEqual([]);
    expect(lint("packages/receipts", 'export * from "@paibot/gate/src/evaluate";')).not.toEqual([]);
    expect(lint("packages/receipts", 'export * from "@paibot/gate";')).toEqual([]);
  });
});

describe("Test-Zugänge", () => {
  const PERMIT = [
    'import { withTestPermit } from "@paibot/gate/testing";',
    "export const x = withTestPermit;",
  ].join("\n");

  it("Produktivcode darf den Test-Zugang des Tors nicht importieren, in keinem Paket", () => {
    for (const folder of ["packages/llm", "packages/receipts", "packages/agents", "apps/worker"]) {
      const found = lint(folder, PERMIT);
      expect(found.filter((d) => d.category === "plugin")).toHaveLength(1);
    }
    const reexport = lint("packages/receipts", 'export * from "@paibot/gate/testing";');
    expect(reexport.filter((d) => d.category === "plugin")).toHaveLength(1);
    const dynamic = lint("apps/worker", 'export const m = await import("@paibot/gate/testing");');
    expect(dynamic.filter((d) => d.category === "plugin")).toHaveLength(1);
  });

  it("Tests dürfen den Test-Zugang nutzen", () => {
    expect(lint("packages/llm", PERMIT, "versuch.test.ts")).toEqual([]);
    expect(lint("packages/receipts", PERMIT, "versuch.test.ts")).toEqual([]);
  });

  it("ein Text, der den Pfad nur nennt, ist kein Import", () => {
    expect(
      lint("packages/llm", 'export const pfad = "import x from @paibot/gate/testing";'),
    ).toEqual([]);
  });

  it("der Krypto-Test darf die Test-Datenbank nutzen, sonst bleibt das Paket ohne Datenbank", () => {
    const testDb = 'export { createTestDb } from "@paibot/db/testing";';
    expect(lint("packages/crypto", testDb, "versuch.test.ts")).toEqual([]);
    expect(lint("packages/crypto", 'export * from "@paibot/db";', "versuch.test.ts")).not.toEqual(
      [],
    );
    expect(lint("packages/crypto", testDb)).not.toEqual([]);
  });
});

describe("Modelle über Text-Kennungen", () => {
  it("wird überall abgelehnt, auch im Motor-Paket", () => {
    const found = lint(
      "packages/agents",
      [
        "declare function streamText(options: { model: unknown; prompt: string }): void;",
        'streamText({ model: "openai/gpt-4o", prompt: "Hallo" });',
        "streamText({ model: `mistral/klein`, prompt: 'Hallo' });",
      ].join("\n"),
    );
    expect(found.filter((d) => d.category === "plugin")).toHaveLength(2);
  });

  it("ein Modell-Objekt ist erlaubt", () => {
    const found = lint(
      "packages/agents",
      [
        "declare function streamText(options: { model: unknown; prompt: string }): void;",
        "declare const model: object;",
        'streamText({ model, prompt: "Hallo" });',
        'streamText({ model: model, prompt: "Hallo" });',
      ].join("\n"),
    );
    expect(found).toEqual([]);
  });
});
