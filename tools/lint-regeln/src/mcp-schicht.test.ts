/**
 * PaiBot – Test: Die MCP-Schicht hat keinen eigenen Netz-Zugriff, startet keine Prozesse und nutzt die MCP-Bibliothek nur in einer Datei (Biome läuft wirklich, mit Gegenproben).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
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

function biome(args: string[]): Diagnostic[] {
  let output: string;
  try {
    output = execFileSync(process.execPath, [BIOME, "lint", "--reporter=json", ...args], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    output = (error as { stdout: string }).stdout;
  }
  const bericht = JSON.parse(output) as {
    diagnostics: { category: string; description?: string; message?: unknown }[];
  };
  return bericht.diagnostics.map((d) => ({
    category: d.category,
    message: d.description ?? String(d.message ?? ""),
  }));
}

/** Legt eine Datei unter `packages/mcp/src/` an, prüft sie mit Biome und löscht sie wieder. */
function lint(source: string, name = "versuch.ts"): Diagnostic[] {
  const dir = path.join(ROOT, "packages/mcp/src", `__mcp_versuch_${process.pid}__`);
  mkdirSync(dir, { recursive: true });
  try {
    writeFileSync(path.join(dir, name), source);
    return biome([path.relative(ROOT, path.join(dir, name))]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const importVerbot = (source: string, name?: string) =>
  lint(source, name).filter((d) => d.category === "lint/style/noRestrictedImports");
const netzVerbot = (source: string, name?: string) =>
  lint(source, name).filter((d) => d.category === "plugin" && /Netz-Zugriff/.test(d.message));

describe("MCP-Schicht: verbotene Importe (muss rot sein)", () => {
  const ROT: Record<string, string> = {
    "die MCP-Bibliothek außerhalb der Verbindungs-Datei":
      'import { createMCPClient } from "@ai-sdk/mcp";\nexport { createMCPClient };\n',
    "der Einstieg für fremde Prozesse (stdio)": 'import "@ai-sdk/mcp/mcp-stdio";\n',
    "node:child_process": 'import { spawn } from "node:child_process";\nexport { spawn };\n',
    "cross-spawn": 'import spawn from "cross-spawn";\nexport { spawn };\n',
    "node:http": 'import { request } from "node:http";\nexport { request };\n',
    "node:https": 'import { request } from "node:https";\nexport { request };\n',
    "node:net": 'import { connect } from "node:net";\nexport { connect };\n',
    undici: 'import { fetch } from "undici";\nexport { fetch };\n',
    "die Ausgangs-Hülle selbst":
      'import { createEgressFetch } from "@paibot/llm";\nexport { createEgressFetch };\n',
    "das Tor": 'import { createGate } from "@paibot/gate";\nexport { createGate };\n',
    "eine andere Modell-Bibliothek":
      'import { generateText } from "ai";\nexport { generateText };\n',
  };
  for (const [name, source] of Object.entries(ROT)) {
    it(`${name}`, () => {
      expect(importVerbot(source).length).toBeGreaterThan(0);
    });
  }

  it("in den Tests ist die MCP-Bibliothek und der Test-Server erlaubt", () => {
    const source =
      'import { createMCPClient } from "@ai-sdk/mcp";\nimport { createTestMcpServer } from "@paibot/test-mcp-server";\nexport { createMCPClient, createTestMcpServer };\n';
    expect(importVerbot(source, "x.test.ts")).toEqual([]);
  });
});

describe("MCP-Schicht: kein eigener Netz-Zugriff (muss rot sein)", () => {
  const ROT: Record<string, string> = {
    "fetch(...)": 'export const a = fetch("https://beispiel.invalid");\n',
    "fetch als Wert": "export const f = fetch;\n",
    "globalThis.fetch": 'export const a = globalThis.fetch("https://beispiel.invalid");\n',
    "global.fetch": 'export const a = global.fetch("https://beispiel.invalid");\n',
    "window.fetch": 'export const a = window.fetch("https://beispiel.invalid");\n',
    "self.fetch": 'export const a = self.fetch("https://beispiel.invalid");\n',
    XMLHttpRequest: "export const a = new XMLHttpRequest();\n",
    WebSocket: 'export const a = new WebSocket("wss://beispiel.invalid");\n',
    EventSource: 'export const a = new EventSource("https://beispiel.invalid");\n',
  };
  for (const [name, source] of Object.entries(ROT)) {
    it(`${name}`, () => {
      expect(netzVerbot(source).length).toBeGreaterThan(0);
    });
  }

  it("das hineingereichte fetch (`optionen.fetch`) ist erlaubt", () => {
    const source =
      "export function a(optionen: { fetch: (u: string) => Promise<Response> }) {\n  return optionen.fetch('x');\n}\n";
    expect(netzVerbot(source)).toEqual([]);
  });

  it("in Tests ist das globale fetch erlaubt", () => {
    expect(netzVerbot('export const a = fetch("x");\n', "x.test.ts")).toEqual([]);
  });
});

describe("MCP-Schicht: heutiger Stand", () => {
  it("der Quelltext der Schicht ist frei von Verstößen (verbindung.ts darf die Bibliothek laden)", () => {
    const meldungen = biome(["packages/mcp/src"]).filter(
      (d) => d.category === "plugin" || d.category === "lint/style/noRestrictedImports",
    );
    expect(meldungen).toEqual([]);
  });
});
