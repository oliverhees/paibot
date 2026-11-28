/**
 * PaiBot – Regel-Test: Welche Dateien Nachrichten lesen, steht fest. Wer eine neue Stelle
 * ergänzt, trägt sie hier und in der Tabelle „Wer liest Nachrichten“ in
 * `docs/entwickler/werkzeug-kern.md` ein und entscheidet dabei, ob sie nur End-Antworten sieht.
 * In der Web-App liest `listForConversation` nur mit `nurAntworten: true`; die eine Ausnahme ist der
 * Lesestand für die Ansicht der Schritte (`ladeVerlauf` mit `mitSchritten`).
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
 * Kurzlebige Probe-Ordner anderer Tests dieses Pakets (`regeln.test.ts`, `akteur-besitzer.test.ts`,
 * `mcp-schicht.test.ts`; Name `__<art>_versuch_<pid>__`): Sie entstehen und verschwinden, während
 * die Dateien parallel laufen. Dasselbe Muster steht in `werkzeug-schleife.test.ts`,
 * `doku-werkzeug.test.ts` und `leser-nachrichten.test.ts`; ein Test dort hält die Kopien gleich.
 */
const PROBE_DIR = /^__[a-z]+_versuch_\d+__$/;

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

/**
 * Ist der Dateiname eine Quelle, die Code enthalten kann (alle üblichen Endungen von TypeScript und
 * JavaScript), aber kein Test, keine Typ-Datei und keine Testhilfe?
 */
