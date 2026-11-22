/**
 * PaiBot – Test: Umgebungs-Dateien mit Geheimnissen gelangen nicht in den Docker-Build.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { IN_DEN_INDEX, NICHT_IN_DEN_INDEX, passtAuf } = (await import(
  pathToFileURL(path.join(ROOT, "scripts", "doku-umfang.mjs")).href
)) as {
  IN_DEN_INDEX: string[];
  NICHT_IN_DEN_INDEX: [string, string][];
  passtAuf: (muster: string, pfad: string) => boolean;
};

/** Muster aus .dockerignore (ohne Kommentare und Leerzeilen), in der Reihenfolge der Datei. */
function muster(text: string): string[] {
  return text
    .split("\n")
    .map((z) => z.trim())
    .filter((z) => z !== "" && !z.startsWith("#"));
}

/** Ein Muster als regulärer Ausdruck: `**` beliebig viele Ordner, `*` und `?` innerhalb eines Namens. */
function alsAusdruck(pattern: string): RegExp {
  let text = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i] ?? "";
    if (c === "*" && pattern[i + 1] === "*") {
      i++;
      if (pattern[i + 1] === "/") {
        i++;
        text += "(?:.*/)?";
      } else {
        text += ".*";
      }
    } else if (c === "*") text += "[^/]*";
    else if (c === "?") text += "[^/]";
    else text += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  // Ein Muster für einen Ordner schließt auch alles darin aus.
  return new RegExp(`^${text}(?:/.*)?$`);
}

