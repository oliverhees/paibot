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

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const SKIP_DIRS = new Set(["node_modules", "dist", ".next", ".turbo", "coverage", "testdaten"]);

/** Quellen ohne Tests (`*.ts`, `*.tsx`) unter `dir`, relativ zum Projektstamm. */
function sources(dir: string, options: { withoutTesting?: boolean } = {}): string[] {
  const out: string[] = [];
  const walk = (current: string) => {
    for (const name of readdirSync(current)) {
      const full = path.join(current, name);
      if (statSync(full).isDirectory()) {
        if (SKIP_DIRS.has(name) || name.startsWith(".")) continue;
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

const read = (file: string) => readFileSync(path.join(ROOT, file), "utf8");

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
