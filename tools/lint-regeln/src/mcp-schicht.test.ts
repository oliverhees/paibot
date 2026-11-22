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
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
function lint(source: string, name = "versuch.ts", ordner = "packages/mcp/src"): Diagnostic[] {
  const dir = path.join(ROOT, ordner, `__mcp_versuch_${process.pid}__`);
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

describe("Keine fremden Prozesse auch in den Agents und in der Web-App (muss rot sein)", () => {
  for (const ordner of ["packages/agents/src", "apps/web/src/lib"]) {
    for (const quelle of [
      "node:child_process",
      "child_process",
      "cross-spawn",
      "@ai-sdk/mcp/mcp-stdio",
    ]) {
      it(`${quelle} in ${ordner}`, () => {
        const source = `import * as x from "${quelle}";\nexport { x };\n`;
        const meldungen = lint(source, "versuch.ts", ordner).filter(
          (d) => d.category === "lint/style/noRestrictedImports",
        );
        expect(meldungen.length).toBeGreaterThan(0);
      });
    }
  }
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

describe("MCP-Schicht: keine Umgehung der Sperren (muss rot sein)", () => {
  const ROT: Record<string, string> = {
    "createRequire aus node:module":
      'import { createRequire } from "node:module";\nexport const r = createRequire(import.meta.url);\n',
    "node:module": 'import * as m from "node:module";\nexport { m };\n',
    "node:vm": 'import { runInNewContext } from "node:vm";\nexport { runInNewContext };\n',
    "node:inspector": 'import * as i from "node:inspector";\nexport { i };\n',
    "import() mit zusammengesetztem Namen": 'export const a = import("node:" + "net");\n',
    "import() mit einer Variablen": 'const n = "node:net";\nexport const a = import(n);\n',
    "new Function": 'export const a = new Function("return this")();\n',
    "Function(...)": 'export const a = Function("return this")();\n',
    "process.binding": 'export const a = process.binding("tcp_wrap");\n',
    "process als Wert": "export const a = process;\n",
    eval: 'export const a = eval("1");\n',
    require: 'export const a = require("node:net");\n',
  };
  const umgehung = (source: string, name?: string) =>
    lint(source, name).filter(
      (d) =>
        d.category === "lint/style/noRestrictedImports" ||
        d.category === "lint/security/noGlobalEval" ||
        (d.category === "plugin" && /Weg an den Sperren vorbei|import\(\)/.test(d.message)),
    );
  for (const [name, source] of Object.entries(ROT)) {
    it(`${name}`, () => {
      expect(umgehung(source).length).toBeGreaterThan(0);
    });
  }

  it("ein import() mit fester Zeichenkette ist erlaubt (er unterliegt den Sperren der Importe)", () => {
    expect(umgehung('export const a = import("./anderes");\n')).toEqual([]);
  });

  it("in Tests sind diese Mittel erlaubt", () => {
    expect(umgehung("export const a = process.env;\n", "x.test.ts")).toEqual([]);
  });
});

describe("MCP-Schicht: der Test-Schalter für Adressen steht nirgends im Betriebs-Code", () => {
  /**
   * Der Schalter ist ein eigener Parameter der Funktionen `…Intern` in `packages/mcp/src/verbindung.ts`,
   * nie ein Feld der Optionen. Ihre Namen dürfen nur in der Definition, in Tests und in den Proben der
   * Schicht vorkommen, in jeder Datei, egal wie sie die Schicht erreicht. Das ist eine Suche nach
   * Namen: Sie hält Eingaben, Spreads und `Proxy` ab (die Funktionen lesen den Schalter nie aus den
   * Optionen) und meldet jeden Code im Repo, der die internen Funktionen nennt oder die Datei
   * `verbindung.ts` über einen relativen Pfad einbindet. Wer den Schalter mit eigenem Code aus
   * einem Betriebs-Paket erreichen will, muss die Datei lesen und die Prüfung hier ändern; die
   * Ausgangs-Hülle bleibt der eigentliche Schutz.
   */
  const ERLAUBT = (datei: string) =>
    datei === "packages/mcp/src/verbindung.ts" ||
    /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(datei) ||
    datei.startsWith("packages/mcp/src/spike/") ||
    datei.startsWith("tools/lint-regeln/");

  const SCHALTER =
    /\b(?:holeWerkzeugeIntern|rufeWerkzeugAufIntern|oeffneVerbindungIntern|pruefeAdresseMitSchalter|InterneOptionen)\b/;

  /** Ein relativer Import oder `require`/`import()` in das Quellverzeichnis dieses Pakets von außerhalb. */
  const RELATIV_IN_PAKET =
    /(?:from\s*|import\s*\(\s*|require\s*\(\s*|import\s+)["'](?:\.{1,2}\/)+[^"']*(?:\/mcp\/src\/|\/mcp\/src["'])[^"']*["']/;

  /** Gibt die Dateien zurück, die den Schalter außerhalb des Erlaubten nennen. */
  function verstoesse(dateien: { datei: string; text: string }[]): string[] {
    return dateien
      .filter(
        (f) =>
          !ERLAUBT(f.datei) &&
          (SCHALTER.test(f.text) ||
            (!f.datei.startsWith("packages/mcp/") && RELATIV_IN_PAKET.test(f.text))),
      )
      .map((f) => f.datei);
  }

  it("kein Quelltext außer der Definition und Tests nennt den Schalter oder bindet das Paket relativ ein", () => {
    const liste = execFileSync(
      "git",
      ["ls-files", "-z", "--", "*.ts", "*.tsx", "*.js", "*.mjs", "*.cjs"],
      {
        cwd: ROOT,
        encoding: "utf8",
        maxBuffer: 64 * 1024 * 1024,
      },
    )
      .split("\0")
      .filter((d) => d !== "");
    const dateien = liste.map((datei) => ({
      datei,
      text: readFileSync(path.join(ROOT, datei), "utf8"),
    }));
    expect(dateien.length).toBeGreaterThan(100);
    expect(verstoesse(dateien)).toEqual([]);
  });

  it("die Prüfung schlägt an, wenn Betriebs-Code den Schalter nennt oder die Datei relativ einbindet (Gegenprobe)", () => {
    expect(
      verstoesse([
        { datei: "apps/worker/src/x.ts", text: "holeWerkzeugeIntern(o, { erlaubeHttp: true })" },
        { datei: "apps/worker/src/y.ts", text: "pruefeAdresseMitSchalter(a, true)" },
        {
          datei: "apps/worker/src/z.ts",
          text: 'import { oeffneVerbindung } from "../../../packages/mcp/src/verbindung";',
        },
        {
          datei: "apps/web/src/w.ts",
          text: 'const m = await import("../../../packages/mcp/src/verbindung");',
        },
        {
          datei: "packages/mcp/src/index.ts",
          text: "export { InterneOptionen } from './verbindung'",
        },
        { datei: "packages/mcp/src/verbindung.ts", text: "holeWerkzeugeIntern" },
        { datei: "packages/mcp/src/x.test.ts", text: "holeWerkzeugeIntern" },
        { datei: "apps/worker/src/ok.ts", text: 'import { holeWerkzeuge } from "@paibot/mcp";' },
      ]),
    ).toEqual([
      "apps/worker/src/x.ts",
      "apps/worker/src/y.ts",
      "apps/worker/src/z.ts",
      "apps/web/src/w.ts",
      "packages/mcp/src/index.ts",
    ]);
  });

  it("das Paket lässt von außen nur den einen Einstieg zu (kein Weg zu `verbindung.ts`)", () => {
    const paket = JSON.parse(
      readFileSync(path.join(ROOT, "packages/mcp/package.json"), "utf8"),
    ) as {
      exports?: unknown;
    };
    expect(paket.exports).toEqual({ ".": "./src/index.ts" });
  });

  it("die öffentlichen Optionen enthalten keinen Schalter für Adressen", () => {
    const text = readFileSync(path.join(ROOT, "packages/mcp/src/verbindung.ts"), "utf8");
    const start = text.indexOf("export interface McpVerbindungOptionen");
    const optionen = text.slice(start, text.indexOf("\n}\n", start));
    expect(start).toBeGreaterThan(0);
    expect(optionen).not.toMatch(/erlaubeHttp|erlaube|TEST_/);
    const abruf = text.slice(
      text.indexOf("export interface WerkzeugAbrufOptionen"),
      text.indexOf("export interface WerkzeugAbruf {"),
    );
    expect(abruf).not.toMatch(/erlaubeHttp/);
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
