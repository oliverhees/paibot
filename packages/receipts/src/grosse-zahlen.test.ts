/**
 * PaiBot – Test: Sehr große Zählerstände bei den Grenzen eines Laufs. Liegt die Summe von G-18
 * außerhalb der sicher darstellbaren Ganzzahlen, ist die Grenze verletzt; das Tor lehnt mit
 * `limit_erreicht` ab, schreibt einen sauberen Beleg und die Kette bleibt vertrauenswürdig.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { createGate, type Execute, isGateDenied, ruleSnapshot } from "@paibot/gate";
import { RECEIPT_CHAIN_FORMAT, type ReceiptEntry } from "@paibot/shared/belege";
import { ACTIVE_STANDARD_RULES } from "@paibot/shared/tor";
import { describe, expect, it, vi } from "vitest";
import { sampleAction, sampleFacts } from "../../gate/src/testdaten";
import { signedEntry, TEST_INSTALLATION, testKey } from "./testhilfen";
import { verifyChain } from "./verify";

const MAX = Number.MAX_SAFE_INTEGER;

async function laufe(change: Record<string, unknown>) {
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
  const facts = { ...sampleFacts("modell.anfragen"), ...change };
  const outcome = await gate
    .run(sampleAction("modell.anfragen") as never, facts as never, execute as never)
    .then(
      () => undefined,
      (e: unknown) => e,
    );
  return { entries, execute, outcome };
}

describe("Große Zahlen bei den Grenzen eines Laufs", () => {
  it("Summe über der sicheren Grenze: abgelehnt mit limit_erreicht, Beleg sauber", async () => {
    const { entries, execute, outcome } = await laufe({
      runTokens: MAX - 10,
      stepTokenEstimate: 1227,
      maxRunTokens: MAX,
    });
    expect(isGateDenied(outcome)).toBe(true);
    expect(execute).not.toHaveBeenCalled();
    expect(entries.map((e) => e.body.type)).toEqual(["start", "decision", "result"]);
    const decision = entries[1]?.body;
    expect(decision?.type === "decision" && decision.decision.limits).toContainEqual({
      name: "lauf_token",
      result: "verletzt",
    });
    const result = entries[2]?.body;
    expect(result?.type === "result" && result.result).toEqual({
      status: "denied",
      code: "limit_erreicht",
    });
    const report = await verifyChain(entries);
    expect(report.verdict).toEqual({ level: "vertrauenswuerdig", findings: [], anchor: "fehlt" });
  });

  it("beide Summanden am Rand: ebenfalls verletzt und sauber belegt", async () => {
    const { entries, outcome } = await laufe({
      runTokens: MAX,
      stepTokenEstimate: MAX,
      maxRunTokens: MAX,
    });
    expect(isGateDenied(outcome)).toBe(true);
    expect(entries.map((e) => e.body.type)).toEqual(["start", "decision", "result"]);
    const report = await verifyChain(entries);
    expect(report.verdict.level).toBe("vertrauenswuerdig");
  });

  it("Summe genau auf der sicheren Grenze bleibt erlaubt und wird mit Wert belegt", async () => {
    const { entries, execute, outcome } = await laufe({
      runTokens: MAX - 1227,
      stepTokenEstimate: 1227,
      maxRunTokens: MAX,
    });
    expect(outcome).toBeUndefined();
    expect(execute).toHaveBeenCalledOnce();
    const decision = entries[1]?.body;
    expect(decision?.type === "decision" && decision.decision.limits).toContainEqual({
      name: "lauf_token",
      result: "ok",
      value: MAX,
    });
    const report = await verifyChain(entries);
    expect(report.verdict.level).toBe("vertrauenswuerdig");
  });

  it("G-16 und G-17 schreiben nur Zählerstände, die schon sicher sind", async () => {
    const { entries, outcome } = await laufe({ step: MAX, maxSteps: MAX });
    expect(isGateDenied(outcome)).toBe(true);
    const decision = entries[1]?.body;
    expect(decision?.type === "decision" && decision.decision.limits).toContainEqual({
      name: "lauf_schritte",
      result: "verletzt",
      value: MAX,
    });
    expect((await verifyChain(entries)).verdict.level).toBe("vertrauenswuerdig");
  });
});
