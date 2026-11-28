/**
 * PaiBot – Regel-Test: Welche Dateien in die Tabellen `bots` und `teams` schreiben, steht fest.
 * Ein Team aus einer Vorlage entsteht ausschließlich in der Transaktion von
 * `packages/db/src/repo/entwuerfe.ts`; wer eine neue schreibende Stelle ergänzt, trägt sie hier
 * und in der Tabelle „Wer schreibt Bots und Teams“ in `docs/entwickler/team-entwurf.md` ein.
 *
 * Geprüft wird beides: die Tabellen selbst (`insert`, `update`, `delete` über Drizzle oder rohes
 * SQL) und die schreibenden Zugriffsfunktionen (`create`, `update`, `remove`, `setModel`,
 * `setPaused`, `setTeam`, `anlegenUnterGrenze`, `aendernUnterNamenspruefung`,
 * `aendernUnterLeitungspruefung`).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-28
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * Nicht durchsucht: Abhängigkeiten, Bau-Ergebnisse (`.next` enthält eine Kopie des Quelltexts),
 * Testdaten, Testhilfen (`testing`) und die erzeugten Wanderungen (`drizzle`).
 */
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".next",
  ".turbo",
  "coverage",
  "testdaten",
  "testing",
  "drizzle",
]);

/**
 * Kurzlebige Probe-Ordner anderer Tests dieses Pakets (Name `__<art>_versuch_<pid>__`): Sie
 * entstehen und verschwinden, während die Dateien parallel laufen. Dasselbe Muster steht in
 * `leser-nachrichten.test.ts`.
 */
const PROBE_DIR = /^__[a-z]+_versuch_\d+__$/;

const isGone = (error: unknown) => (error as { code?: string }).code === "ENOENT";

/** Wie `fn(full)`, aber `undefined`, wenn der Eintrag zwischendurch verschwunden ist. */
function unlessGone<T>(full: string, fn: (full: string) => T): T | undefined {
  try {
    return fn(full);
  } catch (error) {
    if (isGone(error) && !existsSync(full)) return undefined;
    throw error;
  }
}

/** Quelle mit Code, aber kein Test, keine Typ-Datei und keine Testhilfe? */
function istProduktionsQuelle(name: string): boolean {
  return (
    /\.(tsx?|jsx?|mjs|cjs|mts|cts)$/.test(name) &&
    !/\.test\.(tsx?|jsx?|mjs|cjs|mts|cts)$/.test(name) &&
    !/\.d\.(ts|mts|cts)$/.test(name) &&
    name !== "testing.ts" &&
    name !== "testhilfe.ts"
  );
}

function sources(dir: string): string[] {
  const out: string[] = [];
  const walk = (current: string) => {
    for (const name of unlessGone(current, (full) => readdirSync(full)) ?? []) {
      const full = path.join(current, name);
      const stat = unlessGone(full, (entry) => statSync(entry));
      if (stat === undefined) continue;
      if (stat.isDirectory()) {
        if (SKIP_DIRS.has(name) || name.startsWith(".") || PROBE_DIR.test(name)) continue;
        walk(full);
      } else if (istProduktionsQuelle(name)) {
        out.push(path.relative(ROOT, full).split(path.sep).join("/"));
      }
    }
  };
  walk(path.join(ROOT, dir));
  return out;
}

const read = (file: string) =>
  unlessGone(path.join(ROOT, file), (full) => readFileSync(full, "utf8")) ?? "";

/**
 * Text ohne Kommentare; Zeichenketten und Vorlagen-Texte bleiben, auch wenn `//` darin steht.
 * Ein Anführungszeichen gilt bis zum Zeilenende (außer Rückwärts-Apostroph).
 */
function ohneKommentare(text: string): string {
  let out = "";
  let quote: string | undefined;
  let i = 0;
  while (i < text.length) {
    const c = text[i] as string;
    const next = text[i + 1];
    if (quote !== undefined) {
      out += c;
      if (c === "\\" && next !== undefined) {
        out += next;
        i += 2;
        continue;
      }
      if (c === quote || (c === "\n" && quote !== "`")) quote = undefined;
      i += 1;
    } else if (c === "/" && next === "/") {
      while (i < text.length && text[i] !== "\n") i += 1;
    } else if (c === "/" && next === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end < 0 ? text.length : end + 2;
      out += " ";
    } else {
      if (c === '"' || c === "'" || c === "`") quote = c;
      out += c;
      i += 1;
    }
  }
  return out;
}

