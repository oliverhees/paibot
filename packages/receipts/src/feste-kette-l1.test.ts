/**
 * PaiBot – feste Beleg-Kette vom Stand mit Tor-Fassung 1 (`testdaten/kette-l1.jsonl`) bleibt
 * überall „vertrauenswürdig“: über den Export (`parseJsonl` + `verifyChain`) und über den Befehl
 * `belege:pruefen`. Jede Entscheidung wird nach Fassung 1 nachgerechnet, und jeder Beleg besteht
 * die Lese-Schemas der älteren Stände.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { readFileSync } from "node:fs";
import { STORED_ACTION_TYPES } from "@paibot/shared/aktionen";
import type { ReceiptBody } from "@paibot/shared/belege";
import { STANDARD_RULE_VERSIONS } from "@paibot/shared/tor";
import { describe, expect, it } from "vitest";
import { CLI_EXIT, runCli } from "./cli";
import { parseJsonl } from "./jsonl";
import { decisionFormat, reevaluate } from "./nachrechnen";
import { l1ReceiptEntryReadSchema } from "./testdaten/lese-schema-l1";
import { vorFassungReceiptEntrySchema } from "./testdaten/lese-schema-vor-fassung";
import { verifyChain } from "./verify";

/*
 * Herkunft der Datei: erzeugt mit `testdaten/kette-l1-erzeugen.ts` (Befehl und Stand im Kopf dort)
 * auf Stand 30826da, mit dem echten Tor und dem echten Beleg-Schreiber gegen eine Datenbank im
 * Speicher, exportiert wie in der App (`exportHeader` + `exportJsonl`). Die Datei wird nie neu
 * erzeugt oder angepasst.
 */
const TEXT = readFileSync(new URL("./testdaten/kette-l1.jsonl", import.meta.url), "utf8");
const SOURCE_L1 = readFileSync(new URL("./testdaten/lese-schema-l1.ts", import.meta.url), "utf8");
const RULES = STANDARD_RULE_VERSIONS.map((rule, index) => ({ ...rule, seq: index + 1 }));

type Decided = Extract<ReceiptBody, { type: "decision" }>;
type Resulted = Extract<ReceiptBody, { type: "result" }>;

function bodies(): ReceiptBody[] {
  return parseJsonl(TEXT).entries.map((entry) => entry.body);
}

describe("feste Kette vom Stand mit Tor-Fassung 1", () => {
  it("enthält Start, Schlüsselwechsel, jede gespeicherte Aktion und die Sonderfälle", () => {
    const all = bodies();
    expect(all).toHaveLength(70);
    expect(all[0]?.type).toBe("start");
    expect(all[1]?.type).toBe("key_change");
    const decisions = all.filter((b): b is Decided => b.type === "decision");
    const results = all.filter((b): b is Resulted => b.type === "result");
    expect(new Set(decisions.map((b) => b.action.type))).toEqual(new Set(STORED_ACTION_TYPES));
    const verletzt = new Set(
      decisions.flatMap((b) =>
        b.decision.limits.filter((l) => l.result === "verletzt").map((l) => l.name),
      ),
    );
    expect([...verletzt].sort()).toEqual(
      ["anbieter_region", "laenge", "not_aus", "schleuse_gefordert", "tagesbudget"].sort(),
    );
    const modellOk = results.filter(
      (b) => b.action.type === "modell.anfragen" && b.result.status === "ok",
    );
    expect(modellOk.map((b) => b.result.servedBy)).toEqual([
      { provider: "tensorix", model: "mistral-small-3.2" },
    ]);
    expect(results.filter((b) => b.result.status === "error").map((b) => b.result.code)).toEqual([
      "anbieter_nicht_erreichbar",
    ]);
    const werkzeug = results.filter((b) => b.action.type === "werkzeug.aufrufen");
    expect(werkzeug.map((b) => b.result)).toEqual([{ status: "denied", code: "regel_fehlt" }]);
    expect(
      decisions.filter((b) => b.action.type === "werkzeug.aufrufen").map((b) => b.decision.outcome),
    ).toEqual(["ask"]);
    const notaus = decisions.filter((b) => b.action.type === "notaus.umschalten");
    expect(notaus.map((b) => [b.facts.on, b.decision.outcome])).toEqual([
      [true, "allow"],
      [false, "allow"],
    ]);
    for (const body of decisions) {
      expect(Object.hasOwn(body.decision, "gateFormat"), String(body.seq)).toBe(false);
    }
  });

  it("Export: gelesen, jede Prüfung ok, Urteil vertrauenswürdig, keine Hinweise", async () => {
    const { header, entries } = parseJsonl(TEXT);
    const report = await verifyChain(entries, {
      publicKeys: header.publicKeys,
      rules: RULES,
      ...(header.anchor === undefined ? {} : { anchor: header.anchor }),
    });
    expect(header.anchor).toBeDefined();
    expect(report.firstFailure).toBeUndefined();
    expect(report.verdict).toStrictEqual({
      level: "vertrauenswuerdig",
      findings: [],
      anchor: "geprueft",
    });
    expect(report.ok).toBe(true);
    expect(report.checked).toBe(70);
  });

  it("jede Entscheidung wird nach Fassung 1 nachgerechnet", () => {
    const { entries } = parseJsonl(TEXT);
    let count = 0;
    for (const entry of entries) {
      if (entry.body.type !== "decision") continue;
      expect(decisionFormat(entry.body), String(entry.seq)).toStrictEqual({
        status: "passt",
        format: 1,
      });
      expect(reevaluate(entry, RULES).status, String(entry.seq)).toBe("ok");
      count++;
    }
    expect(count).toBe(34);
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

  it("jeder Beleg besteht das Lese-Schema vor der Fassung und die Kopie vom Stand mit Fassung 1", () => {
    const lines = TEXT.trim().split("\n").slice(1);
    expect(lines).toHaveLength(70);
    for (const line of lines) {
      const entry = JSON.parse(line) as unknown;
      expect(vorFassungReceiptEntrySchema.safeParse(entry).success, line.slice(0, 40)).toBe(true);
      expect(l1ReceiptEntryReadSchema.safeParse(entry).success, line.slice(0, 40)).toBe(true);
    }
  });

  it("die Kopie des Lese-Schemas ist in sich geschlossen", () => {
    const imports = [...SOURCE_L1.matchAll(/from\s+"([^"]+)"/g)].map((match) => match[1]);
    expect(imports.sort()).toEqual(["@paibot/shared/grundtypen", "@paibot/shared/ids", "zod"]);
    const grund = /import\s*\{([^}]*)\}\s*from\s*"@paibot\/shared\/grundtypen"/.exec(SOURCE_L1);
    expect(
      grund?.[1]
        ?.split(",")
        .map((name) => name.trim())
        .filter(Boolean)
        .sort(),
    ).toEqual(["publicKeySchema", "sha256DigestSchema", "signatureSchema"]);
  });
});
