/**
 * PaiBot – Test: Die CI installiert Playwright nur aus der gesperrten Liste mit Prüfsummen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const lesen = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

describe("Playwright in der CI", () => {
  const ci = lesen(".github/workflows/ci.yml");
  const lock = JSON.parse(lesen("tools/e2e/playwright-ci/package-lock.json")) as {
    packages: Record<string, { version?: string; integrity?: string; resolved?: string }>;
  };
  const paket = JSON.parse(lesen("tools/e2e/playwright-ci/package.json")) as {
    dependencies: Record<string, string>;
  };

  it("jedes Paket der Liste hat eine Prüfsumme (sha512) und kommt aus dem npm-Verzeichnis", () => {
    const eintraege = Object.entries(lock.packages).filter(([name]) => name !== "");
    expect(eintraege.length).toBeGreaterThan(0);
    for (const [name, eintrag] of eintraege) {
      expect(eintrag.integrity, name).toMatch(/^sha512-[A-Za-z0-9+/]+=*$/);
      expect(eintrag.resolved, name).toMatch(/^https:\/\/registry\.npmjs\.org\//);
    }
  });

  it("Fassung in der CI, in package.json und in der gesperrten Liste ist dieselbe", () => {
    const imCi = /PLAYWRIGHT_VERSION: ([0-9.]+)/.exec(ci)?.[1];
    expect(imCi).toBeDefined();
    expect(paket.dependencies.playwright).toBe(imCi);
    expect(lock.packages["node_modules/playwright"]?.version).toBe(imCi);
  });

  it("die CI installiert mit npm ci aus dieser Liste, nicht mit npm install", () => {
    const schritt = ci.slice(ci.indexOf("- name: Playwright und Chromium installieren"));
    const block = schritt.slice(0, schritt.indexOf("\n      - "));
    expect(block).toContain("tools/e2e/playwright-ci/package-lock.json");
    expect(block).toMatch(/npm ci --prefix "\$pw"/);
    expect(block).not.toMatch(/npm install/);
    expect(block).toContain("--ignore-scripts");
  });

  // Gegenprobe: den Job „apps-browser“ oder seinen Schritt aus der CI nehmen → rot.
  it("die Seite „Apps“ läuft im echten Browser in der CI, mit Datenbank und gebautem Stand", () => {
    const start = ci.indexOf("\n  apps-browser:");
    expect(start).toBeGreaterThan(-1);
    const rest = ci.slice(start + 1);
    const job = rest.slice(0, rest.search(/\n {2}[a-z-]+:\n/));
    expect(job).toContain("needs: check");
    expect(job).toContain("image: postgres:17-alpine@sha256:");
    expect(job).toContain("PAIBOT_DOKU_DATABASE_URL: postgres://");
    expect(job).toContain("run: pnpm build");
    expect(job).toContain("pnpm doku:app -- pnpm apps:browser");
    // Playwright wie in den anderen Jobs: gepinnt, aus der Liste mit Prüfsummen.
    expect(job).toContain('npm ci --prefix "$pw"');
    expect(job).toContain("PLAYWRIGHT_VERSION: 1.63.0");
  });
});
