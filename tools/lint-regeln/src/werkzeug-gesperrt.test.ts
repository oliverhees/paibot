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

const AUSGELASSEN = new Set([
  "node_modules",
  ".git",
  ".turbo",
  ".next",
  "dist",
  "build",
  "coverage",
]);

/** Sucht selbst alle Dockerfiles, Skripte und YAML-Dateien (ohne node_modules und Bau-Ordner). */
function dateienSuchen(ordner = ROOT, unten = ""): string[] {
  const treffer: string[] = [];
  for (const eintrag of readdirSync(ordner, { withFileTypes: true })) {
    if (AUSGELASSEN.has(eintrag.name)) continue;
    const rel = unten === "" ? eintrag.name : `${unten}/${eintrag.name}`;
    if (eintrag.isDirectory()) {
      treffer.push(...dateienSuchen(path.join(ordner, eintrag.name), rel));
    } else if (
      eintrag.isFile() &&
      (/^Dockerfile/.test(eintrag.name) || /\.(sh|ya?ml)$/.test(eintrag.name)) &&
      eintrag.name !== "pnpm-lock.yaml"
    ) {
      treffer.push(rel);
    }
  }
  return treffer.sort();
}

/** Zeilen mit `\` am Ende werden zu einer Zeile; Kommentarzeilen fallen weg. */
function befehlszeilen(text: string): string[] {
  return text
    .replace(/\\\r?\n\s*/g, " ")
    .split("\n")
    .filter((z) => !z.trimStart().startsWith("#"));
}

interface BildBezug {
  zeile: string;
  bild: string;
  tag: string | undefined;
  digest: string | undefined;
}

/**
 * Findet jeden Bezug auf ein Node-Image: nach `FROM`, nach `image:` und jede Angabe `node:<Tag>`
 * oder `node@sha256:…` (auch ohne Tag oder mit Tag wie `lts-alpine`, `current`, `alpine`).
 */
