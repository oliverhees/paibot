/**
 * PaiBot – Test, dass `pnpm headers:check` Dateien ohne passenden Urheber-Kopf meldet.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SCRIPT = path.join(ROOT, "scripts", "headers.mjs");

const LIZENZ = "PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm";
const GIT_ENV = {
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.invalid",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.invalid",
};

function kopf(beschreibung: string, lizenz = LIZENZ): string {
  return [
    "/**",
    ` * PaiBot – ${beschreibung}`,
    " *",
    " * @author    Oliver Hees",
    " * @link      https://paibot.de",
    " * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.",
    ` * @license   ${lizenz}`,
    " * @since     2026-11-21",
    " */",
    "",
  ].join("\n");
}

const ordner: string[] = [];
afterEach(() => {
  for (const dir of ordner.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Kleines Git-Projekt mit den angegebenen Dateien (ein Commit, damit das Datum bestimmbar ist). */
function projekt(dateien: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), "paibot-headers-"));
  ordner.push(dir);
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: dir, env: { ...process.env, ...GIT_ENV }, stdio: "ignore" });
  git("init", "-q");
  writeFileSync(path.join(dir, "start.ts"), `${kopf("Start")}export {};\n`);
  git("add", "start.ts");
  git("commit", "-q", "-m", "Start");
  for (const [name, text] of Object.entries(dateien)) {
    mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    writeFileSync(path.join(dir, name), text);
  }
  return dir;
}

function headers(dir: string, modus: "--check" | "--write") {
  const result = spawnSync(process.execPath, [SCRIPT, modus], {
    cwd: dir,
    encoding: "utf8",
    env: { ...process.env, PAIBOT_HEADER_DATE: "2026-11-21" },
  });
  return { code: result.status, ausgabe: `${result.stdout}${result.stderr}` };
}

describe("headers:check", () => {
  it("alle Dateien mit Kopf (oder ausgenommen): Exit 0", () => {
    const dir = projekt({
      "a.ts": `${kopf("Teil A")}export const a = 1;\n`,
      "daten.json": "{}\n",
      "packages/db/drizzle/0001.sql": "select 1;\n",
    });
    const r = headers(dir, "--check");
    expect(r.ausgabe).toContain("Urheber-Kopf ok (2 Dateien geprüft).");
    expect(r.code).toBe(0);
  });

  it("Datei ohne Kopf: Exit 1 mit Dateiname", () => {
    const dir = projekt({ "ohne.ts": "export const x = 1;\n" });
    const r = headers(dir, "--check");
    expect(r.code).toBe(1);
    expect(r.ausgabe).toContain("keinen Urheber-Kopf");
    expect(r.ausgabe).toContain("ohne.ts");
    expect(r.ausgabe).not.toContain("Urheber-Kopf ok");
  });

  it("Platzhalter im Kopf oder alte Lizenz-Fassung: jeweils Exit 1", () => {
    const platzhalter = projekt({ "p.ts": `${kopf("Beschreibung folgt")}export {};\n` });
    const r1 = headers(platzhalter, "--check");
    expect(r1.code).toBe(1);
    expect(r1.ausgabe).toContain("p.ts");

    const alt = LIZENZ.replace("1.1", "1.0");
    const veraltet = projekt({ "v.ts": `${kopf("Alt", alt)}export {};\n` });
    const r2 = headers(veraltet, "--check");
    expect(r2.code).toBe(1);
    expect(r2.ausgabe).toContain("v.ts");
  });

  it("--write ergänzt Köpfe in jedem Kommentar-Stil; danach meldet --check nur den Platzhalter", () => {
    const dir = projekt({
      "neu.ts": "#!/usr/bin/env node\nexport {};\n",
      "neu.yml": "a: 1\n",
      "neu.md": "# Titel\n",
      "alt.ts": `${kopf("Alt", LIZENZ.replace("1.1", "1.0"))}export {};\n`,
    });
    const w = headers(dir, "--write");
    expect(w.code).toBe(0);
    expect(w.ausgabe).toContain("3 Köpfe eingefügt");
    const ts = readFileSync(path.join(dir, "neu.ts"), "utf8");
    expect(ts.startsWith("#!/usr/bin/env node\n/**\n * PaiBot – Beschreibung folgt")).toBe(true);
    expect(ts).toContain(" * @since     2026-11-21");
    expect(readFileSync(path.join(dir, "neu.yml"), "utf8")).toContain("# Autor:     Oliver Hees");
    expect(readFileSync(path.join(dir, "neu.md"), "utf8").startsWith("<!--\nPaiBot –")).toBe(true);
    expect(readFileSync(path.join(dir, "alt.ts"), "utf8")).toContain(LIZENZ);
    const c = headers(dir, "--check");
    expect(c.code).toBe(1);
    expect(c.ausgabe).not.toContain("keinen Urheber-Kopf");
    expect(c.ausgabe).toContain("Platzhalter");
  });

  it("ohne Modus: Exit 2", () => {
    const dir = projekt({});
    const result = spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: "utf8" });
    expect(result.status).toBe(2);
  });
});
