/**
 * PaiBot – Regel-Test des Werkzeugs „In der Doku nachschlagen“: Nur der Lader liest eine Datei;
 * kein Modul des Werkzeugs öffnet Netz oder Prozesse oder ruft `fetch`.
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
const ORDNER = "packages/agents/src/werkzeuge/doku";
const SKIP_DIRS = new Set(["node_modules", "dist", "testdaten"]);

/**
 * Kurzlebige Probe-Ordner anderer Tests dieses Pakets (`regeln.test.ts`,
 * `akteur-besitzer.test.ts`): Sie entstehen und verschwinden, während die Dateien parallel laufen.
 */
const PROBE_DIR = /^__(lint|akteur)_versuch_\d+__$/;

const isGone = (error: unknown) => (error as { code?: string }).code === "ENOENT";

/** Wie `fn(full)`, aber `undefined`, wenn der Eintrag inzwischen verschwunden ist. */
function unlessGone<T>(full: string, fn: (full: string) => T): T | undefined {
  try {
    return fn(full);
  } catch (error) {
    if (isGone(error) && !existsSync(full)) return undefined;
    throw error;
  }
}

/** Quellen des Werkzeugs ohne Tests und Testdaten, mit Inhalt, relativ zum Projektstamm. */
function quellen(): { datei: string; text: string }[] {
  const out: { datei: string; text: string }[] = [];
  const walk = (current: string) => {
    for (const name of unlessGone(current, (full) => readdirSync(full)) ?? []) {
      const full = path.join(current, name);
      const stat = unlessGone(full, (entry) => statSync(entry));
      if (stat === undefined) continue;
      if (stat.isDirectory()) {
        if (SKIP_DIRS.has(name) || name.startsWith(".") || PROBE_DIR.test(name)) continue;
        walk(full);
      } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
        const text = unlessGone(full, (entry) => readFileSync(entry, "utf8"));
        if (text !== undefined) out.push({ datei: path.relative(ROOT, full), text });
      }
    }
  };
  walk(path.join(ROOT, ORDNER));
  return out;
}

/** Module, die ein Text importiert (statisch und dynamisch). */
function importe(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(
    /\bfrom\s+["']([^"']+)["']|\bimport\s*\(\s*["']([^"']+)["']|\brequire\s*\(\s*["']([^"']+)["']/g,
  )) {
    out.push(m[1] ?? m[2] ?? m[3] ?? "");
  }
  return out;
}

const DATEI = /^(?:node:)?fs(?:\/promises)?$/;
const NETZ = /^(?:node:)?(?:net|http|https|http2|dgram|tls|child_process|worker_threads|cluster)$/;

// Gegenprobe: `import { readFileSync } from "node:fs"` in `werkzeug.ts` → rot.
describe("Werkzeug „In der Doku nachschlagen“ ohne Dateien und Netz", () => {
  it("es gibt Quellen des Werkzeugs (sonst prüft der Test nichts)", () => {
    expect(quellen().map((q) => path.basename(q.datei))).toContain("index-laden.ts");
  });

  it("nur index-laden.ts importiert node:fs", () => {
    const mitFs = quellen()
      .filter((q) => importe(q.text).some((m) => DATEI.test(m)))
      .map((q) => path.basename(q.datei));
    expect(mitFs).toEqual(["index-laden.ts"]);
  });

  it("kein Modul importiert node:net, node:http, node:https oder node:child_process", () => {
    const funde = quellen().flatMap((q) =>
      importe(q.text)
        .filter((m) => NETZ.test(m))
        .map((m) => `${q.datei}: ${m}`),
    );
    expect(funde).toEqual([]);
  });

  it("kein Modul ruft fetch auf", () => {
    const funde = quellen()
      .filter((q) => /\bfetch\s*\(/.test(q.text))
      .map((q) => q.datei);
    expect(funde).toEqual([]);
  });
});
