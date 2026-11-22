/**
 * PaiBot – Regel-Test: Aus der MCP-Schicht darf die Web-App nur die Liste der Werkzeuge und die
 * erlaubten Typen importieren, nie den Aufruf (`rufeWerkzeugAuf`) und nie den ganzen Namensraum
 * (`import * as`). Die Regel ist die Einschränkung der Importe in `biome.json` (Block der Web-App).
 * Sie hält die Umgehungen, die die Namenssuche von `web-kein-werkzeug-aufruf.grit` nicht sieht
 * (umbenanntes Auslesen, Zugriff über eine Zeichenkette, zusammengesetzter Text), an der einzigen
 * Stelle auf, an der man zum Aufruf kommt: am Import.
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

/** Meldungen der Import-Einschränkung für eine Probe-Datei. */
function importMeldungen(ordner: string, source: string): Diagnostic[] {
  const dir = path.join(ROOT, ordner, `__lint_importe_${process.pid}__`);
  mkdirSync(dir, { recursive: true });
  try {
    writeFileSync(path.join(dir, "versuch.ts"), source);
    let output: string;
    try {
      output = execFileSync(
        process.execPath,
        [BIOME, "lint", "--reporter=json", path.relative(ROOT, path.join(dir, "versuch.ts"))],
        { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 << 20 },
      );
    } catch (error) {
      output = (error as { stdout: string }).stdout;
    }
    const report = JSON.parse(output) as { diagnostics: Diagnostic[] };
    return report.diagnostics.filter((d) => d.category === "lint/style/noRestrictedImports");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const WEB_ORDNER = ["apps/web/src/lib/apps", "apps/web/src/lib/chat", "apps/web/src/app/api/apps"];

describe("Web-App: Importe aus der MCP-Schicht (muss rot sein)", () => {
  const ROT: Record<string, string> = {
    "Aufruf als Name":
      'import { rufeWerkzeugAuf } from "@paibot/mcp";\nexport const a = rufeWerkzeugAuf;\n',
    "Aufruf umbenannt":
      'import { rufeWerkzeugAuf as ruf } from "@paibot/mcp";\nexport const a = ruf;\n',
    "ganzer Namensraum":
      'import * as mcp from "@paibot/mcp";\ndeclare const r: any;\nexport const a = mcp.rufeWerkzeugAuf(r);\n',
    "Namensraum mit Zugriff über eine Zeichenkette":
      'import * as mcp from "@paibot/mcp";\ndeclare const r: any;\nexport const a = mcp["rufeWerkzeugAuf"](r);\n',
    "Namensraum mit zusammengesetztem Namen":
      'import * as mcp from "@paibot/mcp";\nexport const a = (mcp as any)["rufeWerkzeug" + "Auf"];\n',
    "Namensraum nur als Typ":
      'import type * as mcp from "@paibot/mcp";\nexport type A = typeof mcp;\n',
    "Verbindung öffnen":
      'import { oeffneVerbindung } from "@paibot/mcp";\nexport const a = oeffneVerbindung;\n',
    "relativer Pfad in packages/mcp":
      'import { rufeWerkzeugAuf } from "../../../../../../packages/mcp/src/verbindung";\nexport const a = rufeWerkzeugAuf;\n',
    "relativer Pfad in packages/mcp, nur ein harmloser Name":
      'import { holeWerkzeuge } from "../../../../../../packages/mcp/src/verbindung";\nexport const a = holeWerkzeuge;\n',
    "createRequire aus node:module":
      'import { createRequire } from "node:module";\nexport const a = createRequire(import.meta.url)("@paibot/mcp");\n',
    "createRequire aus module":
      'import { createRequire } from "module";\nexport const a = createRequire(import.meta.url)("@paibot/mcp");\n',
    "Typ der Verbindung":
      'import type { McpVerbindung } from "@paibot/mcp";\nexport type A = McpVerbindung;\n',
  };

  for (const [name, source] of Object.entries(ROT)) {
    it(`${name}: in jedem Ordner der Web-App rot`, () => {
      for (const ordner of WEB_ORDNER) {
        expect(importMeldungen(ordner, source).length, `${ordner}: ${source}`).toBeGreaterThan(0);
      }
    });
  }
});

describe("Web-App: Importe aus der MCP-Schicht (muss grün sein)", () => {
  const GRUEN: Record<string, string> = {
    "Liste holen":
      'import { holeWerkzeuge, type McpFetch, type WerkzeugAbruf } from "@paibot/mcp";\nexport const a = [holeWerkzeuge];\nexport type B = [McpFetch, WerkzeugAbruf];\n',
    aufbereiten:
      'import { bereiteWerkzeugeAuf, McpSchichtFehler, type McpWerkzeugRoh } from "@paibot/mcp";\nexport const a = [bereiteWerkzeugeAuf, McpSchichtFehler];\nexport type B = McpWerkzeugRoh;\n',
    Adresse: 'import { pruefeAdresse } from "@paibot/mcp";\nexport const a = pruefeAdresse;\n',
    "Modell-Namen":
      'import { vergebeModellNamen, type McpWerkzeugBereinigt } from "@paibot/mcp";\nexport const a = vergebeModellNamen;\nexport type B = McpWerkzeugBereinigt;\n',
  };

  for (const [name, source] of Object.entries(GRUEN)) {
    it(`${name}: keine Meldung`, () => {
      expect(importMeldungen("apps/web/src/lib/apps", source)).toEqual([]);
    });
  }
});

describe("Web-App: Importe aus apps/* (nur der eigene Ordner lib/apps ist erlaubt)", () => {
  /** Relative Angabe von `ordner/__probe__` zu einer Datei im Repo. */
  const von = (ordner: string, ziel: string) => {
    const rel = path.relative(path.join(ROOT, ordner, "__probe__"), path.join(ROOT, ziel));
    return rel.startsWith(".") ? rel : `./${rel}`;
  };
  const ORDNER = "apps/web/src/app/api/apps";

  const ROT: Record<string, string> = {
    "Worker über apps/worker": "apps/worker/src/lauf",
    "Worker, Ordner lib/apps darin": "apps/worker/src/lib/apps/x",
    "Worker über den Ordner worker": "apps/worker/src/lib/chat/x",
  };
  for (const [name, ziel] of Object.entries(ROT)) {
    it(`${name}: gemeldet`, () => {
      const quelle = `import a from "${von(ORDNER, ziel)}";\nexport default a;\n`;
      expect(importMeldungen(ORDNER, quelle).length).toBeGreaterThan(0);
    });
  }

  // `path.relative` glättet `./` und `//`; diese Schreibweisen löst der Bündler trotzdem auf.
  const SCHREIBWEISEN: Record<string, string> = {
    "Worker mit ./ im Pfad": "/worker/./src/",
    "Worker mit // im Pfad": "/worker//src/",
  };
  for (const [name, ersatz] of Object.entries(SCHREIBWEISEN)) {
    it(`${name}: gemeldet`, () => {
      const pfad = von(ORDNER, "apps/worker/src/lauf").replace("/worker/src/", ersatz);
      expect(pfad).toContain(ersatz);
      const quelle = `import a from "${pfad}";\nexport default a;\n`;
      expect(importMeldungen(ORDNER, quelle).length).toBeGreaterThan(0);
    });
  }

  it("die Testdaten der Belege dürfen Tests der Web-App weiter über den relativen Pfad laden", () => {
    const quelle = `import a from "${von("apps/web/src/lib/belege", "packages/receipts/src/testdaten/fassung-ketten")}";\nexport default a;\n`;
    expect(importMeldungen("apps/web/src/lib/belege", quelle)).toEqual([]);
  });

  it("lib/apps der Web-App bleibt erlaubt", () => {
    const quelle = `import a from "${von(ORDNER, "apps/web/src/lib/apps/verwaltung")}";\nexport default a;\n`;
    expect(importMeldungen(ORDNER, quelle)).toEqual([]);
  });
});