/** Wie Docker: Die Muster werden der Reihe nach geprüft, das letzte passende entscheidet. */
function ausgeschlossen(liste: string[], datei: string): boolean {
  let ergebnis = false;
  for (const roh of liste) {
    const nein = roh.startsWith("!");
    const pattern = (nein ? roh.slice(1) : roh).replace(/^\//, "");
    if (alsAusdruck(pattern).test(datei)) ergebnis = !nein;
  }
  return ergebnis;
}

describe(".dockerignore", () => {
  const liste = muster(readFileSync(path.join(ROOT, ".dockerignore"), "utf8"));

  it.each([
    ".env",
    "deploy/.env",
    "deploy/.env.lokal",
    "apps/web/.env.production",
    "build-time.env",
    "artifacts/build-time.env",
    "deploy/coolify.env",
  ])("schließt %s aus", (datei) => {
    expect(ausgeschlossen(liste, datei)).toBe(true);
  });

  it.each(["deploy/.env.example", "apps/web/src/lib/umgebung.ts", "deploy/env-erzeugen.sh"])(
    "lässt %s im Build",
    (datei) => {
      expect(ausgeschlossen(liste, datei)).toBe(false);
    },
  );

  it("der Abgleich folgt der Reihenfolge der Muster", () => {
    expect(ausgeschlossen(["**/*.env", "!a.env"], "a.env")).toBe(false);
    expect(ausgeschlossen(["!a.env", "**/*.env"], "a.env")).toBe(true);
  });
});

/** Alle Dateien unter einem Ordner als Pfade mit „/“ relativ zum Projektstamm. */
function dateienUnter(ordner: string): string[] {
  return readdirSync(path.join(ROOT, ordner), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? dateienUnter(`${ordner}/${e.name}`) : [`${ordner}/${e.name}`],
  );
}

describe(".dockerignore und die Doku im Image", () => {
  const liste = muster(readFileSync(path.join(ROOT, ".dockerignore"), "utf8"));
  const seiten = dateienUnter("docs").filter((d) => d.endsWith(".md"));

  it("jede Seite der Liste „in den Index“ ist im Build-Kontext", () => {
    const betroffen = seiten.filter((d) => IN_DEN_INDEX.some((m) => passtAuf(m, d)));
    expect(betroffen.length).toBeGreaterThan(8);
    for (const datei of betroffen) expect(ausgeschlossen(liste, datei), datei).toBe(false);
  });

  it("jeder Eintrag der Liste ist im Build-Kontext vertreten (auch die Wildcard)", () => {
    for (const eintrag of IN_DEN_INDEX) {
      expect(liste.includes(`!${eintrag}`), `Zeile „!${eintrag}“ fehlt in .dockerignore`).toBe(
        true,
      );
    }
  });

  it("Bilder, Aufnahme-Liste und Seiten der Liste „nicht in den Index“ bleiben draußen", () => {
    const draussen = seiten.filter((d) => NICHT_IN_DEN_INDEX.some(([m]) => passtAuf(m, d)));
    expect(draussen.length).toBeGreaterThan(8);
    for (const datei of draussen) expect(ausgeschlossen(liste, datei), datei).toBe(true);
    const bilder = dateienUnter("docs/assets").slice(0, 5);
    expect(bilder.length).toBeGreaterThan(0);
    for (const datei of [...bilder, "docs/assets/screenshots/x.png", "docs/screenshots.json"]) {
      expect(ausgeschlossen(liste, datei), datei).toBe(true);
    }
  });

  it("eine neue Seite, die in keiner Liste steht, wäre draußen", () => {
    expect(ausgeschlossen(liste, "docs/neu.md")).toBe(true);
  });
});

describe("Dockerfile: Doku-Index", () => {
  const text = readFileSync(path.join(ROOT, "apps", "web", "Dockerfile"), "utf8");
  const stufen = text.split(/^FROM /m).slice(1);
  const bau = stufen.find((s) => /\sAS build\b/.test(s.split("\n")[0] ?? "")) ?? "";
  const lauf = stufen.find((s) => /\sAS run\b/.test(s.split("\n")[0] ?? "")) ?? "";

  it("der Index entsteht in der Bau-Stufe nach der Installation und vor dem Bau der Apps", () => {
    const install = bau.indexOf("RUN pnpm install --frozen-lockfile");
    const index = bau.indexOf("RUN pnpm doku:index");
    expect(install).toBeGreaterThan(-1);
    expect(index).toBeGreaterThan(install);
    expect(lauf).not.toContain("doku:index");
  });

  it("die Laufzeit-Stufe kopiert den Index aus der Bau-Stufe an den Ort aus PAIBOT_DOKU_INDEX", () => {
    const env = /PAIBOT_DOKU_INDEX=(\S+)/.exec(lauf)?.[1];
    expect(env).toBe("/app/doku-index/doku-index.json");
    // root-eigen und nur lesbar: die App darf den Index zur Laufzeit nicht ändern
    // (Gegenprobe: `--chown=paibot:paibot` ohne `--chmod` → rot)
    expect(lauf).toContain(
      "COPY --from=build --chown=root:root --chmod=0444 /app/doku-index/doku-index.json ./doku-index/doku-index.json",
    );
    expect(lauf).not.toContain("--chown=paibot:paibot /app/doku-index");
    // WORKDIR /app + Ziel der Kopie = Wert der Umgebungsvariable
    expect(lauf).toContain("WORKDIR /app");
  });
});

describe("Build-Kontext nach .dockerignore ergibt den Index am Laufzeit-Ort (ohne Docker)", () => {
  const ordner: string[] = [];
  afterEach(() => {
    for (const dir of ordner.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  it("aus den Dateien des Kontexts entsteht doku-index/doku-index.json mit allen Seiten", () => {
    const liste = muster(readFileSync(path.join(ROOT, ".dockerignore"), "utf8"));
    const kontext = mkdtempSync(path.join(tmpdir(), "paibot-kontext-"));
    ordner.push(kontext);
    const kandidaten = [...dateienUnter("docs"), ...dateienUnter("scripts"), "package.json"];
    for (const datei of kandidaten) {
      if (ausgeschlossen(liste, datei)) continue;
      mkdirSync(path.dirname(path.join(kontext, datei)), { recursive: true });
      cpSync(path.join(ROOT, datei), path.join(kontext, datei));
    }
    // Wie im Dockerfile: `pnpm doku:index` ruft genau diesen Befehl auf.
    const skript = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8")).scripts[
      "doku:index"
    ];
    expect(skript).toBe("node scripts/doku-index.mjs");
    const lauf = spawnSync(process.execPath, ["scripts/doku-index.mjs"], {
      cwd: kontext,
      encoding: "utf8",
    });
    expect(lauf.status, lauf.stderr).toBe(0);
    const index = JSON.parse(
      readFileSync(path.join(kontext, "doku-index", "doku-index.json"), "utf8"),
    ) as { abschnitte: { seite: string }[] };
    const seiten = new Set(index.abschnitte.map((a) => `docs/${a.seite}`));
    for (const eintrag of IN_DEN_INDEX) {
      expect(
        [...seiten].some((s) => passtAuf(eintrag, s)),
        eintrag,
      ).toBe(true);
    }
  });

  it("Gegenprobe: ohne die Ausnahme-Zeilen fehlt der Kontext die Seiten und der Bau bricht ab", () => {
    const ohne = muster(readFileSync(path.join(ROOT, ".dockerignore"), "utf8")).filter(
      (z) => !z.startsWith("!docs/"),
    );
    expect(ausgeschlossen(ohne, "docs/installation.md")).toBe(true);
  });
});

describe("CI: Doku-Index im Image prüfen", () => {
  const ci = readFileSync(path.join(ROOT, ".github", "workflows", "ci.yml"), "utf8");
  const start = ci.search(/^ {2}docker:\s*$/m);
  const nachDocker = ci.slice(start);
  const naechster = nachDocker.slice(1).search(/^ {2}[A-Za-z0-9_-]+:\s*$/m);
  const job = naechster === -1 ? nachDocker : nachDocker.slice(0, naechster + 1);

  it("der Job richtet pnpm und Node ein und installiert, bevor das Skript den Index baut", () => {
    expect(start).toBeGreaterThan(-1);
    const installieren = job.indexOf("pnpm install --frozen-lockfile");
    const bauen = job.indexOf("node scripts/doku-index.mjs");
    expect(installieren).toBeGreaterThan(-1);
    expect(bauen).toBeGreaterThan(installieren);
    expect(job.indexOf("pnpm/action-setup@")).toBeGreaterThan(-1);
    expect(job.indexOf("actions/setup-node@")).toBeGreaterThan(-1);
  });
});
