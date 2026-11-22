/**
 * PaiBot – Regel-Tests der Lauf-Steuerung: keine festen Übergangswerte außerhalb der Nahtstellen,
 * kein Weg in einen wartenden Zustand, Regeln des Tors nur aus der Datenbank.
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
const SKIP_DIRS = new Set(["node_modules", "dist", ".next", ".turbo", "coverage", "testdaten"]);

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

/** Quellen ohne Tests (`*.ts`, `*.tsx`) unter `dir`, relativ zum Projektstamm. */
function sources(dir: string, options: { withoutTesting?: boolean } = {}): string[] {
  const out: string[] = [];
  const walk = (current: string) => {
    for (const name of unlessGone(current, (full) => readdirSync(full)) ?? []) {
      const full = path.join(current, name);
      const stat = unlessGone(full, (entry) => statSync(entry));
      if (stat === undefined) continue;
      if (stat.isDirectory()) {
        if (SKIP_DIRS.has(name) || name.startsWith(".") || PROBE_DIR.test(name)) continue;
        if (options.withoutTesting && name === "testing") continue;
        walk(full);
      } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith(".d.ts")) {
        if (options.withoutTesting && name === "testing.ts") continue;
        out.push(path.relative(ROOT, full));
      }
    }
  };
  walk(path.join(ROOT, dir));
  return out;
}

