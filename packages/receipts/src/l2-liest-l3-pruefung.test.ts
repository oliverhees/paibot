/**
 * PaiBot – Test: Die Prüfung eines Stands, der nur die Tor-Fassungen 1 und 2 kennt, urteilt über
 * Belege der Fassung 3 „mit dieser Fassung nicht prüfbar“, nie „kein Beleg“, nie „ungültig“ und nie
 * „vertrauenswürdig“. Das Tor-Paket ist dafür auf die Fassungen 1 und 2 beschränkt; die Belege
 * schreibt der Test vorher mit dem echten Tor (siehe `testdaten/kette-gemischt.ts`).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { describe, expect, it, vi } from "vitest";
import { CLI_EXIT, runCli } from "./cli";
import { parseJsonl } from "./jsonl";
import { ketteGemischt } from "./testdaten/kette-gemischt";
import { ketteL2 } from "./testdaten/kette-l2";
import { verifyChain } from "./verify";

/**
 * Wie weit der Stand „reicht“, den der Test nachstellt. Beim Schreiben der Belege (Fassung 3, mit
 * dem echten Tor) steht die Grenze bei 3, danach bei 2: So prüft derselbe Programmstand, als ob er
 * Fassung 3 nicht kennte.
 */
const stand = vi.hoisted(() => ({ hoechste: 3 }));

vi.mock("@paibot/gate", async (importOriginal) => {
  const original = await importOriginal<typeof import("@paibot/gate")>();
  const bekannt = (format: number): format is 1 | 2 | 3 =>
    (format === 1 || format === 2 || format === 3) && format <= stand.hoechste;
  return {
    ...original,
    get KNOWN_GATE_FORMAT() {
      return stand.hoechste;
    },
    gateFormatSpec: (format: number) =>
      bekannt(format) ? original.GATE_FORMATS[format] : undefined,
  };
});

/** Kette mit Fassung 3 schreiben (Grenze 3) und danach auf den Stand „nur Fassung 1 und 2“ stellen. */
async function ketteAufStandZwei() {
  stand.hoechste = 3;
  const kette = await ketteGemischt();
  const text = await kette.text();
  stand.hoechste = 2;
  return { kette, text };
}

describe("Prüfung, die nur die Fassungen 1 und 2 kennt", () => {
  it("Belege der Fassungen 1 und 2 allein bleiben vertrauenswürdig (die Beschränkung greift nicht zu weit)", async () => {
    stand.hoechste = 2;
    const kette = await ketteL2("roh");
    const report = await verifyChain(parseJsonl(kette.text).entries, { rules: kette.rules });
    expect(report.verdict).toStrictEqual({
      level: "vertrauenswuerdig",
      findings: [],
      anchor: "fehlt",
    });
  });

  it("Kette aus den Fassungen 1, 2 und 3: gelesen, Urteil nicht prüfbar, kein Fehler", async () => {
    const { kette, text } = await ketteAufStandZwei();
    const { entries } = parseJsonl(text);
    expect(entries.length).toBe(kette.entries.length);
    const report = await verifyChain(entries, {
      rules: (kette.snapshot as { rules: never }).rules,
    });
    expect(report.verdict.level).toBe("nicht_pruefbar");
    expect(report.ok).toBe(false);
    expect(report.firstFailure).toBeUndefined();
    // Genau die beiden Entscheidungen der Fassung 3 sind nicht prüfbar, sonst nichts.
    const nummern = kette.entries
      .filter(
        (entry) =>
          entry.body.type === "decision" &&
          (entry.body.decision as { gateFormat?: number }).gateFormat === 3,
      )
      .map((entry) => entry.seq);
    expect(nummern).toHaveLength(2);
    expect(report.verdict.findings).toEqual(
      nummern.map((seq) => ({ problem: "fassung_unbekannt", seq })),
    );
  });

  it("Befehl: Ausgang 4", async () => {
    const { text } = await ketteAufStandZwei();
    const out: string[] = [];
    const exit = await runCli(["kette.jsonl"], {
      readFile: async () => text,
      out: (line) => out.push(line),
      err: (line) => out.push(line),
    });
    expect(exit).toBe(CLI_EXIT.nichtPruefbar);
  });
});
