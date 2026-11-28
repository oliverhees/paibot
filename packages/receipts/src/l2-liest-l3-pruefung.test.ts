/**
 * PaiBot – Test: Die Prüfung eines älteren Stands urteilt über Belege einer Tor-Fassung, die er
 * nicht kennt, „mit dieser Fassung nicht prüfbar“, nie „kein Beleg“, nie „ungültig“ und nie
 * „vertrauenswürdig“. Zwei Fälle: Ein Stand, der nur die Fassungen 1 und 2 kennt, und ein Stand
 * mit Fassung 3 (der noch nichts von Fassung 4 weiß). Das Tor-Paket ist dafür beschränkt; die
 * Belege schreibt der Test vorher mit dem echten Tor (siehe `testdaten/kette-gemischt.ts`).
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
import { type GemischteKette, ketteGemischt } from "./testdaten/kette-gemischt";
import { ketteL2 } from "./testdaten/kette-l2";
import { verifyChain } from "./verify";

/**
 * Wie weit der Stand „reicht“, den der Test nachstellt. Beim Schreiben der Belege (Fassung 5, mit
 * dem echten Tor) steht die Grenze bei 5, danach bei der Fassung des nachgestellten Standes: So
 * prüft derselbe Programmstand, als ob er die späteren Fassungen nicht kennte.
 */
const stand = vi.hoisted(() => ({ hoechste: 5 }));

vi.mock("@paibot/gate", async (importOriginal) => {
  const original = await importOriginal<typeof import("@paibot/gate")>();
  const bekannt = (format: number): format is 1 | 2 | 3 | 4 | 5 =>
    Number.isInteger(format) && format >= 1 && format <= 5 && format <= stand.hoechste;
  return {
    ...original,
    get KNOWN_GATE_FORMAT() {
      return stand.hoechste;
    },
    gateFormatSpec: (format: number) =>
      bekannt(format) ? original.GATE_FORMATS[format] : undefined,
  };
});

/** Kette mit den Fassungen 1 bis 5 schreiben (Grenze 5) und danach auf den Stand `hoechste` stellen. */
async function ketteAufStand(hoechste: 2 | 3 | 4) {
  stand.hoechste = 5;
  const kette = await ketteGemischt();
  const text = await kette.text();
  stand.hoechste = hoechste;
  return { kette, text };
}

/** Nummern der Entscheidungen, deren Fassung ab `ab` liegt. */
function nummernAb(kette: GemischteKette, ab: number): number[] {
  return kette.entries
    .filter(
      (entry) =>
        entry.body.type === "decision" &&
        ((entry.body.decision as { gateFormat?: number }).gateFormat ?? 1) >= ab,
    )
    .map((entry) => entry.seq);
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

  it("Kette aus den Fassungen 1 bis 5: gelesen, Urteil nicht prüfbar, kein Fehler", async () => {
    const { kette, text } = await ketteAufStand(2);
    const { entries } = parseJsonl(text);
    expect(entries.length).toBe(kette.entries.length);
    const report = await verifyChain(entries, { rules: kette.regeln });
    expect(report.verdict.level).toBe("nicht_pruefbar");
    expect(report.ok).toBe(false);
    expect(report.firstFailure).toBeUndefined();
    // Genau die Entscheidungen der Fassungen 3 bis 5 sind nicht prüfbar, sonst nichts.
    const nummern = nummernAb(kette, 3);
    expect(nummern).toHaveLength(6);
    expect(report.verdict.findings).toEqual(
      nummern.map((seq) => ({ problem: "fassung_unbekannt", seq })),
    );
  });

  it("Befehl: Ausgang 4", async () => {
    const { text } = await ketteAufStand(2);
    const out: string[] = [];
    const exit = await runCli(["kette.jsonl"], {
      readFile: async () => text,
      out: (line) => out.push(line),
      err: (line) => out.push(line),
    });
    expect(exit).toBe(CLI_EXIT.nichtPruefbar);
  });
});

describe("Prüfung mit Fassung 3 (kennt Fassung 4 nicht)", () => {
  // Gegenprobe: `fassung_unbekannt` für eine unbekannte Fassung durch „ungültig“ ersetzen → rot.
  it("Belege der Fassungen 4 und 5 sind nicht prüfbar, nie ungültig; Fassung 1 bis 3 bleiben gültig", async () => {
    const { kette, text } = await ketteAufStand(3);
    const { entries } = parseJsonl(text);
    const report = await verifyChain(entries, { rules: kette.regeln });
    expect(report.verdict.level).toBe("nicht_pruefbar");
    expect(report.ok).toBe(false);
    expect(report.firstFailure).toBeUndefined();
    const nummern = nummernAb(kette, 4);
    expect(nummern).toHaveLength(4);
    expect(report.verdict.findings).toEqual(
      nummern.map((seq) => ({ problem: "fassung_unbekannt", seq })),
    );
  });

  it("eine Kette, die bei Fassung 3 endet, ist für diesen Stand vertrauenswürdig", async () => {
    stand.hoechste = 5;
    const kette = await ketteGemischt(3);
    const text = await kette.text();
    stand.hoechste = 3;
    const report = await verifyChain(parseJsonl(text).entries, { rules: kette.regeln });
    expect(report.firstFailure).toBeUndefined();
    expect(report.verdict).toStrictEqual({
      level: "vertrauenswuerdig",
      findings: [],
      anchor: "fehlt",
    });
  });

  it("Befehl: Ausgang 4", async () => {
    const { text } = await ketteAufStand(3);
    const out: string[] = [];
    const exit = await runCli(["kette.jsonl"], {
      readFile: async () => text,
      out: (line) => out.push(line),
      err: (line) => out.push(line),
    });
    expect(exit).toBe(CLI_EXIT.nichtPruefbar);
  });
});

describe("Prüfung mit Fassung 4 (kennt Fassung 5 nicht)", () => {
  // Gegenprobe: `fassung_unbekannt` für eine unbekannte Fassung durch „ungültig“ ersetzen → rot.
  it("Belege der Fassung 5 sind nicht prüfbar, nie ungültig; Fassung 1 bis 4 bleiben gültig", async () => {
    const { kette, text } = await ketteAufStand(4);
    const { entries } = parseJsonl(text);
    const report = await verifyChain(entries, { rules: kette.regeln });
    expect(report.verdict.level).toBe("nicht_pruefbar");
    expect(report.ok).toBe(false);
    expect(report.firstFailure).toBeUndefined();
    const nummern = nummernAb(kette, 5);
    expect(nummern).toHaveLength(2);
    expect(report.verdict.findings).toEqual(
      nummern.map((seq) => ({ problem: "fassung_unbekannt", seq })),
    );
  });

  it("eine Kette, die bei Fassung 4 endet, ist für diesen Stand vertrauenswürdig", async () => {
    stand.hoechste = 5;
    const kette = await ketteGemischt(4);
    const text = await kette.text();
    stand.hoechste = 4;
    const report = await verifyChain(parseJsonl(text).entries, { rules: kette.regeln });
    expect(report.firstFailure).toBeUndefined();
    expect(report.verdict).toStrictEqual({
      level: "vertrauenswuerdig",
      findings: [],
      anchor: "fehlt",
    });
  });
});
