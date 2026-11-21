/**
 * PaiBot – Tor-Pflicht im Quelltext: Jede Route-Datei unter `app` exportiert nur Handler über den
 * Rahmen `route(…)` (Ausnahmen: Health und Ereignis-Strom, beide nur `GET`); es gibt keine Server
 * Actions und kein `pages/api`. Schreibende Zugriffsfunktionen aus `@paibot/db` (aus deren
 * Quelltext ermittelt) rufen in Web-App und Worker nur die genannten Dateien auf; niemand schreibt
 * mit eigenem SQL oder über Tabellen-Objekte an den Zugriffsfunktionen vorbei.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as db from "@paibot/db";
import { describe, expect, it, vi } from "vitest";
import { rahmenVon } from "./lib/api/route";
import { API_ROUTEN, type RoutenName, routenOrdner } from "./lib/routen";

vi.setConfig({ testTimeout: 60_000 });

const SRC = fileURLToPath(new URL(".", import.meta.url));
const APP = path.join(SRC, "app");
const WORKER_SRC = fileURLToPath(new URL("../../worker/src", import.meta.url));
const REPO_SRC = fileURLToPath(new URL("../../../packages/db/src/repo", import.meta.url));

const METHODEN = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"] as const;
/** Routen mit eigener Antwortform ohne Rahmen; beide nur `GET`, beide verändern nichts. */
const EIGENE_FORM: readonly RoutenName[] = ["health", "ereignisse"];

function dateien(ordner: string, passt: (name: string) => boolean): string[] {
  const liste: string[] = [];
  if (!existsSync(ordner)) return liste;
  for (const eintrag of readdirSync(ordner)) {
    if (eintrag === "node_modules" || eintrag === ".next" || eintrag === "dist") continue;
    const voll = path.join(ordner, eintrag);
    if (statSync(voll).isDirectory()) liste.push(...dateien(voll, passt));
    else if (passt(eintrag)) liste.push(voll);
  }
  return liste;
}

const istQuelltext = (n: string) => /\.(ts|tsx|mts|js|mjs|jsx)$/.test(n);
const istTest = (datei: string) =>
  /\.test\.(ts|tsx)$/.test(datei) || /(^|\/)(testing|testhilfe)\.ts$/.test(datei);

