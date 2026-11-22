/**
 * PaiBot – Quelltext-Test: Bots, Teams, Entwürfe und Fäden ändert nur der Besitzer-Weg der
 * Web-App, nie der Worker und nie die Lauf-Steuerung. Die Datenbank kann das nicht trennen (eine
 * Rolle für Web-App und Worker, siehe `APP_TABLE_RIGHTS`); deshalb prüft dieser Test den Quelltext
 * von `apps/worker` und `packages/agents`: keine Schreibfunktion für diese Tabellen und kein
 * Tabellen-Objekt von ihnen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const WURZEL = fileURLToPath(new URL("../../..", import.meta.url));
const ORDNER = ["apps/worker/src", "packages/agents/src"];

/** Schreibende Zugriffsfunktionen auf `bots` (Datei `repo/bots.ts`) und die Teams-Bereiche. */
const SCHREIBFUNKTIONEN = [
  "bots.create",
  "bots.update",
  "bots.setModel",
  "bots.remove",
  "teams",
  "teamEntwuerfe",
  "teamAnlagen",
  "faeden",
];
/** Tabellen-Objekte, die der Worker und die Lauf-Steuerung nie ansprechen. */
const TABELLEN = ["bots", "teams", "teamEntwuerfe", "teamAnlagen", "faeden"];

function quelltexte(ordner: string): { datei: string; text: string }[] {
  const liste: { datei: string; text: string }[] = [];
  const voll = path.join(WURZEL, ordner);
  if (!existsSync(voll)) return liste;
  const gehe = (pfad: string) => {
    for (const eintrag of readdirSync(pfad)) {
      if (["node_modules", "dist", ".next", "testdaten", "testing"].includes(eintrag)) continue;
      const p = path.join(pfad, eintrag);
      if (statSync(p).isDirectory()) gehe(p);
      else if (/\.(ts|tsx|mts|mjs)$/.test(eintrag) && !/\.test\.(ts|tsx)$/.test(eintrag)) {
        liste.push({ datei: path.relative(WURZEL, p), text: readFileSync(p, "utf8") });
      }
    }
  };
  gehe(voll);
  return liste;
}

/** Text ohne Kommentare, damit Erklärungen nicht als Code zählen. */
const ohneKommentare = (t: string) =>
  t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

/** Fundstellen im Text: Aufrufe von `repo.<funktion>` und Importe der Tabellen-Objekte. */
export function verbotenes(text: string): string[] {
  const code = ohneKommentare(text);
  const funde: string[] = [];
  for (const f of SCHREIBFUNKTIONEN) {
    if (new RegExp(`\\brepo\\.${f.replace(".", "\\.")}\\b`).test(code)) funde.push(`repo.${f}`);
  }
  for (const imp of code.matchAll(/import\s*(type\s*)?\{([^}]*)\}\s*from\s*"@paibot\/db"/g)) {
    if (imp[1]) continue;
    for (const teil of (imp[2] as string).split(",")) {
      const t = teil.trim();
      if (t.startsWith("type ")) continue;
      const name = (t.split(/\s+as\s+/)[0] ?? "").trim();
      if (TABELLEN.includes(name)) funde.push(`Tabelle ${name}`);
    }
  }
  return funde;
}

describe("Bots, Teams, Entwürfe und Fäden: nur der Besitzer-Weg schreibt", () => {
  it("apps/worker und packages/agents rufen keine Schreibfunktion und kein Tabellen-Objekt auf", () => {
    const fehler: string[] = [];
    let gelesen = 0;
    for (const ordner of ORDNER) {
      for (const { datei, text } of quelltexte(ordner)) {
        gelesen += 1;
        const funde = verbotenes(text);
        if (funde.length > 0) fehler.push(`${datei}: ${funde.join(", ")}`);
      }
    }
    expect(gelesen).toBeGreaterThan(20);
    expect(fehler).toEqual([]);
  });

  // Gegenprobe: das Muster erkennt jede der verbotenen Formen (sonst bliebe der Test blind).
  it("erkennt Schreibfunktionen, Tabellen-Objekte und ignoriert Kommentare und Lesen", () => {
    expect(verbotenes("await repo.bots.remove(db, id);")).toEqual(["repo.bots.remove"]);
    expect(verbotenes("await repo.bots.create(db, x);")).toEqual(["repo.bots.create"]);
    expect(verbotenes("await repo.teams.create(db, x);")).toEqual(["repo.teams"]);
    expect(verbotenes("repo.faeden.insert(tx, k)")).toEqual(["repo.faeden"]);
    expect(verbotenes('import { teams } from "@paibot/db";')).toEqual(["Tabelle teams"]);
    expect(verbotenes('import { bots as b, repo } from "@paibot/db";')).toEqual(["Tabelle bots"]);
    expect(verbotenes("// repo.bots.remove(db, id)\n/* repo.teams.x */ const a = 1;")).toEqual([]);
    expect(verbotenes("const bot = await repo.bots.get(tx, id);")).toEqual([]);
    expect(verbotenes('import type { bots } from "@paibot/db";')).toEqual([]);
  });
});