function istProduktionsQuelle(name: string): boolean {
  return (
    /\.(tsx?|jsx?|mjs|cjs|mts|cts)$/.test(name) &&
    !/\.test\.(tsx?|jsx?|mjs|cjs|mts|cts)$/.test(name) &&
    !/\.d\.(ts|mts|cts)$/.test(name) &&
    name !== "testing.ts" &&
    name !== "testhilfe.ts"
  );
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
      } else if (istProduktionsQuelle(name)) {
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

/**
 * Text ohne Kommentare: Block-Kommentare und Zeilen-Kommentare, auch hinter Code
 * (`{ limit: 5, // nurAntworten: true }`). Zeichenketten und Vorlagen-Texte bleiben unverändert,
 * auch wenn `//` darin steht (etwa in einer Adresse). Ein Anführungszeichen gilt bis zum Zeilenende
 * (außer Rückwärts-Apostroph), damit ein Apostroph in einem Text den Rest nicht verschluckt.
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

/** So liest Code die Tabelle `messages` (Zugriffsfunktionen, Suche, Abfragen, Lesestand der Web-App). */
const LESER: readonly RegExp[] = [
  // `repo.messages` in jeder Form: `repo.messages.get`, `repo?.messages.get`, `const m = repo.messages`
  /\brepo\??\.messages\b/,
  // jeder Name, der die Zugriffsfunktionen aufruft (Import als Namensraum, `repo` unter anderem Namen)
  /\b\w+\??\.messages\??\.(?:insert|get|listForConversation|finalize|tokensSince)\b/,
  // Lesen über einen berechneten Namen: `repo[k]`
  /\brepo\s*\[/,
  // `sql`… from ${messages}``, auch `${schema.messages}`
  /\$\{\s*(?:\w+\.)?messages\s*\}/,
  // Import der Tabelle ohne `as` aus dem Datenbank-Paket
  /\bimport\s*(?:type\s*)?\{[^}]*\bmessages\b[^}]*\}\s*from\s*["']@paibot\/db/,
  /\brepo\.search\.messageHits\b/,
  /\bquery\.messages\b/,
  /\bladeVerlauf\(/,
  // Tabelle unter eigenem Namen oder über das Schema: Import mit `as`, `schema.messages`,
  // `.from(x.messages)`, `join(messages`
  /\bmessages\s+as\s+\w+/,
  /\b\w*[sS]chema\.messages\b/,
  /\.from\(\s*(?:\w+\.)?messages\s*\)/,
  /[jJ]oin\(\s*(?:\w+\.)?messages\b/,
  // Zerlegen: `const { messages } = repo`, `const { messages: m } = repo`
  /\{[^{}]*\bmessages\b\s*(?::\s*\w+\s*)?(?:,[^{}]*)?\}\s*=[^=>]/,
  // Schreibweise mit Klammern: `repo["messages"]`
  /\[\s*["']messages["']\s*\]/,
  // rohes SQL: `from messages`, `join messages`, auch mit Schema-Namen oder Anführungszeichen
  /\b(?:from|join)\s+(?:"?\w+"?\.)?"?messages\b/i,
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
    for (const treffer of code.matchAll(/\bmessages\??\.listForConversation\(/g)) {
      let tiefe = 1;
      let ende = (treffer.index ?? 0) + treffer[0].length;
      while (ende < code.length && tiefe > 0) {
        const zeichen = code[ende];
        if (zeichen === "(") tiefe += 1;
        else if (zeichen === ")") tiefe -= 1;
        ende += 1;
      }
      const aufruf = code.slice(treffer.index, ende);
      if (!hatFilter(aufruf)) {
        funde.push(`${datei}: ${aufruf.replace(/\s+/g, " ").slice(0, 90)}`);
      }
    }
    // Die Funktion unter anderem Namen (`const { listForConversation: l } = repo.messages`): Der
    // Aufruf ist dann nicht mehr zu prüfen und gilt als Fund.
    for (const treffer of code.matchAll(
      /\{[^{}]*\blistForConversation\b[^{}]*\}\s*=\s*[\w.?]*\bmessages\b/g,
    )) {
      funde.push(`${datei}: ${treffer[0].replace(/\s+/g, " ").slice(0, 90)}`);
    }
  }
  return funde;
}

/**
 * Hat der Aufruf (Text von `messages.listForConversation(` bis zur schließenden Klammer) genau
 * einen Filter `nurAntworten: true` als Eintrag einer Option? Nicht gezählt: der Filter in einem
 * Text, ein zweiter Eintrag gleichen Namens, `...`-Optionen (können ihn überschreiben) und eine
 * Verknüpfung wie `nurAntworten: true && flag`.
 */
function hatFilter(aufruf: string): boolean {
  const ohneTexte = aufruf.replace(/"[^"\n]*"|'[^'\n]*'|`[^`]*`/g, '""');
  if (ohneTexte.includes("...")) return false;
  if ((ohneTexte.match(/\bnurAntworten\b/g) ?? []).length !== 1) return false;
  return /\bnurAntworten:\s*true\s*(?=[,}])/.test(ohneTexte);
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
  "packages/agents/src/run/nahtstellen.ts",
  "packages/agents/src/run/schleife.ts",
  "packages/agents/src/run/strom.ts",
  // zählt nur, ob es überhaupt eine Nachricht an einen neuen Bot gibt („Rückgängig“ als Ganzes)
  "packages/db/src/repo/entwuerfe.ts",
  // Zugriffsfunktionen
  "packages/db/src/repo/nachrichten.ts",
  "packages/db/src/repo/suche.ts",
] as const;

/** Die einzige Stelle der Web-App, die Zwischentexte lesen darf (für die Ansicht der Schritte). */
const AUSNAHME_LESESTAND = "apps/web/src/lib/chat/laden.ts";

const WURZELN = ["apps", "packages", "tools", "scripts", "deploy"] as const;

function alleTexte(): Map<string, string> {
  const texte = new Map<string, string>();
  for (const wurzel of WURZELN) {
    for (const datei of sources(wurzel)) texte.set(datei, read(datei));
  }
  return texte;
}

/** Dateien, die `ladeVerlauf` mit `mitSchritten: true` aufrufen (Zwischentexte und Aufrufe lesen). */
function mitSchrittenAufrufer(texte: ReadonlyMap<string, string>): string[] {
  return [...texte.entries()]
    .filter(([, text]) =>
      /\bladeVerlauf\([^;]*\bmitSchritten:\s*true\b/s.test(ohneKommentare(text)),
    )
    .map(([datei]) => datei)
    .sort();
}

describe("Wer Zwischentexte liest", () => {
  // Gegenprobe: in einer weiteren Datei der Web-App `ladeVerlauf(db, id, { mitSchritten: true })`
  // aufrufen → rot (erwartet: genau die Chat-Seite und die Lese-Route).
  it("nur die Chat-Seite und die Lese-Route `nachrichten` rufen `ladeVerlauf` mit `mitSchritten: true` auf", () => {
    expect(mitSchrittenAufrufer(alleTexte())).toEqual([
      "apps/web/src/app/(app)/chat/[id]/page.tsx",
      "apps/web/src/lib/chat/aktionen.ts",
    ]);
  });

  it("die Suche erkennt einen neuen Aufrufer (Gegenprobe im Test selbst)", () => {
    const probe = new Map([
      ["a.ts", "const v = await ladeVerlauf(db, id, { mitSchritten: true });"],
      ["b.ts", "const v = await ladeVerlauf(\n db, id,\n { mitSchritten: true });"],
      ["c.ts", "const v = await ladeVerlauf(db, id);"],
      ["d.ts", "// ladeVerlauf(db, id, { mitSchritten: true })"],
    ]);
    expect(mitSchrittenAufrufer(probe)).toEqual(["a.ts", "b.ts"]);
  });
});

describe("Wer Nachrichten liest", () => {
  // Gegenprobe: in `apps/web/src/lib/chat` eine Datei mit `repo.messages.listForConversation(db, id)` anlegen → rot.
  it("genau diese Dateien lesen die Tabelle der Nachrichten (neue Stelle: hier und in der Doku eintragen)", () => {
    expect(leserDateien(alleTexte())).toEqual([...ERWARTET].sort());
  });

  // Gegenprobe: `nurAntworten: true` aus einem Aufruf in `aktionen.ts` streichen → rot; ein zweiter
  // Aufruf ohne den Filter (außer in `laden.ts`) → rot.
  it("jeder Aufruf von `listForConversation` in der Web-App liest nur End-Antworten, außer genau einem: dem Lesestand für die Ansicht", () => {
    const web = new Map([...alleTexte()].filter(([datei]) => datei.startsWith("apps/web/src/")));
    // Die eine Ausnahme: `ladeVerlauf` liest mit der Option `mitSchritten` auch Zwischentexte (die
    // Ansicht der Schritte); ohne die Option, für Datei, Suche und alle anderen, bleibt es beim Filter.
    expect(ohneNurAntworten(web).map((f) => f.split(":")[0])).toEqual([AUSNAHME_LESESTAND]);
    expect(read(AUSNAHME_LESESTAND)).toMatch(/nurAntworten:\s*!mitSchritten\b/);
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

  // Gegenprobe: ein Muster aus `LESER` streichen → die zugehörige Schreibweise hier wird rot.
  it("erkennt die Tabelle auch unter anderem Namen, zerlegt, als rohes SQL und im Schema", () => {
    const proben: [string, string][] = [
      [
        "import-as",
        'import { messages as nachr } from "@paibot/db/repo";\nawait db.select().from(nachr);',
      ],
      ["zerlegt", "const { messages } = repo;"],
      ["zerlegt-umbenannt", "const { messages: m, runs } = repo;"],
      ["sql", "await db.execute(sql`select content from messages where id = 1`);"],
      ["sql-schema", 'await db.execute(sql`select 1 from public."messages"`);'],
      ["sql-join", "sql`select * from runs join messages on messages.run_id = runs.id`"],
      ["schema-from", "db.select().from(schema.messages);"],
      ["from-name", "db.select().from(tabellen.messages);"],
      ["join", "q.innerJoin(messages, eq(a, b));"],
      ["join-schema", "q.leftJoin(schema.messages, eq(a, b));"],
      ["klammern", 'await repo["messages"].get(db, id);'],
    ];
    for (const [name, code] of proben) {
      expect(leserDateien(new Map([[`${name}.ts`, code]])), name).toEqual([`${name}.ts`]);
    }
  });

  it("meldet nichts bei ähnlichem, das keine Nachrichten liest", () => {
    const harmlos = new Map([
      ["a.ts", "const fehler = 'Es gibt keine messages mehr';"],
      ["b.ts", "const { runs } = repo; const o = { messages: 5 };"],
      ["c.ts", "// const { messages } = repo;\n/* from messages */ const x = 1;"],
      ["d.ts", "const text = 'Nachrichten from users';"],
    ]);
    expect(leserDateien(harmlos)).toEqual([]);
  });

  it("nimmt alle Endungen von TypeScript und JavaScript auf, aber weder Tests noch Typ-Dateien", () => {
    for (const name of ["a.ts", "a.tsx", "a.js", "a.jsx", "a.mjs", "a.cjs", "a.mts", "a.cts"]) {
      expect(istProduktionsQuelle(name), name).toBe(true);
    }
    for (const name of [
      "a.test.ts",
      "a.test.js",
      "a.test.cjs",
      "a.test.mts",
      "a.d.ts",
      "a.d.mts",
      "a.d.cts",
      "a.json",
      "a.md",
      "testing.ts",
    ]) {
      expect(istProduktionsQuelle(name), name).toBe(false);
    }
  });

  // Gegenprobe: in `ohneKommentare` die Zeilen-Kommentare hinter Code nicht mehr entfernen → rot.
  it("ein Filter, der nur im Kommentar steht, zählt nicht", () => {
    const probe = new Map([
      [
        "a.ts",
        "await repo.messages.listForConversation(tx, id, { limit: 5, // nurAntworten: true\n });",
      ],
      [
        "b.ts",
        "await repo.messages.listForConversation(tx, id, { limit: 5, /* nurAntworten: true */ });",
      ],
      [
        "c.ts",
        "await repo.messages.listForConversation(tx, id, { limit: 5,\n // nurAntworten: true\n });",
      ],
      [
        "d.ts",
        "await repo.messages.listForConversation(tx, id, { nurAntworten: true, limit: 5 }); // fertig",
      ],
      ["e.ts", 'await repo.messages.listForConversation(tx, "http://x", { nurAntworten: true });'],
      ["f.ts", "await repo.messages.listForConversation(tx, it's, { nurAntworten: true });"],
    ]);
    expect(ohneNurAntworten(probe).map((f) => f.split(":")[0])).toEqual(["a.ts", "b.ts", "c.ts"]);
  });

  it("Kommentare werden entfernt, Zeichenketten mit // bleiben", () => {
    expect(ohneKommentare("a // b\nc")).toBe("a \nc");
    expect(ohneKommentare("a /* b */ c")).toBe("a   c");
    expect(ohneKommentare('const u = "http://x"; // weg')).toBe('const u = "http://x"; ');
    expect(ohneKommentare("const t = `a // b`;")).toBe("const t = `a // b`;");
  });
});

// Gegenprobe: Je ein Muster aus `LESER` bzw. die Prüfung des Filters in `ohneNurAntworten`
// streichen → die zugehörige Probe wird rot. Die Proben sind bekannte Umgehungen
// der früheren Fassung der Regel.
describe("Umgehungen der Regel", () => {
  it("erkennt Leser unter anderen Schreibweisen", () => {
    const proben: [string, string][] = [
      ["namensraum", 'import * as r from "@paibot/db/repo";\nawait r.messages.get(db, id);'],
      [
        "repo-als-r",
        'import { repo as r } from "@paibot/db";\nawait r.messages.listForConversation(db, id);',
      ],
      ["alias", "const m = repo.messages;\nawait m.get(db, id);"],
      ["optional", "await repo?.messages.get(db, id);"],
      ["optional-zweimal", "await repo?.messages?.get(db, id);"],
      // biome-ignore lint/suspicious/noTemplateCurlyInString: Probe-Code als Text, kein Platzhalter
      ["sql-vorlage", "await db.execute(sql`select 1 from ${messages} where id = 1`);"],
      // biome-ignore lint/suspicious/noTemplateCurlyInString: Probe-Code als Text, kein Platzhalter
      ["sql-schema", "await db.execute(sql`select 1 from ${schema.messages} where id = 1`);"],
      [
        "import-ohne-as",
        'import { messages } from "@paibot/db/schema";\nconst t = messages;\ndb.select().from(t);',
      ],
      ["dynamisch", "const x = await repo[k].get(db, id);"],
    ];
    for (const [name, code] of proben) {
      expect(leserDateien(new Map([[`${name}.ts`, code]])), name).toEqual([`${name}.ts`]);
    }
  });

  it("meldet einen Aufruf ohne Filter, auch wenn der Filter nur scheinbar da ist", () => {
    const proben: [string, string][] = [
      [
        "spread",
        "await repo.messages.listForConversation(tx, id, { nurAntworten: true, ...opts });",
      ],
      [
        "spread-vorne",
        "await repo.messages.listForConversation(tx, id, { ...opts, nurAntworten: true });",
      ],
      [
        "doppelt",
        "await repo.messages.listForConversation(tx, id, { nurAntworten: true, nurAntworten: false });",
      ],
      ["als-text", 'await repo.messages.listForConversation(tx, id, "nurAntworten: true");'],
      ["als-text-2", "await repo.messages.listForConversation(tx, id, 'nurAntworten: true');"],
      [
        "verknuepft",
        "await repo.messages.listForConversation(tx, id, { nurAntworten: true && flag });",
      ],
      [
        "zerlegt",
        "const { listForConversation: l } = repo.messages;\nawait l(tx, id, { nurAntworten: true });",
      ],
      ["optional-aufruf", "await repo?.messages?.listForConversation(tx, id, { limit: 5 });"],
    ];
    for (const [name, code] of proben) {
      expect(ohneNurAntworten(new Map([[`${name}.ts`, code]])).length, name).toBe(1);
    }
  });

  it("lässt einen echten Filter durch, auch hinter anderen Optionen und über Zeilen", () => {
    const gut = new Map([
      ["a.ts", "await repo.messages.listForConversation(tx, id, { nurAntworten: true });"],
      [
        "b.ts",
        "await repo.messages.listForConversation(tx, id, { limit: 5, nurAntworten: true });",
      ],
      [
        "c.ts",
        "await repo?.messages.listForConversation(\n  tx,\n  id,\n  { nurAntworten: true,\n limit: 3 },\n);",
      ],
    ]);
    expect(ohneNurAntworten(gut)).toEqual([]);
  });

  it("meldet nichts bei ähnlichem, das keine Nachrichten liest (zweite Runde)", () => {
    const harmlos = new Map([
      ["a.ts", "const r = await fetch(url); return r.messages.map((m) => m.text);"],
      ["b.ts", "const { runs } = repo; await repo.runs.get(db, id);"],
      ["c.ts", 'import { messages } from "ai";'],
      ["d.ts", "await repo.conversations.get(db, id);"],
    ]);
    expect(leserDateien(harmlos)).toEqual([]);
  });
});
