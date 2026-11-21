/**
 * PaiBot – feste Beleg-Kette aus der Zeit vor der Tor-Fassung (`testdaten/kette-vor-fassung.jsonl`)
 * bleibt überall „in Ordnung“: über den Export (`parseJsonl` + `verifyChain`) und über den Befehl
 * `belege:pruefen`.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { readFileSync } from "node:fs";
import { STANDARD_RULE_VERSIONS } from "@paibot/shared/tor";
import { describe, expect, it } from "vitest";
import { CLI_EXIT, runCli } from "./cli";
import { parseJsonl } from "./jsonl";
import { verifyChain } from "./verify";

/*
 * Herkunft der Datei: erzeugt mit dem Code von `main` auf Stand 39d882b, bevor es `GATE_FORMAT`
 * gab, mit einem vorübergehenden Vitest-Lauf im Paket `@paibot/receipts`: Test-Schlüssel A und B
 * aus `testKey()`, Belege mit `signedEntry()`, Entscheidungen mit `evaluate()` und dem Regelstand
 * aus `ACTIVE_STANDARD_RULES` (Prüfsummen mit `hashRule`, Stand 7), Export mit `exportJsonl()`.
 * Inhalt: Start (Kettenfassung 2), Schlüsselwechsel von A nach B, `nachricht.senden` erlaubt,
 * `modell.anfragen` erlaubt (Ergebnis mit `servedBy`), `modell.anfragen` abgelehnt (G-02),
 * `notaus.umschalten` erlaubt. Die privaten Schlüssel wurden nicht gespeichert. Die Datei wird nie
 * neu erzeugt oder angepasst. Befehl damals: `pnpm --filter @paibot/receipts exec vitest run
 * src/erzeugen.tmp.test.ts` (die vorübergehende Datei ist nicht im Repo).
 */
const TEXT = readFileSync(new URL("./testdaten/kette-vor-fassung.jsonl", import.meta.url), "utf8");
const RULES = STANDARD_RULE_VERSIONS.map((rule, index) => ({ ...rule, seq: index + 1 }));

describe("feste Kette vom Stand vor der Tor-Fassung", () => {
  it("Export: gelesen, jede Prüfung ok, Urteil vertrauenswürdig", async () => {
    const { header, entries } = parseJsonl(TEXT);
    expect(entries).toHaveLength(10);
    const report = await verifyChain(entries, {
      publicKeys: header.publicKeys,
      rules: RULES,
      ...(header.anchor === undefined ? {} : { anchor: header.anchor }),
    });
    expect(report.firstFailure).toBeUndefined();
    expect(report.verdict).toEqual({
      level: "vertrauenswuerdig",
      findings: [],
      anchor: "geprueft",
    });
    expect(report.ok).toBe(true);
  });

  it("jede Entscheidung lässt sich nachrechnen", async () => {
    const { entries } = parseJsonl(TEXT);
    const checks: string[] = [];
    for (let index = 0; index < entries.length; index++) {
      const report = await verifyChain(entries.slice(0, index + 1), { rules: RULES });
      expect(report.firstFailure).toBeUndefined();
      checks.push(report.verdict.level);
    }
    expect(new Set(checks)).toEqual(new Set(["vertrauenswuerdig"]));
  });

  it("Befehl belege:pruefen: Ausgang 0", async () => {
    const out: string[] = [];
    const err: string[] = [];
    const exit = await runCli(["kette.jsonl"], {
      readFile: async () => TEXT,
      out: (line) => out.push(line),
      err: (line) => err.push(line),
    });
    expect(err).toEqual([]);
    expect(exit).toBe(CLI_EXIT.gueltig);
  });
});
