/**
 * PaiBot – Test: Jeder Beleg, den dieser Stand schreibt, besteht das Lese-Schema vom Stand vor der
 * Tor-Fassung (`testdaten/altes-lese-schema.ts`). Wer auf eine ältere PaiBot-Fassung zurückgeht,
 * kann die Belege weiter lesen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { createGate, type Execute, ruleSnapshot } from "@paibot/gate";
import { ACTION_TYPES } from "@paibot/shared/aktionen";
import { RECEIPT_CHAIN_FORMAT, type ReceiptEntry } from "@paibot/shared/belege";
import { isPaiBotError } from "@paibot/shared/fehler";
import { ACTIVE_STANDARD_RULES, UNSTORED_STANDARD_RULE_VERSIONS } from "@paibot/shared/tor";
import { describe, expect, it } from "vitest";
import { sampleAction, sampleFacts } from "../../gate/src/testdaten";
import { exportJsonl, parseJsonl } from "./jsonl";
import { altReceiptEntrySchema } from "./testdaten/altes-lese-schema";
import { keyInfo, signedEntry, TEST_INSTALLATION, testKey } from "./testhilfen";
import { verifyChain } from "./verify";

/** Kette, wie das Tor sie mit diesem Stand schreibt: jede Aktion einmal durch `gate.run`. */
async function ketteVomTor(): Promise<{ entries: ReceiptEntry[]; text: string }> {
  const key = testKey();
  const next = testKey();
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
  entries.push(
    await signedEntry(
      {
        type: "key_change",
        facts: {
          newKeyId: next.keyId,
          publicKey: next.publicKey,
          previousKeyId: key.keyId,
          signedBy: "previous",
        },
      },
      entries.at(-1),
      key,
      time(),
    ),
  );
  const append = async (draft: Parameters<typeof signedEntry>[0]) => {
    const entry = await signedEntry(draft, entries.at(-1), next, time());
    entries.push(entry);
    return { receiptId: entry.id, seq: entry.seq };
  };
  const snapshot = await ruleSnapshot([
    ...ACTIVE_STANDARD_RULES,
    ...UNSTORED_STANDARD_RULE_VERSIONS,
  ]);
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
          ...(record.context === undefined ? {} : { context: record.context }),
        }),
      appendResult: (record) =>
        append({ type: "result", action: record.action, result: record.result }),
    },
  });
  const ok: Execute<never, string> = async () => ({
    value: "fertig",
    result: {
      status: "ok",
      digest: `hmac-sha256:${"3c".repeat(32)}`,
      tokens: { input: 12, output: 34 },
      servedBy: { provider: "tensorix", model: "mistral-small-3.2" },
    },
  });
  for (const type of ACTION_TYPES) {
    try {
      await gate.run(sampleAction(type) as never, sampleFacts(type) as never, ok, {
        context: { digest: `hmac-sha256:${"7e".repeat(32)}` },
      });
    } catch (error) {
      // Abgelehnt (z. B. `werkzeug.aufrufen` fragt nach): Entscheidung und Ergebnis stehen trotzdem.
      if (!isPaiBotError(error)) throw error;
    }
  }
  // Eine Ablehnung durch eine Grenze.
  await gate
    .run(
      sampleAction("modell.anfragen") as never,
      { ...sampleFacts("modell.anfragen"), region: "non_eu" } as never,
      ok,
    )
    .catch(() => undefined);

  let text = "";
  for await (const line of exportJsonl(
    {
      format: "pb-belege",
      v: 1,
      installationId: TEST_INSTALLATION,
      publicKeys: [keyInfo(key), keyInfo(next)],
    },
    entries,
  )) {
    text += line;
  }
  return { entries, text };
}

describe("Belege dieses Stands mit dem Lese-Schema von vorher", () => {
  it("jeder Beleg der Kette besteht das alte Lese-Schema", async () => {
    const { entries } = await ketteVomTor();
    const decisions = entries.filter((e) => e.body.type === "decision");
    expect(decisions.length).toBeGreaterThan(ACTION_TYPES.length);
    for (const entry of entries) {
      const parsed = altReceiptEntrySchema.safeParse(entry);
      expect(parsed.success, `${entry.seq} ${entry.body.type}`).toBe(true);
    }
  });

  it("auch nach dem Weg über den Export (JSON-Zeilen), und die Kette ist vertrauenswürdig", async () => {
    const { text } = await ketteVomTor();
    const lines = text.trim().split("\n").slice(1);
    for (const line of lines) {
      expect(altReceiptEntrySchema.safeParse(JSON.parse(line)).success).toBe(true);
    }
    const { entries } = parseJsonl(text);
    const report = await verifyChain(entries);
    expect(report.verdict).toEqual({ level: "vertrauenswuerdig", findings: [], anchor: "fehlt" });
  });

  it("keine Entscheidung trägt eine Fassungsangabe", async () => {
    const { entries } = await ketteVomTor();
    for (const entry of entries) {
      if (entry.body.type !== "decision") continue;
      expect(Object.hasOwn(entry.body.decision, "gateFormat")).toBe(false);
    }
  });
});
