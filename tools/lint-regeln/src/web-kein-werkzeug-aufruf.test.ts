/**
 * PaiBot – Regel-Test: Die Web-App ruft nur `tools/list`, nie `tools/call`. Die Regel
 * `web-kein-werkzeug-aufruf.grit` meldet jeden Namen und jede Zeichenkette, mit denen ein
 * Werkzeug aufgerufen würde; ein Test über den heutigen Quelltext der Web-App ist grün.
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
const MELDUNG = /nie tools\/call/;

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
  const report = JSON.parse(output) as { diagnostics: Diagnostic[] };
  return report.diagnostics.filter((d) => d.category === "plugin" && MELDUNG.test(d.message));
}

/** Legt eine Datei in einem Probe-Ordner unter `ordner` an, prüft sie mit Biome und löscht sie. */
function lint(ordner: string, source: string, name = "versuch.ts"): Diagnostic[] {
  const dir = path.join(ROOT, ordner, `__lint_versuch_${process.pid}__`);
  mkdirSync(dir, { recursive: true });
  try {
    writeFileSync(path.join(dir, name), source);
    return biome([path.relative(ROOT, path.join(dir, name))]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Ordner der Web-App, in denen die Regel gilt (Routen, Bibliothek, Seiten). */
const WEB_ORDNER = [
  "apps/web/src/app/api/apps",
  "apps/web/src/lib/apps",
  "apps/web/src/lib/chat",
  "apps/web/src/app/(app)/chat",
];

describe("Web-App: kein Aufruf von Werkzeugen (muss rot sein)", () => {
  const ROT: Record<string, string> = {
    "callTool als Aufruf": "declare const c: any;\nexport const a = callTool({ name: 'x' });\n",
    "client.callTool": "declare const c: any;\nexport const a = c.callTool({ name: 'x' });\n",
    "client?.callTool": "declare const c: any;\nexport const a = c?.callTool({ name: 'x' });\n",
    "callTool als Verweis": "declare const c: any;\nexport const a = c.callTool;\n",
    "rufeWerkzeugAuf als Aufruf": "declare const r: any;\nexport const a = rufeWerkzeugAuf(r);\n",
    "Import von rufeWerkzeugAuf":
      'import { rufeWerkzeugAuf } from "@paibot/mcp";\nexport const a = rufeWerkzeugAuf;\n',
    "umbenannter Import":
      'import { rufeWerkzeugAuf as ruf } from "@paibot/mcp";\nexport const a = ruf;\n',
    rufeWerkzeugAufIntern:
      "declare const r: any;\nexport const a = rufeWerkzeugAufIntern(r, {});\n",
    "rufeAuf der Verbindung": "declare const v: any;\nexport const a = v.rufeAuf('x', {});\n",
    "Zeichenkette mit doppelten Anführungszeichen": 'export const a = "tools/call";\n',
    "Zeichenkette mit einfachen Anführungszeichen": "export const a = 'tools/call';\n",
    "Vorlagen-Text": "export const a = `tools/call`;\n",
    "Methode im JSON": 'export const a = JSON.stringify({ method: "tools/call" });\n',
  };

  for (const [name, source] of Object.entries(ROT)) {
    it(`${name}: in jedem Ordner der Web-App rot`, () => {
      for (const ordner of WEB_ORDNER) {
        expect(lint(ordner, source).length, `${ordner}: ${source}`).toBeGreaterThan(0);
      }
    });
  }

  it("auch .tsx-Dateien werden geprüft", () => {
    expect(lint("apps/web/src/lib/apps", "export const a = c.callTool(x);\n", "v.tsx")).not.toEqual(
      [],
    );
  });
});

describe("Web-App: erlaubt (muss grün bleiben)", () => {
  const GRUEN: Record<string, string> = {
    "tools/list": "export const a = 'tools/list';\n",
    holeWerkzeuge:
      'import { holeWerkzeuge } from "@paibot/mcp";\nexport const a = holeWerkzeuge;\n',
    "ähnliche Namen":
      "export const callToolbar = 1;\nexport const rufeWerkzeugAufruf = 2;\nexport const a = 'callTools';\n",
    "Text mit tools/ im Satz": "export const a = 'Liste unter tools/list';\n",
  };
  for (const [name, source] of Object.entries(GRUEN)) {
    it(`${name}: nicht gemeldet`, () => {
      for (const ordner of WEB_ORDNER) expect(lint(ordner, source), ordner).toEqual([]);
    });
  }

  it("Tests und andere Pakete sind ausgenommen (Worker, packages/mcp, *.test.ts)", () => {
    expect(lint("apps/worker/src", "export const a = c.callTool(x);\n")).toEqual([]);
    expect(lint("packages/mcp/src", "export const a = c.callTool(x);\n")).toEqual([]);
    expect(lint("apps/web/src/lib/apps", "export const a = c.callTool(x);\n", "v.test.ts")).toEqual(
      [],
    );
  });

  it("heute: der ganze Quelltext der Web-App ist ohne Treffer", () => {
    expect(biome(["apps/web"])).toEqual([]);
  });
});
