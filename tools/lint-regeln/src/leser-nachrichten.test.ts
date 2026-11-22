/**
 * PaiBot – Regel-Test: Welche Dateien Nachrichten lesen, steht fest. Wer eine neue Stelle
 * ergänzt, trägt sie hier und in der Tabelle „Wer liest Nachrichten“ in
 * `docs/entwickler/werkzeug-kern.md` ein und entscheidet dabei, ob sie nur End-Antworten sieht.
 * In der Web-App liest `listForConversation` nur mit `nurAntworten: true`.
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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
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
 * Kurzlebige Probe-Ordner anderer Tests dieses Pakets (`regeln.test.ts`,
 * `akteur-besitzer.test.ts`): Sie entstehen und verschwinden, während die Dateien parallel laufen.
 */
const PROBE_DIR = /^__(lint|akteur)_versuch_\d+__$/;

/** Fehler „Datei oder Ordner gibt es nicht (mehr)“? */
const isGone = (error: unknown) => (error as { code?: string }).code === "ENOENT";

/**
 * Wie `fn(full)`, aber `undefined`, wenn der Eintrag zwischen Auflisten und Zugriff verschwunden
 * ist. Ein Eintrag, den es noch gibt, wird nie übergangen: Dann geht der Fehler weiter.
 */
function unlessGone<T>(full: string, fn: (full: string) => T): T | undefined {
  try {
    return fn(full);
  } catch (error) {
    if (isGone(error) && !existsSync(full)) return undefined;
    throw error;
  }
}

/** Produktions-Quellen (ohne Tests, Testhilfen und Testdaten) unter `dir`, relativ zum Projektstamm. */
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
      } else if (
        /\.(tsx?|mjs)$/.test(name) &&
        !/\.test\.(tsx?|mjs)$/.test(name) &&
        !name.endsWith(".d.ts") &&
        name !== "testing.ts" &&
        name !== "testhilfe.ts"
      ) {
        out.push(path.relative(ROOT, full).split(path.sep).join("/"));
      }
    }
  };
  walk(path.join(ROOT, dir));
  return out;
}

/** Inhalt einer Quelle; leer nur, wenn sie zwischen Auflisten und Lesen verschwunden ist. */
const read = (file: string) =>
  unlessGone(path.join(ROOT, file), (full) => readFileSync(full, "utf8")) ?? "";

