/**
 * PaiBot – Test: Belege der Tor-Fassungen 1, 2 und 3 in einer Kette sind gültig, neue Entscheidungen
 * hängen an, und der Stand mit Fassung 2 liest die Belege der Fassung 3 (geschlossene Kopie seines
 * Lese-Schemas `testdaten/lese-schema-l2.ts`).
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { readFileSync } from "node:fs";
import type { ReceiptEntry } from "@paibot/shared/belege";
import { describe, expect, it } from "vitest";
import { CLI_EXIT, runCli } from "./cli";
import { parseJsonl } from "./jsonl";
import { decisionFormat, reevaluate } from "./nachrechnen";
import { type GemischteKette, ketteGemischt } from "./testdaten/kette-gemischt";
import { l2ReceiptEntryReadSchema } from "./testdaten/lese-schema-l2";
import { verifyChain } from "./verify";

/** `decision.gateFormat` jeder Entscheidung der Kette in Reihenfolge; `fehlt` heißt Fassung 1. */
function fassungen(entries: readonly ReceiptEntry[]): (number | "fehlt")[] {
  return entries.flatMap((entry) =>
    entry.body.type === "decision"
      ? [(entry.body.decision as { gateFormat?: number }).gateFormat ?? "fehlt"]
      : [],
  );
}

async function pruefe(kette: GemischteKette) {
  return verifyChain(kette.entries, { rules: kette.regeln });
}

describe("Belege der Fassungen 1, 2 und 3 in einer Kette", () => {
  it("Fassung 1, 2 und 3 stehen in der Reihenfolge ihres Inkrafttretens in der Kette", async () => {
    const kette = await ketteGemischt();
    expect(fassungen(kette.entries)).toEqual(["fehlt", 2, 3, 3]);
    const typen = kette.entries
      .filter((entry) => entry.body.type === "decision")
      .map((entry) => (entry.body as { action: { type: string } }).action.type);
    expect(typen).toEqual([
      "nachricht.senden",
      "nachricht.senden",
      "nachricht.senden",
      "app.verbinden",
    ]);
  });

  it("die Kette ist vertrauenswürdig, jede Entscheidung wird nach ihrer eigenen Fassung nachgerechnet", async () => {
    const kette = await ketteGemischt();
    const report = await pruefe(kette);
    expect(report.firstFailure).toBeUndefined();
    expect(report.verdict).toStrictEqual({
      level: "vertrauenswuerdig",
      findings: [],
      anchor: "fehlt",
    });
    const formate: unknown[] = [];
    for (const entry of kette.entries) {
      if (entry.body.type !== "decision") continue;
      const fit = decisionFormat(entry.body);
      expect(fit.status, String(entry.seq)).toBe("passt");
      formate.push((fit as { format: number }).format);
      const neu = reevaluate(entry, kette.regeln);
      expect(neu.status, String(entry.seq)).toBe("ok");
    }
    expect(formate).toEqual([1, 2, 3, 3]);
  });

  it("neue Entscheidungen hängen an die gemischte Kette an, sie bleibt vertrauenswürdig", async () => {
    const kette = await ketteGemischt();
    const vorher = kette.entries.length;
    await kette.tor("nachricht.senden");
    await kette.tor("app.trennen");
    expect(kette.entries.length).toBeGreaterThan(vorher + 2);
    expect(fassungen(kette.entries)).toEqual(["fehlt", 2, 3, 3, 3, 3]);
    const report = await pruefe(kette);
    expect(report.firstFailure).toBeUndefined();
    expect(report.verdict.level).toBe("vertrauenswuerdig");
    expect(report.verdict.findings).toEqual([]);
  });

  it("auch nach dem Weg über den Export und über den Befehl belege:pruefen", async () => {
    const kette = await ketteGemischt();
    const text = await kette.text();
    const { entries } = parseJsonl(text);
    expect(entries).toHaveLength(kette.entries.length);
    const report = await verifyChain(entries, {
      rules: kette.regeln,
    });
    expect(report.verdict.level).toBe("vertrauenswuerdig");
    const out: string[] = [];
    const exit = await runCli(["kette.jsonl"], {
      readFile: async () => text,
      out: (line) => out.push(line),
      err: (line) => out.push(line),
    });
    expect(exit).toBe(CLI_EXIT.gueltig);
  });
});

describe("Stand mit Fassung 2 liest Belege der Fassung 3", () => {
  it("jeder Beleg der gemischten Kette besteht das Lese-Schema von damals, auch die Aktion für Apps", async () => {
    const kette = await ketteGemischt();
    const apps = kette.entries.filter(
      (entry) => entry.body.type === "decision" && entry.body.action.type === "app.verbinden",
    );
    expect(apps).toHaveLength(1);
    for (const entry of kette.entries) {
      expect(l2ReceiptEntryReadSchema.safeParse(entry).success, String(entry.seq)).toBe(true);
    }
  });

  it("die Kopie des Lese-Schemas ist in sich geschlossen", () => {
    const quelle = readFileSync(new URL("./testdaten/lese-schema-l2.ts", import.meta.url), "utf8");
    const imports = [...quelle.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]);
    expect(imports.sort()).toEqual(["@paibot/shared/grundtypen", "@paibot/shared/ids", "zod"]);
  });
});