function bildBezuege(text: string): BildBezug[] {
  const bezuege: BildBezug[] = [];
  const muster = /(?:^|[\s=])(node(?::([\w.-]+))?(?:@sha256:([0-9a-f]{64}))?)(?=[\s"']|$)/g;
  for (const zeile of befehlszeilen(text)) {
    const bezug = /^\s*FROM\s+(?:--\S+\s+)*(\S+)|^\s*(?:-\s+)?image:\s*["']?([^\s"']+)/i.exec(
      zeile,
    );
    const gefunden = new Set<string>();
    const kandidat = bezug?.[1] ?? bezug?.[2];
    if (kandidat && /^node(?:[:@]|$)/.test(kandidat)) gefunden.add(kandidat);
    for (const m of zeile.matchAll(muster)) {
      const hatZusatz = m[2] !== undefined || m[3] !== undefined;
      if (hatZusatz) gefunden.add(m[1] as string);
    }
    for (const bild of gefunden) {
      const m = /^node(?::([\w.-]+))?(?:@sha256:([0-9a-f]{64}))?$/.exec(bild);
      if (m) bezuege.push({ zeile: zeile.trim(), bild, tag: m[1], digest: m[2] });
    }
  }
  return bezuege;
}

/** Fehler eines einzelnen Bezugs: ohne Tag mit Ziffer als Hauptversion oder ohne Digest. */
function bildFehler(text: string, datei: string): string[] {
  const fehler: string[] = [];
  for (const b of bildBezuege(text)) {
    if (!b.tag || !/^[0-9]+/.test(b.tag))
      fehler.push(`${datei}: kein fester Tag mit Hauptversion: ${b.bild}`);
    if (!b.digest) fehler.push(`${datei}: kein Digest: ${b.bild}`);
  }
  return fehler;
}

/** Fehler für `npm`-Aufrufe: nur `npm ci --prefix … --ignore-scripts` ist erlaubt. */
function npmFehler(text: string, datei: string): string[] {
  const fehler: string[] = [];
  for (const zeile of befehlszeilen(text)) {
    for (const m of zeile.matchAll(/(?<![\w./-])npm\s+(\S+)([^;&|]*)/g)) {
      const befehl = m[1] as string;
      const rest = m[2] as string;
      if (/^(install|i|add|isntall|in|ins|inst|insta|instal|update|up|upgrade)$/.test(befehl)) {
        fehler.push(`${datei}: npm ${befehl} ist nicht erlaubt: ${zeile.trim()}`);
      } else if (befehl === "ci") {
        if (!rest.includes("--prefix") || !rest.includes("--ignore-scripts")) {
          fehler.push(`${datei}: npm ci ohne --prefix und --ignore-scripts: ${zeile.trim()}`);
        }
      }
    }
    if (/(?<![\w./-])npm\b[^;&|]*(\s-g\b|--global\b|--location(=|\s+)global\b)/.test(zeile)) {
      fehler.push(`${datei}: globale Installation: ${zeile.trim()}`);
    }
  }
  return fehler;
}

/** Hauptversion des Image-Tags gegen `.nvmrc` und `engines.node`. */
function versionsFehler(tag: string | undefined, nvmrc: string, engines: string): string[] {
  const fehler: string[] = [];
  const bild = /^([0-9]+)/.exec(tag ?? "")?.[1];
  const nvm = /^v?([0-9]+)/.exec(nvmrc.trim())?.[1];
  const eng = /^>=\s*([0-9]+)/.exec(engines.trim())?.[1];
  if (!bild) fehler.push("Image-Tag ohne Hauptversion");
  if (bild !== nvm) fehler.push(`Image ${bild} gegen .nvmrc ${nvm}`);
  if (bild !== eng) fehler.push(`Image ${bild} gegen engines.node ${eng}`);
  return fehler;
}

const DATEIEN = dateienSuchen();

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

describe("Dateisuche", () => {
  it("findet die Dockerfiles, Skripte und YAML-Dateien selbst", () => {
    for (const erwartet of [
      "apps/web/Dockerfile",
      "tools/fake-provider/Dockerfile",
      "deploy/sicherung.sh",
      "deploy/docker-compose.yml",
      ".github/workflows/ci.yml",
    ]) {
      expect(DATEIEN, erwartet).toContain(erwartet);
    }
    expect(DATEIEN.some((d) => d.includes("node_modules"))).toBe(false);
  });

  it("jede Datei mit `corepack enable` holt corepack aus der gesperrten Liste", () => {
    const mit = DATEIEN.filter((d) => /corepack enable/.test(lesen(d)));
    expect(mit.length).toBeGreaterThan(0);
    for (const d of mit) expect(lesen(d), d).toContain("deploy/corepack/package-lock.json");
  });
});

describe("npm in allen gefundenen Dateien", () => {
  it("kein npm install, keine globale Installation, npm ci nur mit --prefix und --ignore-scripts", () => {
    const fehler = DATEIEN.flatMap((d) => npmFehler(lesen(d), d));
    expect(fehler).toEqual([]);
  });

  it("Gegenprobe: die erlaubte Form besteht", () => {
    expect(
      npmFehler("RUN npm ci --prefix /opt/corepack --no-audit --no-fund --ignore-scripts", "probe"),
    ).toEqual([]);
    expect(npmFehler("pnpm install --frozen-lockfile", "probe")).toEqual([]);
  });

  it.each([
    "RUN npm install -g corepack",
    "RUN npm i corepack",
    "RUN npm add corepack",
    "RUN npm install --global corepack",
    "RUN npm install --location=global corepack",
    "RUN npm install --location global corepack",
    "RUN npm ci --prefix /opt/corepack",
    "RUN npm ci --ignore-scripts",
    "RUN npm update corepack",
    "RUN npm ci --prefix /x --ignore-scripts && npm install corepack",
  ])("Gegenprobe rot: %s", (zeile) => {
    expect(npmFehler(zeile, "probe").length).toBeGreaterThan(0);
  });
});

describe("Node-Images", () => {
  const alle = DATEIEN.flatMap((datei) => bildBezuege(lesen(datei)).map((b) => ({ datei, ...b })));
  const ALTER_DIGEST = `sha256:${"a".repeat(64)}`;

  it("es gibt Node-Images zu prüfen", () => {
    expect(alle.length).toBeGreaterThan(0);
  });

  it("jedes Node-Image hat einen festen Tag mit Hauptversion und einen Digest", () => {
    const fehler = DATEIEN.flatMap((d) => bildFehler(lesen(d), d));
    expect(fehler).toEqual([]);
  });

  it("alle Node-Images nennen denselben Digest und denselben Tag", () => {
    const digests = new Set(alle.map((t) => t.digest));
    const tags = new Set(alle.map((t) => t.tag));
    expect([...digests], JSON.stringify(alle)).toHaveLength(1);
    expect([...tags]).toHaveLength(1);
  });

  it("die Hauptversion des Image-Tags stimmt mit .nvmrc und engines.node überein", () => {
    const engines = (JSON.parse(lesen("package.json")) as { engines: { node: string } }).engines
      .node;
    expect(versionsFehler(alle[0]?.tag, lesen(".nvmrc"), engines)).toEqual([]);
  });

  it.each([
    ["FROM node:lts-alpine AS run"],
    ["FROM node:alpine AS run"],
    ["FROM node:current"],
    ["FROM node AS run"],
    ["FROM node:26-alpine AS run"],
    [`FROM node@${ALTER_DIGEST}`],
    [`FROM --platform=linux/amd64 node:lts-alpine@${ALTER_DIGEST}`],
    ["    image: node:current"],
    ["    image: node"],
    ["docker run --rm node:lts-alpine sh -c true"],
    ["NODE_IMAGE=node:alpine"],
  ])("Gegenprobe rot: %s", (zeile) => {
    expect(bildFehler(zeile, "probe").length).toBeGreaterThan(0);
  });

  it("Gegenprobe: ein festes Image mit Tag und Digest besteht", () => {
    expect(bildFehler(`FROM node:26-alpine@${ALTER_DIGEST} AS build`, "probe")).toEqual([]);
    expect(bildFehler("RUN node -v && node build.mjs", "probe")).toEqual([]);
  });

  it("Gegenprobe rot: .nvmrc 22 und engines >=22 fallen auf", () => {
    expect(versionsFehler("26-alpine", "22\n", ">=26").length).toBeGreaterThan(0);
    expect(versionsFehler("26-alpine", "26\n", ">=22").length).toBeGreaterThan(0);
    expect(versionsFehler("lts-alpine", "26\n", ">=26").length).toBeGreaterThan(0);
    expect(versionsFehler("26-alpine", "26\n", ">=26")).toEqual([]);
  });
});