/** Quelltext ohne Kommentare (Block und Zeile), damit Erklärungen nicht als Code zählen. */
function ohneKommentare(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

function rel(datei: string): string {
  return path
    .relative(path.join(SRC, "..", ".."), datei)
    .split(path.sep)
    .join("/");
}

// ---------------------------------------------------------------------------------------------
// Schreibende Zugriffsfunktionen, aus dem Quelltext von packages/db/src/repo ermittelt
// ---------------------------------------------------------------------------------------------

const SCHREIBT =
  /\.(insert|update|delete)\(|\binsert\s+into\b|\bdelete\s+from\b|\bupdate\s+"?[a-z_."]+"?\s+set\b|\btruncate\b/i;

/** Bereich (`repo.<bereich>`) → Datei, aus `repo/index.ts`. */
function bereiche(): Map<string, string> {
  const index = readFileSync(path.join(REPO_SRC, "index.ts"), "utf8");
  const karte = new Map<string, string>();
  for (const m of index.matchAll(/export \* as (\w+) from "\.\/(\w+)"/g)) {
    karte.set(m[1] as string, m[2] as string);
  }
  return karte;
}

/** Funktionen einer Datei mit ihrem Rumpf (bis zur nächsten Deklaration auf oberster Ebene). */
function funktionen(text: string): Map<string, { rumpf: string; exportiert: boolean }> {
  const karte = new Map<string, { rumpf: string; exportiert: boolean }>();
  const kopf =
    /^(export\s+)?(?:async\s+)?function\s*\*?\s*(\w+)|^(export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(/gm;
  const treffer = [...text.matchAll(kopf)];
  for (const [i, m] of treffer.entries()) {
    const ende = treffer[i + 1]?.index ?? text.length;
    const name = (m[2] ?? m[4]) as string;
    karte.set(name, {
      rumpf: text.slice(m.index, ende),
      exportiert: m[1] !== undefined || m[3] !== undefined,
    });
  }
  return karte;
}

/** Alle schreibenden Funktionen als `bereich.funktion`, auch über Aufrufe innerhalb von repo. */
function schreibendeFunktionen(): Set<string> {
  const karte = bereiche();
  const dateiZuBereich = new Map([...karte].map(([b, d]) => [d, b]));
  const alle = new Map<string, { rumpf: string; exportiert: boolean; datei: string }>();
  const importe = new Map<string, Map<string, string>>(); // datei → lokaler Name → datei
  for (const datei of readdirSync(REPO_SRC).filter((d) => d.endsWith(".ts") && !istTest(d))) {
    const basis = datei.replace(/\.ts$/, "");
    const text = ohneKommentare(readFileSync(path.join(REPO_SRC, datei), "utf8"));
    const lokal = new Map<string, string>();
    for (const m of text.matchAll(/import \* as (\w+) from "\.\/(\w+)"/g)) {
      lokal.set(m[1] as string, m[2] as string);
    }
    importe.set(basis, lokal);
    for (const [name, f] of funktionen(text)) alle.set(`${basis}#${name}`, { ...f, datei: basis });
  }
  const schreibend = new Set<string>();
  for (const [schluessel, f] of alle) if (SCHREIBT.test(f.rumpf)) schreibend.add(schluessel);
  // Bis nichts mehr dazukommt: wer eine schreibende Funktion ruft, schreibt auch.
  for (let neu = true; neu; ) {
    neu = false;
    for (const [schluessel, f] of alle) {
      if (schreibend.has(schluessel)) continue;
      const ruft = [...schreibend].some((s) => {
        const [datei, name] = s.split("#") as [string, string];
        if (datei === f.datei && new RegExp(`\\b${name}\\(`).test(f.rumpf)) return true;
        for (const [alias, ziel] of importe.get(f.datei) ?? []) {
          if (ziel === datei && f.rumpf.includes(`${alias}.${name}(`)) return true;
        }
        return false;
      });
      if (ruft) {
        schreibend.add(schluessel);
        neu = true;
      }
    }
  }
  const ergebnis = new Set<string>();
  for (const s of schreibend) {
    const [datei, name] = s.split("#") as [string, string];
    const bereich = dateiZuBereich.get(datei);
    if (bereich !== undefined && alle.get(s)?.exportiert) ergebnis.add(`${bereich}.${name}`);
  }
  // `repo.withTransaction` schreibt selbst nichts, `repo.StatuswechselError` ist ein Fehler-Typ.
  return ergebnis;
}

/** Aufrufe schreibender Funktionen in einer Datei: `repo.x.y(`, `x.y(` nach Import aus `/repo`. */
function schreibAufrufe(text: string, schreibend: ReadonlySet<string>): string[] {
  const funde = new Set<string>();
  for (const m of text.matchAll(/\brepo\.(\w+)\.(\w+)\b/g)) {
    const name = `${m[1]}.${m[2]}`;
    if (schreibend.has(name)) funde.add(name);
  }
  for (const imp of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*"@paibot\/db\/repo"/g)) {
    for (const teil of (imp[1] as string).split(",")) {
      const [orig, alias] = teil
        .replace(/\btype\b/, "")
        .trim()
        .split(/\s+as\s+/);
      if (!orig) continue;
      const lokal = alias ?? orig;
      for (const m of text.matchAll(new RegExp(`\\b${lokal}\\.(\\w+)\\b`, "g"))) {
        const name = `${orig}.${m[1]}`;
        if (schreibend.has(name)) funde.add(name);
      }
    }
  }
  return [...funde].sort();
}

/**
 * Dateien, die schreiben dürfen, mit Begründung. `aktion`: Aktionen hinter Routen bzw. Läufen;
 * dass sie nur in der Ausführung des Tors schreiben, prüft `gate-pflicht.test.ts` (Web) bzw.
 * `apps/worker/src/gate-pflicht.test.ts`. `betrieb`: Zustand von Zugang und Betrieb, der vor oder
 * neben jeder Aktion nötig ist; die Liste der Funktionen ist hier abschließend.
 */
const ERLAUBT: Record<string, { art: "aktion" } | { art: "betrieb"; nur: readonly string[] }> = {
  "web/src/lib/bot/bot.ts": { art: "aktion" },
  "web/src/lib/chat/aktionen.ts": { art: "aktion" },
  "web/src/lib/einstellungen/grenzen.ts": { art: "aktion" },
  "web/src/lib/modelle/anbieter.ts": { art: "aktion" },
  "web/src/lib/schleuse/schleuse.ts": { art: "aktion" },
  "web/src/lib/zugang/anmeldung.ts": { art: "aktion" },
  "web/src/lib/zugang/einrichtung.ts": { art: "aktion" },
  "web/src/lib/zugang/hinweis.ts": { art: "aktion" },
  // Zähler der Rate-Limits: vor jeder weiteren Arbeit, auch vor dem Tor; Sperren der Anmeldung
  // aufheben (Ausweg im Migrations-Schritt).
  "web/src/lib/rate-limit.ts": {
    art: "betrieb",
    nur: [
      "rateLimit.hit",
      "rateLimit.reset",
      "rateLimit.deleteByPrefix",
      "rateLimit.deleteOlderThan",
    ],
  },
  // Einrichtungs-Code: entsteht vor der Einrichtung, wenn es noch keinen Signaturschlüssel gibt.
  "web/src/lib/zugang/einrichtungs-code.ts": {
    art: "betrieb",
    nur: ["settings.ensure", "settings.setSetupCode"],
  },
  // Migrations-Schritt: offenen Einrichtungs-Code verwerfen, Sperren der Anmeldung aufheben.
  "web/src/lib/betrieb.ts": {
    art: "betrieb",
    nur: ["settings.clearSetupCode", "rateLimit.deleteByPrefix"],
  },
  // Sitzungen: anlegen/beenden rufen nur die Aktionen (Anmelden, Abmelden, Einrichtung) in ihrer
  // Ausführung; verlängern und abgelaufene beenden gehört zur Prüfung jeder Anfrage.
  "web/src/lib/zugang/sitzung.ts": {
    art: "betrieb",
    nur: ["sessions.create", "sessions.end", "sessions.extend"],
  },
  // Worker: Lauf als fehlgeschlagen markieren, wenn er abstürzt (Lebenszyklus, keine Aktion).
  "worker/src/lauf.ts": { art: "betrieb", nur: ["events.append", "runs.finish"] },
  // Worker: gemessener Zustand der Datenschleuse (eine Zeile, Betriebszustand, keine Aktion).
  "worker/src/schleuse-meldung.ts": { art: "betrieb", nur: ["schleuse.report"] },
};

function quelltexte(): { datei: string; text: string }[] {
  return [...dateien(SRC, istQuelltext), ...dateien(WORKER_SRC, istQuelltext)]
    .filter((d) => !istTest(d))
    .map((datei) => ({ datei, text: ohneKommentare(readFileSync(datei, "utf8")) }));
}

function schluesselVon(datei: string): string {
  return path
    .relative(path.join(SRC, "..", ".."), datei)
    .split(path.sep)
    .join("/");
}

describe("Tor-Pflicht im Quelltext: Routen", () => {
  it("jede Route-Datei unter app exportiert nur Handler über den Rahmen, passend zum Vertrag", async () => {
    const routenDateien = dateien(APP, (n) => /^route\.(ts|tsx|js|mjs|jsx)$/.test(n));
    expect(routenDateien.length).toBeGreaterThan(10);
    for (const datei of routenDateien) {
      const ordner = path.relative(APP, path.dirname(datei)).split(path.sep).join("/");
      const modul = (await import(datei)) as Record<string, unknown>;
      const exportiert = Object.keys(modul).filter((k) =>
        (METHODEN as readonly string[]).includes(k),
      );
      expect(exportiert.length, `${rel(datei)} exportiert keinen Handler`).toBeGreaterThan(0);
      for (const methode of exportiert) {
        const name = rahmenVon(modul[methode]);
        const eigene = EIGENE_FORM.find(
          (n) => routenOrdner(n) === ordner && API_ROUTEN[n].methode === methode,
        );
        if (name === undefined) {
          expect(eigene, `${methode} ${ordner}: Handler ohne Rahmen route(…)`).toBeDefined();
          continue;
        }
        expect(routenOrdner(name), `${methode} ${ordner}: Rahmen „${name}“`).toBe(ordner);
        expect(API_ROUTEN[name].methode, `${methode} ${ordner}: Rahmen „${name}“`).toBe(methode);
      }
    }
  });

  it("die Ausnahmen ohne Rahmen lesen nur", () => {
    for (const n of EIGENE_FORM) {
      expect(API_ROUTEN[n].methode, n).toBe("GET");
      expect(API_ROUTEN[n].veraendernd, n).toBe(false);
    }
  });

  it("keine Server Actions, kein pages/api, keine Route außerhalb von app/api", () => {
    for (const { datei, text } of quelltexte()) {
      expect(/^\s*["']use server["']/m.test(text), `${rel(datei)}: Server Action`).toBe(false);
    }
    expect(existsSync(path.join(SRC, "pages"))).toBe(false);
    expect(existsSync(path.join(SRC, "..", "pages"))).toBe(false);
    const ausserhalb = dateien(APP, (n) => /^route\.(ts|tsx|js|mjs|jsx)$/.test(n)).filter(
      (d) => !path.relative(APP, d).startsWith(`api${path.sep}`),
    );
    expect(ausserhalb.map(rel)).toEqual([]);
  });
});

describe("Tor-Pflicht im Quelltext: Schreiben nur an erlaubten Stellen", () => {
  const schreibend = schreibendeFunktionen();

  it("erkennt schreibende Zugriffsfunktionen aus dem Quelltext von @paibot/db", () => {
    for (const s of [
      "conversations.rename",
      "conversations.remove",
      "settings.update",
      "settings.ensure",
      "providers.create",
      "models.upsert",
      "sessions.extend",
      "events.append",
      "messages.insert",
      "runs.finish",
    ]) {
      expect(schreibend, s).toContain(s);
    }
    for (const s of [
      "conversations.get",
      "settings.get",
      "belege.listPage",
      "rules.loadSnapshot",
    ]) {
      expect(schreibend, s).not.toContain(s);
    }
    // Jede gefundene Funktion gibt es wirklich.
    for (const s of schreibend) {
      const [bereich, name] = s.split(".") as [string, string];
      const modul = (db.repo as unknown as Record<string, Record<string, unknown>>)[bereich];
      expect(modul?.[name], s).toBeTypeOf("function");
    }
  });

  it("schreibende Zugriffsfunktionen nur in den erlaubten Dateien (Seiten lesen nur)", () => {
    const fehler: string[] = [];
    const genutzt = new Set<string>();
    for (const { datei, text } of quelltexte()) {
      const aufrufe = schreibAufrufe(text, schreibend);
      if (aufrufe.length === 0) continue;
      const schluessel = schluesselVon(datei);
      genutzt.add(schluessel);
      const regel = ERLAUBT[schluessel];
      if (regel === undefined) {
        fehler.push(`${schluessel}: ${aufrufe.join(", ")}`);
        continue;
      }
      if (regel.art === "betrieb") {
        const zuviel = aufrufe.filter((a) => !regel.nur.includes(a));
        if (zuviel.length > 0) fehler.push(`${schluessel}: ${zuviel.join(", ")}`);
      }
    }
    expect(fehler).toEqual([]);
    // Jeder Eintrag der Liste wird noch gebraucht.
    expect([...genutzt].sort()).toEqual(Object.keys(ERLAUBT).sort());
  });

  it("niemand schreibt an den Zugriffsfunktionen vorbei (Tabellen, eigenes SQL, Treiber)", () => {
    const tabellen = new Set(
      Object.entries(db)
        .filter(([, wert]) => wert !== null && typeof wert === "object")
        .filter(([, wert]) => Symbol.for("drizzle:Name") in (wert as object))
        .map(([name]) => name),
    );
    expect(tabellen).toContain("belege");
    const fehler: string[] = [];
    for (const { datei, text } of quelltexte()) {
      const ort = rel(datei);
      for (const imp of text.matchAll(/import\s*(type\s*)?\{([^}]*)\}\s*from\s*"@paibot\/db"/g)) {
        if (imp[1]) continue;
        for (const teil of (imp[2] as string).split(",")) {
          const t = teil.trim();
          if (t.startsWith("type ")) continue;
          const name = t.split(/\s+as\s+/)[0] ?? "";
          if (tabellen.has(name)) fehler.push(`${ort}: Tabelle ${name}`);
        }
      }
      if (/from\s*"drizzle-orm|from\s*"postgres"|from\s*"@electric-sql\//.test(text)) {
        fehler.push(`${ort}: Datenbank-Treiber direkt`);
      }
      for (const m of text.matchAll(/\.(?:execute|unsafe|query)\(\s*(`[^`]*`|"[^"]*"|'[^']*')/g)) {
        if (SCHREIBT.test(m[1] as string)) fehler.push(`${ort}: SQL ${m[1]}`);
      }
    }
    expect(fehler).toEqual([]);
  });
});