/** Die schreibenden Zugriffsfunktionen von `repo.bots` und `repo.teams`. */
const SCHREIBER_FUNKTIONEN = [
  "create",
  "update",
  "remove",
  "setModel",
  "setPaused",
  "setTeam",
  "anlegenUnterGrenze",
  "aendernUnterNamenspruefung",
  "aendernUnterLeitungspruefung",
].join("|");

/** So schreibt Code die Tabellen `bots` und `teams` (oder ihre Mitglieder-Sicht). */
const SCHREIBER: readonly RegExp[] = [
  // Drizzle auf der Tabelle, auch unter eigenem Namen (`bots as botsTabelle`) und über das Schema
  /\.(?:insert|update|delete)\(\s*(?:\w+\.)?(?:bots|teams|botsTabelle|teamsTabelle|teamMembers)\s*[),]/,
  // Zugriffsfunktion über `repo`, auch optional und unter anderem Namen (`r.bots.create`)
  new RegExp(String.raw`\b\w+\??\.(?:bots|teams)\??\.(?:${SCHREIBER_FUNKTIONEN})\s*\(`),
  // Zugriffsfunktion über den eingeführten Namensraum (`import { bots } from "./bots"`)
  new RegExp(String.raw`(?:^|[^.\w])(?:bots|teams)\??\.(?:${SCHREIBER_FUNKTIONEN})\s*\(`, "m"),
  // Schreiben über einen berechneten Namen: `repo[k].create(`
  new RegExp(String.raw`\brepo\s*\[[^\]]*\]\??\.(?:${SCHREIBER_FUNKTIONEN})\s*\(`),
] as const;

/**
 * Rohes SQL schreibt das Projekt nur in einer `sql`…``-Vorlage. Vor dieser Prüfung fallen deshalb
 * Texte in einfachen und doppelten Anführungszeichen weg: Ein Satz wie
 * `"insert into bots ist verboten"` ist eine Meldung, kein Schreibzugriff.
 */
const SQL_SCHREIBER =
  /\b(?:insert\s+into|update|delete\s+from)\s+(?:"?\w+"?\.)?"?(?:bots|teams|team_members)\b/i;

/**
 * Code ohne Texte in einfachen und doppelten Anführungszeichen. Innerhalb einer Vorlage
 * (Rückwärts-Apostroph) bleibt alles stehen: Dort steht das SQL, und `"teams"` ist darin der Name
 * der Tabelle, kein Text.
 */