/** Feste Übergangswerte der Fakten eines Laufs; sie entstehen nur in `run/nahtstellen.ts`. */
const TRANSITION_LITERALS: readonly RegExp[] = [
  /\buntrustedInput:\s*false\b/,
  /\bstep:\s*0\b/,
  /\brunTokens:\s*0\b/,
  /\btoolCount:\s*0\b/,
  /\btrigger:\s*["']chat["']/,
];
const GONE_NAMES = /\b(MAX_MOTOR_STEPS|TRANSITION_MAX_RUN_TOKENS)\b/;

/** Fundstellen fester Übergangswerte in einem Text. */
function transitionFindings(text: string): string[] {
  const found = TRANSITION_LITERALS.filter((pattern) => pattern.test(text)).map(String);
  if (GONE_NAMES.test(text)) found.push(String(GONE_NAMES));
  return found;
}

/** Wege in einen wartenden Zustand, die es in dieser Fassung nicht gibt. */
const WAITING_WAYS: readonly RegExp[] = [
  /recordDecision\([^;]{0,400}outcome:\s*["']ask["']/s,
  /\bruns\.markWaiting\s*\(/,
  /\bruns\.resume\s*\(/,
  /\btoolCalls\.(approve|rejectByOwner|markRunning)\s*\(/,
  /\.waitsForApproval\b/,
];

function waitingFindings(text: string): string[] {
  return WAITING_WAYS.filter((pattern) => pattern.test(text)).map(String);
}

/** Inhalt einer Quelle; leer nur, wenn sie zwischen Auflisten und Lesen verschwunden ist. */
const read = (file: string) =>
  unlessGone(path.join(ROOT, file), (full) => readFileSync(full, "utf8")) ?? "";

describe("Durchsuchen des Quelltexts", () => {
  // Gegenprobe: `PROBE_DIR` weiter fassen (etwa jeder Name mit `versuch`) → rot.
  it("überspringt nur die Probe-Ordner der anderen Tests, sonst keinen Ordner", () => {
    for (const name of ["__lint_versuch_123__", "__akteur_versuch_21429__"]) {
      expect(PROBE_DIR.test(name), name).toBe(true);
    }
    for (const name of ["versuch", "api", "__lint_versuch__", "__akteur_versuch_x__", "repo"]) {
      expect(PROBE_DIR.test(name), name).toBe(false);
    }
  });

  // Gegenprobe: `unlessGone` gibt bei jedem Fehler `undefined` zurück → rot.
  it("eine verschwundene Datei gilt als leer; jeder andere Fehler und jede vorhandene Datei bleibt", () => {
    expect(read("packages/agents/src/__gibt_es_nicht__.ts")).toBe("");
    expect(read("apps/worker/src/abhaengigkeiten.ts")).toContain("createGate(");
    expect(() =>
      unlessGone(path.join(ROOT, "apps/worker/src/abhaengigkeiten.ts"), () => {
        const error = new Error("vorhanden, aber nicht lesbar") as Error & { code: string };
        error.code = "ENOENT";
        throw error;
      }),
    ).toThrow("vorhanden");
    expect(() =>
      unlessGone(path.join(ROOT, "apps"), (full) => readFileSync(full, "utf8")),
    ).toThrow();
  });

  it("findet die echten Quellen, auch neben einem Probe-Ordner", () => {
    expect(sources("packages/db/src")).toContain(path.join("packages/db/src/repo/werkzeuge.ts"));
  });
});

describe("keine festen Übergangswerte", () => {
  const files = [
    ...sources("packages/agents/src", { withoutTesting: true }),
    ...sources("apps/worker/src", { withoutTesting: true }),
  ].filter((file) => file !== "packages/agents/src/run/nahtstellen.ts");

  it("die Prüfung erkennt jedes Literal (Gegenprobe im Test selbst)", () => {
    for (const sample of [
      "untrustedInput: false,",
      "step: 0,",
      "runTokens: 0",
      "toolCount: 0",
      'trigger: "chat"',
      "MAX_MOTOR_STEPS",
      "TRANSITION_MAX_RUN_TOKENS",
    ]) {
      expect(transitionFindings(`const x = { ${sample} };`)).not.toEqual([]);
    }
    expect(transitionFindings("const x = { step, toolCount: offered.length };")).toEqual([]);
  });

  it('keine Literale untrustedInput: false, step: 0, runTokens: 0, toolCount: 0, trigger: "chat" außerhalb von run/nahtstellen.ts', () => {
    expect(files.length).toBeGreaterThan(10);
    const found = files.flatMap((file) =>
      transitionFindings(read(file)).map((f) => `${file}: ${f}`),
    );
    expect(found).toEqual([]);
  });

  it("die Namen MAX_MOTOR_STEPS und TRANSITION_MAX_RUN_TOKENS kommen in keiner Quelle mehr vor", () => {
    const all = ["apps", "packages", "tools"].flatMap((dir) => sources(dir));
    const found = all.filter((file) => GONE_NAMES.test(read(file)));
    expect(found).toEqual([]);
  });
});

describe("kein Weg in einen wartenden Zustand", () => {
  it("die Prüfung erkennt jeden Weg (Gegenprobe im Test selbst)", () => {
    for (const sample of [
      'repo.toolCalls.recordDecision(db, id, { outcome: "ask", decisionReceiptId })',
      "repo.runs.markWaiting(db, id)",
      "repo.runs.resume(db, id)",
      "repo.toolCalls.approve(db, id)",
      "repo.toolCalls.rejectByOwner(db, id, x)",
      "repo.toolCalls.markRunning(db, id)",
      "if (error.waitsForApproval) {}",
    ]) {
      expect(waitingFindings(sample)).not.toEqual([]);
    }
    expect(waitingFindings('recordDecision(db, id, { outcome: "deny" })')).toEqual([]);
  });

  it("kein Aufruf von recordDecision mit ask, runs.markWaiting, runs.resume, toolCalls.approve/rejectByOwner/markRunning, kein Lesen von waitsForApproval", () => {
    const all = ["apps", "packages", "tools"].flatMap((dir) => sources(dir));
    expect(all.length).toBeGreaterThan(100);
    const found = all.flatMap((file) => waitingFindings(read(file)).map((f) => `${file}: ${f}`));
    expect(found).toEqual([]);
  });
});

describe("Regeln des Tors nur aus der Datenbank", () => {
  // Ein Regelstand ohne Standard-Regeln erreicht das Tor nie über den Lauf-Weg: Der Worker baut sein
  // Tor nur mit dem Lade-Weg der Datenbank (`repo.rules.loadSnapshot` prüft die Standard-Regeln),
  // und Steuerung und Worker bauen sonst kein Tor.
  const files = [
    ...sources("packages/agents/src", { withoutTesting: true }),
    ...sources("apps/worker/src", { withoutTesting: true }),
  ];

  it("createGate nur in apps/worker/src/abhaengigkeiten.ts, mit Regeln aus repo.rules.loadSnapshot", () => {
    const withGate = files.filter((file) => /\bcreateGate\s*\(/.test(read(file)));
    expect(withGate).toEqual(["apps/worker/src/abhaengigkeiten.ts"]);
    const text = read("apps/worker/src/abhaengigkeiten.ts");
    const gate = text.slice(text.indexOf("createGate("), text.indexOf("createGate(") + 400);
    expect(gate).toMatch(
      /load:\s*async\s*\(\)\s*=>\s*\{\s*const snapshot = await repo\.rules\.loadSnapshot\(db\);\s*return ruleSnapshot\(snapshot\.rules, snapshot\.stand\);/,
    );
  });

  it("die Prüfung schlägt bei einem anderen Lade-Weg an (Gegenprobe im Test selbst)", () => {
    const other = "createGate({ rules: { load: async () => ruleSnapshot(testRules) } })";
    expect(other).not.toMatch(/repo\.rules\.loadSnapshot/);
  });
});
