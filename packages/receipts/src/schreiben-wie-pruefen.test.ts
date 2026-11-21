/**
 * PaiBot – Test: Der Schreiber legt nur Belege an, die der eigene Prüfer mit der aktuellen Fassung
 * des Tors annimmt. Hier ist ein geteiltes Schema gegenüber der eingefrorenen Fassung erweitert
 * (Region `ch`), ohne dass die Fassung gehoben wurde.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { createGate, type Execute, ruleSnapshot } from "@paibot/gate";
import { RECEIPT_CHAIN_FORMAT, type ReceiptEntry } from "@paibot/shared/belege";
import { isPaiBotError } from "@paibot/shared/fehler";
import { newId } from "@paibot/shared/ids";
import { ACTIVE_STANDARD_RULES } from "@paibot/shared/tor";
import { describe, expect, it, vi } from "vitest";
import { sampleAction, sampleFacts } from "../../gate/src/testdaten";
import { buildReceipt } from "./build";
import { signedEntry, TEST_INSTALLATION, testKey } from "./testhilfen";
import { verifyChain } from "./verify";

// Ein geteiltes Schema ändert sich, die Fassung des Tors nicht: Region `ch` ist danach überall
// in den lebenden Verträgen erlaubt, in der eingefrorenen Fassung 1 nicht.
vi.mock("@paibot/shared/objekte", async (importOriginal) => {
  const original = await importOriginal<typeof import("@paibot/shared/objekte")>();
  const { z } = await import("zod");
  return { ...original, regionSchema: z.enum([...original.REGIONS, "ch"]) };
});

// Ebenso für Ergebnisse: Die Herkunft der Antwort erlaubt lebend auch Großbuchstaben.
vi.mock("@paibot/shared/grundtypen", async (importOriginal) => {
  const original = await importOriginal<typeof import("@paibot/shared/grundtypen")>();
  const { z } = await import("zod");
  return {
    ...original,
    servedBySchema: z.strictObject({
      provider: z
        .string()
        .regex(/^[A-Za-z0-9._-]{1,64}$/)
        .optional(),
      model: z.string().optional(),
    }),
  };
});

describe("Schreiben wie Prüfen", () => {
  it("die lebenden Verträge nehmen Region ch an (die Probe greift)", async () => {
    const { factsSchema } = await import("@paibot/shared/aktionen");
    const facts = { ...sampleFacts("modell.anfragen"), region: "ch" };
    expect(factsSchema("modell.anfragen").safeParse(facts).success).toBe(true);
  });

  it("buildReceipt schreibt keinen Beleg, den die aktuelle Fassung verwirft", () => {
    const action = sampleAction("modell.anfragen");
    const facts = { ...sampleFacts("modell.anfragen"), region: "ch" };
    let caught: unknown;
    try {
      buildReceipt(
        {
          type: "decision",
          action,
          decision: {
            outcome: "deny",
            stage: "ask",
            matchedRules: [],
            limits: [],
            preconditions: [],
            ruleStand: 1,
            reason: "Abgelehnt.",
            gateFormat: 1,
          },
          facts,
        },
        {
          id: newId("receipt"),
          seq: 2,
          time: "2026-11-21T10:00:00.000Z",
          prev: `sha256:${"ab".repeat(32)}`,
          keyId: newId("key"),
        },
      );
    } catch (error) {
      caught = error;
    }
    expect(isPaiBotError(caught) && caught.code).toBe("eingabe_ungueltig");
  });

  it("auch ein Ergebnis, das nicht zur aktuellen Fassung passt, wird nicht geschrieben", () => {
    const action = sampleAction("modell.anfragen");
    const link = {
      id: newId("receipt"),
      seq: 3,
      time: "2026-11-21T10:00:00.000Z",
      prev: `sha256:${"ab".repeat(32)}`,
      keyId: newId("key"),
    };
    const result = (provider: string) => () =>
      buildReceipt(
        { type: "result", action, result: { status: "ok", servedBy: { provider } } },
        link,
      );
    expect(result("tensorix")).not.toThrow();
    let caught: unknown;
    try {
      result("Tensorix")();
    } catch (error) {
      caught = error;
    }
    expect(isPaiBotError(caught) && caught.code).toBe("eingabe_ungueltig");
  });

  it("das Tor führt nichts aus, und die Kette bleibt vertrauenswürdig", async () => {
    const key = testKey();
    const entries: ReceiptEntry[] = [];
    let tick = 0;
    const time = () => new Date(Date.UTC(2026, 10, 21, 10, 0, 0, ++tick));
    entries.push(
      await signedEntry(
        {
          type: "start",
          facts: {
            installationId: TEST_INSTALLATION,
            publicKey: key.publicKey,
            software: "0.3.0+dev",
            format: RECEIPT_CHAIN_FORMAT,
          },
        },
        undefined,
        key,
        time(),
      ),
    );
    const append = async (draft: Parameters<typeof signedEntry>[0]) => {
      const entry = await signedEntry(draft, entries.at(-1), key, time());
      entries.push(entry);
      return { receiptId: entry.id, seq: entry.seq };
    };
    const snapshot = await ruleSnapshot(ACTIVE_STANDARD_RULES);
    const gate = createGate({
      rules: { load: async () => snapshot },
      clock: { now: time },
      receipts: {
        appendDecision: (record) =>
          append({
            type: "decision",
            action: record.action,
            decision: record.decision,
            facts: record.facts as Record<string, unknown>,
          }),
        appendResult: (record) =>
          append({ type: "result", action: record.action, result: record.result }),
      },
    });
    const execute = vi.fn<Execute<never, string>>(async () => ({
      value: "fertig",
      result: { status: "ok" },
    }));
    const facts = { ...sampleFacts("modell.anfragen"), region: "ch" };
    const error = await gate
      .run(sampleAction("modell.anfragen") as never, facts as never, execute as never)
      .then(
        () => undefined,
        (e: unknown) => e,
      );
    expect(isPaiBotError(error)).toBe(true);
    expect(execute).not.toHaveBeenCalled();
    expect(entries.map((e) => e.body.type)).toEqual(["start"]);
    const report = await verifyChain(entries);
    expect(report.verdict).toEqual({ level: "vertrauenswuerdig", findings: [], anchor: "fehlt" });
  });
});