/** Text ohne Block-Kommentare und ohne Zeilen, die nur aus einem Kommentar bestehen. */
function ohneKommentare(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

/** So liest Code die Tabelle `messages` (Zugriffsfunktionen, Suche, Abfragen, Lesestand der Web-App). */
const LESER: readonly RegExp[] = [
  /\brepo\.messages\./,
  /\brepo\.search\.messageHits\b/,
  /\bquery\.messages\b/,
  /\.from\(messages\)/,
  /\bladeVerlauf\(/,
];

/** Dateien (aus `texte`: Pfad → Inhalt), die Nachrichten lesen, sortiert. */
function leserDateien(texte: ReadonlyMap<string, string>): string[] {
  return [...texte.entries()]
    .filter(([, text]) => {
      const code = ohneKommentare(text);
      return LESER.some((muster) => muster.test(code));
    })
    .map(([datei]) => datei)
    .sort();
}

/**
 * Aufrufe von `messages.listForConversation(…)` ohne `nurAntworten: true` in den Argumenten:
 * je Fund die Stelle (Datei und Beginn des Aufrufs).
 */
function ohneNurAntworten(texte: ReadonlyMap<string, string>): string[] {
  const funde: string[] = [];
  for (const [datei, text] of texte) {
    const code = ohneKommentare(text);
    for (const treffer of code.matchAll(/\bmessages\.listForConversation\(/g)) {
      let tiefe = 1;
      let ende = (treffer.index ?? 0) + treffer[0].length;
      while (ende < code.length && tiefe > 0) {
        const zeichen = code[ende];
        if (zeichen === "(") tiefe += 1;
        else if (zeichen === ")") tiefe -= 1;
        ende += 1;
      }
      const aufruf = code.slice(treffer.index, ende);
      if (!/\bnurAntworten:\s*true\b/.test(aufruf)) {
        funde.push(`${datei}: ${aufruf.replace(/\s+/g, " ").slice(0, 90)}`);
      }
    }
  }
  return funde;
}

/**
 * Jede Datei, die Nachrichten liest, mit der Entscheidung (siehe `docs/entwickler/werkzeug-kern.md`,
 * Abschnitt „Wer liest Nachrichten“): nur End-Antworten, alle (mit Grund) oder nur Schreiben.
 */
const ERWARTET = [
  // Web-App: Verlauf, Lese-Route, Datei, Suche, Nachricht senden, neu erzeugen
  "apps/web/src/app/(app)/chat/[id]/page.tsx",
  "apps/web/src/lib/chat/aktionen.ts",
  "apps/web/src/lib/chat/export.ts",
  "apps/web/src/lib/chat/laden.ts",
  "apps/web/src/lib/chat/suche.ts",
  // alle Antworten des Bots zählen für den Verbrauch
  "apps/web/src/lib/einstellungen/grenzen.ts",
  // Lauf-Steuerung: Verlauf ans Modell, Aufräumen, Schreiben von Antworten
  "packages/agents/src/run/aufraeumen.ts",
  "packages/agents/src/run/kontext.ts",
  "packages/agents/src/run/schleife.ts",
  "packages/agents/src/run/strom.ts",
  // Zugriffsfunktionen
  "packages/db/src/repo/nachrichten.ts",
  "packages/db/src/repo/suche.ts",
] as const;

const WURZELN = ["apps", "packages", "tools", "scripts", "deploy"] as const;

function alleTexte(): Map<string, string> {
  const texte = new Map<string, string>();
  for (const wurzel of WURZELN) {
    for (const datei of sources(wurzel)) texte.set(datei, read(datei));
  }
  return texte;
}

describe("Wer Nachrichten liest", () => {
  // Gegenprobe: in `apps/web/src/lib/chat` eine Datei mit `repo.messages.listForConversation(db, id)` anlegen → rot.
  it("genau diese Dateien lesen die Tabelle der Nachrichten (neue Stelle: hier und in der Doku eintragen)", () => {
    expect(leserDateien(alleTexte())).toEqual([...ERWARTET].sort());
  });

  // Gegenprobe: `nurAntworten: true` aus einem Aufruf in `aktionen.ts` streichen → rot.
  it("jeder Aufruf von `listForConversation` in der Web-App liest nur End-Antworten", () => {
    const web = new Map([...alleTexte()].filter(([datei]) => datei.startsWith("apps/web/src/")));
    expect(ohneNurAntworten(web)).toEqual([]);
    // Die Prüfung sieht die Aufrufe wirklich (sonst wäre sie leer und damit wertlos).
    const mit = [...web.values()].filter((t) => /messages\.listForConversation\(/.test(t));
    expect(mit.length).toBeGreaterThanOrEqual(2);
  });

  it("die Suche erkennt eine neue Stelle und einen Aufruf ohne Filter (Gegenprobe im Test selbst)", () => {
    const probe = new Map([
      ["a.ts", "const x = await repo.messages.listForConversation(db, id);"],
      ["b.ts", "const x = await repo.messages.listForConversation(\n tx, id, { limit: 5 });"],
      [
        "c.ts",
        "await repo.messages.listForConversation(tx, id, { limit: 5, nurAntworten: true });",
      ],
      ["d.ts", "// repo.messages.insert steht nur im Kommentar\n/** repo.messages.get */"],
      ["e.ts", "const v = await ladeVerlauf(db, id);"],
      ["f.ts", "const r = await tx.query.messages.findMany({});"],
      ["g.ts", "const r = await db.select().from(messages);"],
      ["h.ts", "const r = await repo.runs.listForConversation(db, id);"],
    ]);
    expect(leserDateien(probe)).toEqual(["a.ts", "b.ts", "c.ts", "e.ts", "f.ts", "g.ts"]);
    expect(ohneNurAntworten(probe).map((f) => f.split(":")[0])).toEqual(["a.ts", "b.ts"]);
  });
});
