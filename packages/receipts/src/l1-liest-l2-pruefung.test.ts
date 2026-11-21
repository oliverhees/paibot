/**
 * PaiBot – Test: Die Prüfung eines Stands, der nur Tor-Fassung 1 kennt, urteilt über Belege der
 * Fassung 2 „mit dieser Fassung nicht prüfbar“, nie „kein Beleg“ und nie „vertrauenswürdig“. Das
 * Tor-Paket ist dafür auf Fassung 1 beschränkt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { describe, expect, it, vi } from "vitest";
import { CLI_EXIT, runCli } from "./cli";
import { parseJsonl } from "./jsonl";
import { ketteL2 } from "./testdaten/kette-l2";
import { verifyChain } from "./verify";

vi.mock("@paibot/gate", async (importOriginal) => {
  const original = await importOriginal<typeof import("@paibot/gate")>();
  const GATE_FORMATS = { 1: original.GATE_FORMATS[1] };
  return {
    ...original,
    GATE_FORMATS,
    KNOWN_GATE_FORMAT: 1,
    gateFormatSpec: (format: number) => (format === 1 ? original.GATE_FORMATS[1] : undefined),
  };
});

describe("Prüfung, die nur Fassung 1 kennt", () => {
  it("Export: gelesen, Urteil nicht prüfbar, kein Fehler", async () => {
    const kette = await ketteL2("roh");
    const { entries } = parseJsonl(kette.text);
    expect(entries.length).toBe(kette.entries.length);
    const report = await verifyChain(entries, { rules: kette.rules });
    expect(report.verdict.level).toBe("nicht_pruefbar");
    expect(report.ok).toBe(false);
    expect(report.firstFailure).toBeUndefined();
    expect(new Set(report.verdict.findings.map((f) => f.problem))).toEqual(
      new Set(["fassung_unbekannt"]),
    );
  });

  it("Befehl: Ausgang 4", async () => {
    const kette = await ketteL2("roh");
    const out: string[] = [];
    const exit = await runCli(["kette.jsonl"], {
      readFile: async () => kette.text,
      out: (line) => out.push(line),
      err: (line) => out.push(line),
    });
    expect(exit).toBe(CLI_EXIT.nichtPruefbar);
  });
});
