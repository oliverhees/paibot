/**
 * PaiBot – Test, dass der Akteur `besitzer` nur im Besitzer-Weg der Web-App entsteht und dass im
 * Worker und in den Bot-Paketen nur `botActor(...)` als Akteur vorkommt. Prüft die beiden Regeln
 * `akteur-besitzer.grit` und `akteur-nur-bot.grit` mit echten Gegenproben (Biome läuft wirklich),
 * den heutigen Stand und eine Bestandsliste aller Dateien mit dem Text `besitzer`.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const BIOME = createRequire(import.meta.url).resolve("@biomejs/biome/bin/biome");

interface Diagnostic {
  category: string;
  message: string;
  location?: { path?: string; start?: { line: number } };
}

/** Meldungen der Regel `akteur-besitzer.grit` bzw. `akteur-nur-bot.grit`. */
const BESITZER_WEG = /Besitzer-Weg/;
const NUR_BOT = /botActor|Bot-Pakete/;

function biome(args: string[]): Diagnostic[] {
  let output: string;
  try {
    output = execFileSync(process.execPath, [BIOME, "lint", "--reporter=json", ...args], {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error) {
    output = (error as { stdout: string }).stdout;
  }
  const report = JSON.parse(output) as { diagnostics: Diagnostic[] };
  return report.diagnostics.filter((d) => d.category === "plugin");
}

/**
 * Legt eine Datei in `<ordner>/__akteur_versuch_<pid>__/<name>` an (außerhalb von `src`-Dateien, die
 * jemand importiert), prüft sie mit Biome und löscht sie wieder.
 */
function lint(folder: string, source: string, name = "versuch.ts"): Diagnostic[] {
  const dir = path.join(ROOT, folder, `__akteur_versuch_${process.pid}__`);
  mkdirSync(dir, { recursive: true });
  try {
    writeFileSync(path.join(dir, name), source);
    return biome([path.relative(ROOT, path.join(dir, name))]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const imWeg = (folder: string, source: string, name?: string) =>
  lint(folder, source, name).filter((d) => BESITZER_WEG.test(d.message));
const imBot = (folder: string, source: string, name?: string) =>
  lint(folder, source, name).filter((d) => NUR_BOT.test(d.message));

/** Ordner, in denen der Besitzer-Akteur nicht entstehen darf (Beispiele aus dem ganzen Quelltext). */
const VERBOTEN = [
  "apps/web/src/lib/chat",
  "apps/web/src/app/api/versuch",
  "packages/gate/src",
  "packages/db/src/repo",
  "tools/e2e/src",
];

describe("Akteur besitzer nur im Besitzer-Weg: Gegenproben (muss rot sein)", () => {
  const ROT: Record<string, string> = {
    "Objekt-Literal":
      'export const a = { actionId: "x", type: "t", actor: "besitzer", target: {} };',
    "Schlüssel in Anführungszeichen": 'export const a = { "actor": "besitzer" };',
    "einfache Anführungszeichen": "export const a = { actor: 'besitzer' };",
    "Vorlagen-Text": "export const a = { actor: `besitzer` };",
    "Spread mit eigenem Akteur": 'export const a = { ...anfrage, actor: "besitzer" };',
    "Object.assign": 'export const a = Object.assign({}, { actor: "besitzer" });',
    Bedingung: 'export const a = { actor: kaputt ? "besitzer" : botActor(x) };',
    Zusicherung: 'export const a = "besitzer" as Actor;',
    satisfies: 'export const a = "besitzer" satisfies Actor;',
    "Variable mit Akteur-Typ": 'export const a: Actor = "besitzer";',
    "Hilfsfunktion (function)": 'export function ownerActor(): Actor {\n  return "besitzer";\n}',
    "Hilfsfunktion (Pfeil)": 'export const ownerActor = (): Actor => "besitzer";',
    "Hilfsfunktion (Pfeil mit Block)":
      'export const ownerActor = (): Actor => {\n  return "besitzer";\n};',
    "Hilfsfunktion (async)":
      'export async function ownerActor(): Promise<Actor> {\n  return "besitzer";\n}',
    "Hilfsfunktion mit Bedingung":
      'export function ownerActor(x: number): Actor {\n  if (x) return "besitzer";\n  return "bot:x";\n}',
    "Typ beim Import umbenannt, der Wert steht trotzdem im Literal":
      'import type { Actor as A } from "@paibot/shared";\nexport const a = { actor: "besitzer" } as { actor: A };',
  };

  for (const [name, source] of Object.entries(ROT)) {
    it(`${name}: in jedem verbotenen Ordner rot`, () => {
      for (const folder of VERBOTEN) {
        expect(imWeg(folder, source).length, `${folder}: ${source}`).toBeGreaterThan(0);
      }
    });
  }

  it("Datei mit .tsx und .mjs wird ebenso geprüft", () => {
    expect(
      imWeg("apps/web/src/lib/chat", 'export const a = { actor: "besitzer" };', "v.tsx"),
    ).not.toEqual([]);
    expect(imWeg("scripts", 'export const a = { actor: "besitzer" };', "v.mjs")).not.toEqual([]);
  });
});

describe("Akteur besitzer nur im Besitzer-Weg: erlaubt (muss grün bleiben)", () => {
  const GRUEN: Record<string, string> = {
    "Zugang einer Route": 'export const r = { zugang: "besitzer" };',
    "Typ mit dem Text": 'export type Von = "alle" | "bot" | "besitzer";',
    "Anzeige-Wert": 'export const w = { von: "besitzer", text: "Du" };',
    "Vergleich mit dem Akteur":
      'export const k = (a: string) => (a === "besitzer" ? "besitzer" : "bot");',
    "Akteur von außen lesen": "export const a = (b: { actor: string }) => b.actor;",
    "Bot-Akteur": 'export const a = { actor: botActor("bot_x") };',
    "Funktion mit Akteur-Typ ohne Besitzer":
      "export function f(): Actor {\n  return botActor(x);\n}",
    "Funktion ohne Akteur-Typ": 'export function f(): string {\n  return "besitzer";\n}',
    "Zeichen im Kommentar": '// actor: "besitzer" steht nur im Kommentar\nexport const a = 1;',
    "Zeichen in einem Text": 'export const a = "actor: besitzer";',
  };

  for (const [name, source] of Object.entries(GRUEN)) {
    it(`${name}: in keinem Ordner gemeldet`, () => {
      for (const folder of ["apps/web/src/lib/chat", "packages/gate/src", "tools/e2e/src"]) {
        expect(imWeg(folder, source), `${folder}: ${source}`).toEqual([]);
      }
    });
  }

  it("unter apps/web/src/lib/api/ ist der Akteur erlaubt, auch in einer Unterordner-Datei", () => {
    const source = 'export const a = { actor: "besitzer" };\nexport const b = "besitzer" as Actor;';
    expect(imWeg("apps/web/src/lib/api", source)).toEqual([]);
  });

  it("Tests dürfen den Akteur setzen (*.test.ts und *.test.tsx)", () => {
    const source = 'export const a = { actor: "besitzer" };';
    for (const folder of VERBOTEN) {
      expect(imWeg(folder, source, "versuch.test.ts"), folder).toEqual([]);
    }
    expect(imWeg("apps/web/src/lib/chat", source, "versuch.test.tsx")).toEqual([]);
  });

  it("die Testhilfe der Belege ist ausdrücklich ausgenommen, aber nur genau diese Datei", () => {
    // Sie baut absichtlich Besitzer-Anfragen für Tests des Belege-Schreibers; sie wird nie vom
    // Produktivcode geladen (Test-Zugang `@paibot/receipts/testing`, Regel `nur-in-tests.grit`).
    expect(biome(["packages/receipts/src/testhilfen.ts"])).toEqual([]);
    expect(imWeg("packages/receipts/src", 'export const a = { actor: "besitzer" };')).not.toEqual(
      [],
    );
  });

  it("heute: der ganze Quelltext enthält keinen Verstoß gegen beide Regeln", () => {
    const funde = biome(["."]).filter(
      (d) => BESITZER_WEG.test(d.message) || NUR_BOT.test(d.message),
    );
    expect(funde.map((d) => `${d.location?.path}:${d.location?.start?.line} ${d.message}`)).toEqual(
      [],
    );
  });
});

describe("Akteur besitzer nur im Besitzer-Weg: was die Regel nicht erkennt (Grenzen)", () => {
  // Diese Fälle sind absichtlich als „bleibt grün“ festgehalten. Wird die Regel besser, ändert man
  // sie hier bewusst. Aufgefangen werden sie nur von der Bestandsliste weiter unten, soweit der
  // Text `besitzer` in der Datei steht.
  const NICHT_ERKANNT: Record<string, string> = {
    "Konstante, später als Akteur benutzt":
      'const OWNER = "besitzer";\nexport const a = { actor: OWNER };',
    "zusammengesetzter Text": 'export const a = { actor: "besit" + "zer" };',
    "berechneter Schlüssel": 'export const a = { ["actor"]: "besitzer" };',
    "Anfrage von außen als Ganzes": "export const a = (anfrage: object) => ({ ...anfrage });",
    "Hilfsfunktion ohne Typ-Angabe": 'export const ownerActor = () => "besitzer";',
    "Methode mit Typ-Angabe":
      'export const o = {\n  holen(): Actor {\n    return "besitzer";\n  },\n};',
    "Wert aus einer anderen Datei":
      'import { OWNER } from "./anders";\nexport const a = { actor: OWNER };',
  };

  for (const [name, source] of Object.entries(NICHT_ERKANNT)) {
    it(`${name}: wird nicht gemeldet`, () => {
      expect(imWeg("apps/web/src/lib/chat", source)).toEqual([]);
    });
  }
});

describe("Worker und Bot-Pakete: Akteur nur als botActor(...)", () => {
  const BOT_ORDNER = [
    "apps/worker/src",
    "packages/agents/src/run",
    "packages/mcp/src",
    "packages/jobs/src",
  ];

  const ROT: Record<string, string> = {
    "Besitzer als Wert": 'export const a = { actor: "besitzer" };',
    "Text besitzer irgendwo": 'export const a = { zugang: "besitzer" };',
    "Akteur aus einem Parameter": "export const a = (actor: string) => ({ actor: actor });",
    "Akteur aus einem Feld": "export const a = (p: { x: string }) => ({ actor: p.x });",
    Kurzschreibweise: "export const a = (actor: string) => ({ actor });",
    "Schlüssel in Anführungszeichen": 'export const a = (x: string) => ({ "actor": x });',
    "Akteur-Typ importiert": 'import type { Actor } from "@paibot/shared";\nexport type T = Actor;',
    "Akteur-Typ umbenannt importiert":
      'import type { Actor as A } from "@paibot/shared";\nexport type T = A;',
    "Akteur-Art importiert":
      'import { type ActorKind } from "@paibot/shared";\nexport type T = ActorKind;',
    "Prüf-Funktion importiert":
      'import { actorKind } from "@paibot/shared";\nexport const k = actorKind;',
    "Akteur-Typ als Parameter": "export function f(a: Actor) {\n  return a;\n}",
    "Feld `actor` im Typ": "export type T = { actor: string };",
    "bot-Akteur ohne botActor": "export const a = { actor: `bot:\u0024{id}` };",
  };

  for (const [name, source] of Object.entries(ROT)) {
    it(`${name}: in jedem Ordner rot`, () => {
      for (const folder of BOT_ORDNER) {
        expect(imBot(folder, source).length, `${folder}: ${source}`).toBeGreaterThan(0);
      }
    });
  }

  it("botActor(...) ist erlaubt, auch mit Zeilenumbruch und verschachtelt", () => {
    const source = [
      "declare function botActor(id: string): string;",
      "declare const run: { botId: string };",
      "export const a = { actor: botActor(run.botId) };",
      "export const b = {",
      "  actor: botActor(",
      "    run.botId,",
      "  ),",
      "};",
      "export const c = a.actor === b.actor;",
    ].join("\n");
    for (const folder of BOT_ORDNER) {
      expect(imBot(folder, source), folder).toEqual([]);
    }
  });

  it("Tests dürfen alles (*.test.ts)", () => {
    const source = 'export const a = { actor: "besitzer" };';
    for (const folder of BOT_ORDNER) {
      expect(imBot(folder, source, "versuch.test.ts"), folder).toEqual([]);
    }
  });

  it("die reinen Raum-Regeln dürfen den Text besitzer nennen (Autor-Art, Auswahlwert), mehr nicht", () => {
    const raum = "packages/agents/src/raum";
    expect(imBot(raum, 'export type RaumAutor = "besitzer" | "bot";')).toEqual([]);
    expect(imBot(raum, 'export const abnahme: "leitung" | "besitzer" = "besitzer";')).toEqual([]);
    // Alles andere bleibt dort scharf.
    expect(imBot(raum, "export const a = (actor: string) => ({ actor });")).not.toEqual([]);
    expect(imBot(raum, 'import type { Actor } from "@paibot/shared";')).not.toEqual([]);
    expect(imWeg(raum, 'export const a = { actor: "besitzer" };')).not.toEqual([]);
    expect(imBot(raum, 'export const a = { actor: "besitzer" };')).not.toEqual([]);
    // Außerhalb von raum/ bleibt der Text verboten.
    expect(imBot("packages/agents/src/run", 'export const a = "besitzer";')).not.toEqual([]);
  });

  it("außerhalb von Worker und Bot-Paketen gilt diese zweite Regel nicht", () => {
    const source = "export const a = (actor: string) => ({ actor });";
    expect(imBot("apps/web/src/lib/api", source)).toEqual([]);
    expect(imBot("packages/gate/src", source)).toEqual([]);
  });

  it("auch im Worker sieht die erste Regel den Besitzer-Akteur (zwei Hürden)", () => {
    const source = 'export const a = { actor: "besitzer" };';
    expect(imWeg("apps/worker/src", source)).not.toEqual([]);
    expect(imBot("apps/worker/src", source)).not.toEqual([]);
  });
});

describe("Bestandsliste: wo der Text `besitzer` im Quelltext steht", () => {
  /**
   * Jede Datei außerhalb von Tests und `apps/web/src/lib/api/`, in der `"besitzer"` (oder
   * `'besitzer'`) vorkommt. Das fängt, was die Regel nicht sieht (Konstante, die später als Akteur
   * dient, Umweg über eine Hilfsdatei). Neue Datei hier? Dann prüfen: Baut sie einen Akteur fürs Tor,
   * gehört sie in `apps/web/src/lib/api/`. Ist es nur Anzeige, Typ oder Vertrag, hier eintragen.
   */
  const BEKANNT: Record<string, string> = {
    // Verträge und Typen: legen fest, welche Aktion von welcher Art Akteur kommt (kein Akteur-Wert).
    "packages/shared/src/actions.ts": "Vertrag: Art des Akteurs je Aktion, Typ Actor",
    "packages/shared/src/gate.ts": "Vertrag: Bedingungen über die Art des Akteurs",
    "packages/gate/src/fassungen/fassung-1.ts": "Vertrag Fassung 1: Art des Akteurs je Aktion",
    "packages/gate/src/fassungen/fassung-2.ts": "Vertrag Fassung 2: Art des Akteurs je Aktion",
    "packages/db/src/rollen.ts": "Datenbank-Rolle mit dem Namen besitzer (kein Akteur)",
    // Anzeige und Wegweiser der Web-App.
    "apps/web/src/lib/routen.ts": "Zugang je Route (Sitzung nötig)",
    "apps/web/src/lib/zugang/weiterleitung.ts": "liest den Zugang einer Route",
    "apps/web/src/lib/zugang/einrichtung.ts": "Name eines Einrichtungs-Schritts",
    "apps/web/src/lib/chat/typen.ts": "Anzeige-Typ des Belege-Eintrags",
    "apps/web/src/lib/chat/laden.ts": "liest den Akteur eines Belegs für die Anzeige",
    "apps/web/src/lib/belege/darstellung.ts": "Anzeige: wer hat gehandelt",
    "apps/web/src/app/(app)/chat/BelegeFlaeche.tsx": "Anzeige im Chat",
    "apps/web/src/app/(app)/belege/BelegeAnsicht.tsx": "Anzeige und Filter der Belege",
    // Teamchat und Team-Entwurf: Autor-Art einer Nachricht und Auswahlwert, kein Akteur fürs Tor.
    "packages/agents/src/raum/regeln.ts": "Auswahl: Art des Autors, Abnahme im Team-Entwurf",
    "packages/agents/src/raum/verlauf.ts": "Auswahl: Art des Autors einer Nachricht",
    "apps/web/src/lib/team/entwurf/format.ts": "Auswahlwert abnahme (leitung, besitzer, ohne)",
    // Testhilfen und Testdaten: bauen Besitzer-Anfragen nur für Tests.
    "packages/receipts/src/testhilfen.ts": "Testhilfe (in der Regel ausgenommen)",
    "packages/receipts/src/testdaten/kette-l1-erzeugen.ts":
      "Testdaten: erzeugt eine feste Beleg-Kette (in der Regel ausgenommen)",
    "packages/gate/src/testdaten.ts": "Testdaten für die Tor-Tests",
    "packages/db/src/testdaten.ts": "Testdaten für die Datenbank-Tests",
  };

  function dateien(): string[] {
    const out = execFileSync(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
    return out
      .split("\0")
      .filter((f) => /\.(?:ts|tsx|mjs|js|cjs)$/.test(f))
      .filter((f) => !/\.test\.(?:ts|tsx)$/.test(f))
      .filter((f) => !f.startsWith("apps/web/src/lib/api/"))
      .filter((f) => !f.startsWith("tools/lint-regeln/"));
  }

  function mitText(datei: string): boolean {
    let text: string;
    try {
      text = readFileSync(path.join(ROOT, datei), "utf8");
    } catch {
      return false; // gelöscht, aber noch in der Liste von Git
    }
    return text
      .split("\n")
      .filter((zeile) => !/^\s*(?:\/\/|\/\*|\*)/.test(zeile))
      .some((zeile) => /["']besitzer["']/.test(zeile));
  }

  it("keine Datei mit dem Text besitzer ist unbekannt", () => {
    const unbekannt = dateien().filter((d) => mitText(d) && !(d in BEKANNT));
    expect(unbekannt, "Neue Fundstelle: siehe Kommentar über BEKANNT").toEqual([]);
  });

  it("jeder Eintrag der Liste stimmt noch (keine toten Einträge)", () => {
    const vorhanden = new Set(dateien());
    const tot = Object.keys(BEKANNT).filter((d) => !vorhanden.has(d) || !mitText(d));
    expect(tot).toEqual([]);
  });

  it("Worker und Bot-Pakete stehen nie in der Liste (außer den reinen Raum-Regeln)", () => {
    for (const datei of Object.keys(BEKANNT)) {
      if (datei.startsWith("packages/agents/src/raum/")) continue;
      expect(datei).not.toMatch(/^(?:apps\/worker|packages\/(?:agents|mcp|jobs))\//);
    }
  });
});
