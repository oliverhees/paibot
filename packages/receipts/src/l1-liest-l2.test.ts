/**
 * PaiBot – Test: Ein Stand mit Tor-Fassung 1 liest Belege der Fassung 2. Jeder Beleg einer Kette
 * dieses Stands besteht die geschlossene Kopie des Lese-Schemas von damals
 * (`testdaten/lese-schema-l1.ts`); Fassung 2 bringt keinen neuen Belegtyp, keine neue Fassung des
 * Belegs und keine neuen Felder in Start oder Kopfzeile, nur flache Fakten.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { describe, expect, it } from "vitest";
import { parseJsonl } from "./jsonl";
import { ketteL2 } from "./testdaten/kette-l2";
import { l1ReceiptEntryReadSchema } from "./testdaten/lese-schema-l1";
import { verifyChain } from "./verify";

describe("Stand mit Fassung 1 liest Belege der Fassung 2", () => {
  it("jeder Beleg der Kette (durch das echte Tor) besteht das Lese-Schema von damals", async () => {
    const kette = await ketteL2("tor");
    const lines = kette.text.trim().split("\n").slice(1);
    expect(lines.length).toBeGreaterThan(50);
    for (const line of lines) {
      expect(l1ReceiptEntryReadSchema.safeParse(JSON.parse(line)).success, line.slice(0, 60)).toBe(
        true,
      );
    }
    const report = await verifyChain(parseJsonl(kette.text).entries, { rules: kette.rules });
    expect(report.verdict).toStrictEqual({
      level: "vertrauenswuerdig",
      findings: [],
      anchor: "fehlt",
    });
  });

  it("die Kette enthält, was Fassung 2 neu bringt: Deckel gedeckelt und neue Ergebnis-Felder", async () => {
    const { entries } = await ketteL2("tor");
    const bodies = entries.map((entry) => entry.body as unknown as Record<string, unknown>);
    const decisions = bodies.filter((b) => b.type === "decision");
    expect(
      decisions.some((b) =>
        JSON.stringify((b.decision as Record<string, unknown>).caps ?? []).includes("gedeckelt"),
      ),
    ).toBe(true);
    const results = bodies
      .filter((b) => b.type === "result")
      .map((b) => b.result as Record<string, unknown>);
    expect(results.some((r) => r.modelReported === "mistral-small-3.2-2506")).toBe(true);
    expect(results.some((r) => r.docStand === "0.3.0" && r.found === 3)).toBe(true);
  });

  it("nur flache Fakten, kein neuer Belegtyp, Beleg-Fassung 1, Start wie bisher", async () => {
    const { entries, text } = await ketteL2("tor");
    for (const entry of entries) {
      const body = entry.body as unknown as Record<string, unknown>;
      expect(["start", "decision", "result", "key_change"]).toContain(body.type);
      expect(body.v).toBe(1);
      if (body.type === "start") {
        expect(Object.keys(body.facts as object).sort()).toEqual([
          "format",
          "installationId",
          "publicKey",
          "software",
        ]);
      }
      if (body.type !== "decision") continue;
      for (const [name, value] of Object.entries(body.facts as Record<string, unknown>)) {
        const flach =
          typeof value === "boolean" ||
          (typeof value === "number" && Number.isSafeInteger(value)) ||
          (typeof value === "string" && value.length <= 200) ||
          (Array.isArray(value) && value.every((item) => typeof item !== "object"));
        expect(flach, name).toBe(true);
      }
    }
    const header = JSON.parse(text.split("\n")[0] as string) as Record<string, unknown>;
    expect(Object.keys(header).sort()).toEqual(["format", "installationId", "publicKeys", "v"]);
  });
});
