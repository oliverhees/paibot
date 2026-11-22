/**
 * PaiBot – Test: `routen.ts` wird auch im Browser geladen (die Oberfläche baut Pfade daraus, etwa
 * `lib/sse/client-kern.ts`). Deshalb darf nichts, was `routen.ts` einbindet, Server-Code
 * mitbringen: kein `node:*`, nicht `@paibot/mcp`, nicht `@paibot/crypto`. Der Test geht die
 * relativen Importe von `routen.ts` und von `client-kern.ts` durch und prüft jede Datei darin.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HIER = path.dirname(fileURLToPath(import.meta.url));

/** Was im Browser nie ankommen darf. */
const VERBOTEN =
  /^(?:node:.+|@paibot\/mcp(?:\/.*)?|@paibot\/crypto(?:\/.*)?|@ai-sdk\/.+|postgres|drizzle-orm(?:\/.*)?|@paibot\/db(?:\/.*)?)$/;

/**
 * Alle Import-Angaben einer Quelle, die im Browser ankommen: `import … from "x"`,
 * `export … from "x"`, `import("x")`, `import "x"`. Reine Typ-Importe (`import type`, `export type`)
 * bleiben außen vor: Sie verschwinden beim Übersetzen.
 */
function importeVon(text: string): string[] {
  const funde = new Set<string>();
  const muster =
    /(?:^|[\s;])(?:import|export)\s+(?!type\s)(?:[^"';]*?\sfrom\s*)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;
  for (const treffer of text.matchAll(muster)) {
    const angabe = treffer[1] ?? treffer[2];
    if (angabe !== undefined) funde.add(angabe);
  }
  return [...funde];
}

function aufloesen(von: string, angabe: string): string | undefined {
  const basis = path.resolve(path.dirname(von), angabe);
  for (const kandidat of [basis, `${basis}.ts`, `${basis}.tsx`, path.join(basis, "index.ts")]) {
    if (existsSync(kandidat) && !kandidat.endsWith(path.sep)) {
      try {
        if (readFileSync(kandidat, "utf8") !== undefined && /\.tsx?$/.test(kandidat))
          return kandidat;
      } catch {
        // ein Ordner: nächster Kandidat
      }
    }
  }
  return undefined;
}

/** Alle Dateien, die `start` über relative Importe erreicht (mit `start`), und alle verbotenen Importe darin. */
function browserHuelle(start: string): { dateien: string[]; verboten: string[] } {
  const gesehen = new Set<string>();
  const verboten: string[] = [];
  const stapel = [start];
  for (let datei = stapel.pop(); datei !== undefined; datei = stapel.pop()) {
    if (gesehen.has(datei)) continue;
    gesehen.add(datei);
    for (const angabe of importeVon(readFileSync(datei, "utf8"))) {
      if (VERBOTEN.test(angabe)) verboten.push(`${path.relative(HIER, datei)}: ${angabe}`);
      else if (angabe.startsWith(".")) {
        const ziel = aufloesen(datei, angabe);
        if (ziel !== undefined) stapel.push(ziel);
      }
    }
  }
  return { dateien: [...gesehen].map((d) => path.relative(HIER, d)).sort(), verboten };
}

describe("routen.ts im Browser", () => {
  // Gegenprobe: in `apps/eingaben.ts` die Grenzwerte wieder aus `./adresse` oder `./token` holen →
  // die Hülle enthält `@paibot/mcp` bzw. `@paibot/crypto`, der Test wird rot.
  for (const start of ["routen.ts", "sse/client-kern.ts"]) {
    it(`${start}: keine Server-Pakete in den Importen`, () => {
      const huelle = browserHuelle(path.join(HIER, start));
      expect(huelle.verboten).toEqual([]);
      // Der Test sieht wirklich etwas: `routen.ts` bindet die Eingaben der Apps ein.
      if (start === "routen.ts") expect(huelle.dateien).toContain("apps/eingaben.ts");
    });
  }

  it("die Suche erkennt verbotene Importe in jeder Schreibweise (Gegenprobe im Test selbst)", () => {
    const quelle = [
      'import { a } from "node:crypto";',
      'import type { B } from "@paibot/mcp";',
      'import { type C, d } from "@paibot/crypto";',
      'export { c } from "@paibot/crypto/token";',
      'const m = await import("@ai-sdk/mcp");',
      'import "node:fs";',
      'import { ok } from "./harmlos";',
    ].join("\n");
    const verboten = importeVon(quelle).filter((angabe) => VERBOTEN.test(angabe));
    // `import type` verschwindet beim Übersetzen und zählt nicht.
    expect(verboten).toEqual([
      "node:crypto",
      "@paibot/crypto",
      "@paibot/crypto/token",
      "@ai-sdk/mcp",
      "node:fs",
    ]);
  });
});