function ohneAnfuehrungszeichen(code: string): string {
  let out = "";
  let i = 0;
  while (i < code.length) {
    const c = code[i] as string;
    if (c === "`") {
      // Vorlage unverändert übernehmen, bis zum passenden Rückwärts-Apostroph
      out += c;
      i += 1;
      while (i < code.length && code[i] !== "`") {
        if (code[i] === "\\" && i + 1 < code.length) {
          out += code.slice(i, i + 2);
          i += 2;
          continue;
        }
        out += code[i];
        i += 1;
      }
      if (i < code.length) {
        out += "`";
        i += 1;
      }
    } else if (c === '"' || c === "'") {
      // Text bis zum schließenden Zeichen oder bis zum Zeilenende durch "" ersetzen
      out += '""';
      i += 1;
      while (i < code.length && code[i] !== c && code[i] !== "\n") {
        i += code[i] === "\\" ? 2 : 1;
      }
      if (i < code.length && code[i] === c) i += 1;
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

/** Dateien (Pfad → Inhalt), die in `bots` oder `teams` schreiben, sortiert. */
function schreiberDateien(texte: ReadonlyMap<string, string>): string[] {
  return [...texte.entries()]
    .filter(([, text]) => {
      const code = ohneKommentare(text);
      return (
        SCHREIBER.some((muster) => muster.test(code)) ||
        SQL_SCHREIBER.test(ohneAnfuehrungszeichen(code))
      );
    })
    .map(([datei]) => datei)
    .sort();
}

/**
 * Jede Datei, die Bots oder Teams schreibt, mit dem Weg, auf dem sie das tut. Eine neue Zeile hier
 * ist eine Entscheidung: Jeder dieser Wege muss durch das Tor gehen und einen Beleg schreiben.
 */
const ERWARTET = [
  // ein Bot von Hand: anlegen, ändern, Modell, Pause, löschen
  "apps/web/src/lib/bot/bot.ts",
  // Teams von Hand: anlegen, umbenennen, Leitung, Mitglieder, löschen
  "apps/web/src/lib/teams/verwaltung.ts",
  // der erste Bot bei der Einrichtung
  "apps/web/src/lib/zugang/einrichtung.ts",
  // Team aus einer Vorlage: eine Transaktion für Team und alle Bots, Rückgängig als Ganzes
  "packages/db/src/repo/entwuerfe.ts",
  // die Zugriffsfunktionen selbst (hier liegen die Tabellen)
  "packages/db/src/repo/bots.ts",
  "packages/db/src/repo/teams.ts",
] as const;

const WURZELN = ["apps", "packages", "tools", "scripts", "deploy"] as const;

function alleTexte(): Map<string, string> {
  const texte = new Map<string, string>();
  for (const wurzel of WURZELN) {
    for (const datei of sources(wurzel)) texte.set(datei, read(datei));
  }
  return texte;
}

describe("Wer Bots und Teams schreibt", () => {
  // Gegenprobe: in `apps/web/src/lib/teams` eine Datei mit `await repo.teams.create(db, x)`
  // anlegen → rot. Ebenso: eine Zeile aus `ERWARTET` streichen → rot.
  it("genau diese Dateien schreiben Bots und Teams (neue Stelle: hier und in der Doku eintragen)", () => {
    expect(schreiberDateien(alleTexte())).toEqual([...ERWARTET].sort());
  });

  it("die Suche sieht die bekannten Stellen wirklich (sonst wäre sie wertlos)", () => {
    const texte = alleTexte();
    for (const datei of ERWARTET) {
      expect(schreiberDateien(new Map([[datei, texte.get(datei) ?? ""]])), datei).toEqual([datei]);
    }
  });

  it("erkennt jede Schreibweise des Schreibens (Gegenprobe im Test selbst)", () => {
    const proben: [string, string][] = [
      ["repo", "await repo.teams.create(db, eingabe);"],
      ["repo-optional", "await repo?.bots?.update(db, id, patch);"],
      ["repo-umbenannt", 'import { repo as r } from "@paibot/db";\nawait r.bots.remove(db, id);'],
      ["namensraum", 'import * as r from "@paibot/db/repo";\nawait r.teams.update(db, id, p);'],
      ["modul", 'import { bots } from "./bots";\nawait bots.anlegenUnterGrenze(tx, b, 10);'],
      ["eingefuehrt", "await teams.create(tx, { id, name });"],
      ["drizzle", "await db.insert(bots).values(zeile);"],
      ["drizzle-alias", "await tx.update(botsTabelle).set({ teamId: null });"],
      ["drizzle-schema", "await tx.delete(schema.teams).where(eq(teams.id, id));"],
      ["drizzle-mitglieder", "await tx.insert(teamMembers).values(zeilen);"],
      ["dynamisch", "await repo[art].create(db, eingabe);"],
      ["sql", "await db.execute(sql`insert into bots (id) values ('x')`);"],
      ["sql-schema", 'await db.execute(sql`update public."teams" set name = $1`);'],
      ["sql-loeschen", "await db.execute(sql`delete from team_members where bot_id = $1`);"],
    ];
    for (const [name, code] of proben) {
      expect(schreiberDateien(new Map([[`${name}.ts`, code]])), name).toEqual([`${name}.ts`]);
    }
  });

  it("meldet nichts beim Lesen und bei ähnlichem, das nicht schreibt", () => {
    const harmlos = new Map([
      [
        "lesen.ts",
        "const alle = await repo.bots.list(db);\nconst t = await repo.teams.get(db, id);",
      ],
      ["lesen-standard.ts", "const b = await repo.bots.getDefault(db);"],
      ["lesen-mitglieder.ts", "const m = await repo.teams.mitglieder(db, id);"],
      ["andere-tabelle.ts", "await db.insert(conversations).values(zeile);"],
      ["andere-funktion.ts", "await repo.apps.create(db, eingabe);"],
      ["kommentar.ts", "// await repo.teams.create(db, x);\n/* db.insert(bots) */ const x = 1;"],
      ["text.ts", "const hinweis = 'insert into bots ist verboten';"],
      ["zaehlen.ts", "const n = await repo.bots.count(db);"],
      ["sql-lesen.ts", "await db.execute(sql`select * from bots where team_id = $1`);"],
    ]);
    expect(schreiberDateien(harmlos)).toEqual([]);
  });

  it("nimmt alle Endungen auf, aber weder Tests noch Typ-Dateien noch Testhilfen", () => {
    for (const name of ["a.ts", "a.tsx", "a.js", "a.mjs", "a.cjs", "a.mts", "a.cts"]) {
      expect(istProduktionsQuelle(name), name).toBe(true);
    }
    for (const name of [
      "a.test.ts",
      "a.test.mts",
      "a.d.ts",
      "a.json",
      "testing.ts",
      "testhilfe.ts",
    ]) {
      expect(istProduktionsQuelle(name), name).toBe(false);
    }
  });
});
