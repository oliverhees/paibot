/**
 * PaiBot – Test: Werkzeuge, die beim Bau oder in Betriebsskripten aus dem Netz kommen, haben eine
 * festgenagelte Prüfsumme und laufen ohne Skripte; alle Node-Images nennen denselben Digest.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const lesen = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

/** Stellen, an denen corepack für den Bau oder die Sicherung installiert wird. */
const COREPACK_STELLEN = [
  "apps/web/Dockerfile",
  "tools/fake-provider/Dockerfile",
  "deploy/sicherung.sh",
  ".github/workflows/ci.yml",
] as const;

/** Alle Dateien, in denen ein Node-Image stehen darf: Dockerfiles, Compose-Dateien, Skripte, CI. */
function dateienMitImages(): string[] {
  const dateien = [
    "apps/web/Dockerfile",
    "tools/fake-provider/Dockerfile",
    "deploy/sicherung.sh",
    "deploy/sicherung-db.sh",
  ];
  for (const ordner of ["deploy", ".github/workflows"]) {
    for (const name of readdirSync(path.join(ROOT, ordner))) {
      if (/\.(ya?ml)$/.test(name)) dateien.push(`${ordner}/${name}`);
    }
  }
  return [...new Set(dateien)];
}

describe("corepack nur aus der gesperrten Liste", () => {
  const lock = JSON.parse(lesen("deploy/corepack/package-lock.json")) as {
    packages: Record<string, { version?: string; integrity?: string; resolved?: string }>;
  };
  const paket = JSON.parse(lesen("deploy/corepack/package.json")) as {
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

  it("die Fassung in package.json ist genau und stimmt mit der gesperrten Liste überein", () => {
    const fassung = paket.dependencies.corepack;
    expect(fassung).toMatch(/^[0-9]+\.[0-9]+\.[0-9]+$/);
    expect(lock.packages["node_modules/corepack"]?.version).toBe(fassung);
  });

  it.each(COREPACK_STELLEN)(
    "%s installiert corepack mit npm ci, ohne Skripte, aus der Liste",
    (datei) => {
      const text = lesen(datei);
      expect(text).toContain("deploy/corepack/package-lock.json");
      const zeilen = text
        .split("\n")
        .filter(
          (z) => /npm ci\b/.test(z) && z.includes("corepack") && !z.trimStart().startsWith("#"),
        );
      expect(zeilen.length).toBeGreaterThan(0);
      for (const zeile of zeilen) {
        expect(zeile, zeile).toContain("--prefix");
        expect(zeile, zeile).toContain("--ignore-scripts");
      }
    },
  );

  it.each(COREPACK_STELLEN)("%s installiert nichts global und nichts ohne Prüfsumme", (datei) => {
    const text = lesen(datei);
    expect(text).not.toMatch(/npm\s+(install|i|add)\b[^\n]*(-g\b|--global)/);
    expect(text).not.toMatch(/npm\s+(install|i|add)\b[^\n]*corepack/);
    expect(text).not.toMatch(/corepack@/);
  });
});

describe("Node-Images", () => {
  const treffer: { datei: string; bild: string; digest: string | undefined }[] = [];
  for (const datei of dateienMitImages()) {
    for (const m of lesen(datei).matchAll(/\bnode:[0-9][\w.-]*(?:@sha256:([0-9a-f]{64}))?/g)) {
      treffer.push({ datei, bild: m[0], digest: m[1] });
    }
  }

  it("es gibt Node-Images zu prüfen", () => {
    expect(treffer.length).toBeGreaterThan(0);
  });

  it("jedes Node-Image ist mit Digest festgelegt", () => {
    for (const t of treffer) expect(t.digest, `${t.datei}: ${t.bild}`).toBeDefined();
  });

  it("alle Node-Images nennen denselben Digest und denselben Tag", () => {
    const digests = new Set(treffer.map((t) => t.digest));
    const tags = new Set(treffer.map((t) => t.bild.split("@")[0]));
    expect([...digests], JSON.stringify(treffer)).toHaveLength(1);
    expect([...tags]).toHaveLength(1);
  });
});
