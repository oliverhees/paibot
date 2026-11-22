/**
 * PaiBot – Test: Belege vom Stand mit Tor-Fassung 1 (die feste Kette `testdaten/kette-l1.jsonl`)
 * bestehen das Lese-Schema vom Stand vor der Tor-Fassung (geschlossene Kopie
 * `testdaten/lese-schema-vor-fassung.ts`). Belege, die dieser Stand schreibt (Fassung 2), besteht
 * es nicht mehr: Ein Stand vor der Tor-Fassung erkennt sie nicht als Beleg. Dazu: Die ältere
 * Kopie `testdaten/altes-lese-schema.ts` nimmt lebende Verträge und ist deshalb kein Maßstab.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { readFileSync } from "node:fs";
import { createGate, type Execute, ruleSnapshot } from "@paibot/gate";
import { ACTION_TYPES } from "@paibot/shared/aktionen";
import { RECEIPT_CHAIN_FORMAT, type ReceiptEntry } from "@paibot/shared/belege";
import { isPaiBotError } from "@paibot/shared/fehler";
import { ACTIVE_STANDARD_RULES, UNSTORED_STANDARD_RULE_VERSIONS } from "@paibot/shared/tor";
import { describe, expect, it } from "vitest";
import { sampleAction, sampleFacts } from "../../gate/src/testdaten";
import { exportJsonl, parseJsonl } from "./jsonl";
import { altReceiptEntrySchema } from "./testdaten/altes-lese-schema";
import { vorFassungReceiptEntrySchema } from "./testdaten/lese-schema-vor-fassung";
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

const KETTE_L1 = readFileSync(new URL("./testdaten/kette-l1.jsonl", import.meta.url), "utf8");

describe("Belege vom Stand mit Fassung 1 mit dem Lese-Schema von vorher", () => {
  it("jeder Beleg der festen Kette besteht das Lese-Schema vor der Tor-Fassung", () => {
    const lines = KETTE_L1.trim().split("\n").slice(1);
    expect(lines).toHaveLength(70);
    for (const line of lines) {
      expect(
        vorFassungReceiptEntrySchema.safeParse(JSON.parse(line)).success,
        line.slice(0, 40),
      ).toBe(true);
    }
  });

  it("keine Entscheidung der festen Kette trägt eine Fassungsangabe", () => {
    const { entries } = parseJsonl(KETTE_L1);
    for (const entry of entries) {
      if (entry.body.type !== "decision") continue;
      expect(Object.hasOwn(entry.body.decision, "gateFormat")).toBe(false);
    }
  });
});

describe("Belege dieses Stands (Fassung 2) und Leser von vorher", () => {
  it("jede Entscheidung trägt die aktuelle Fassung (3); ein Stand vor der Tor-Fassung erkennt sie nicht", async () => {
    const { entries } = await ketteVomTor();
    const decisions = entries.filter((e) => e.body.type === "decision");
    expect(decisions.length).toBeGreaterThan(ACTION_TYPES.length - 3);
    for (const entry of decisions) {
      if (entry.body.type !== "decision") continue;
      expect(entry.body.decision.gateFormat).toBe(3);
      expect(vorFassungReceiptEntrySchema.safeParse(entry).success, String(entry.seq)).toBe(false);
    }
    // Start und Schlüsselwechsel haben sich nicht geändert.
    for (const entry of entries.filter(
      (e) => e.body.type !== "decision" && e.body.type !== "result",
    )) {
      expect(vorFassungReceiptEntrySchema.safeParse(entry).success, String(entry.seq)).toBe(true);
    }
  });

  it("die Kette ist nach dem Weg über den Export vertrauenswürdig", async () => {
    const { text } = await ketteVomTor();
    const { entries } = parseJsonl(text);
    const report = await verifyChain(entries);
    expect(report.verdict).toEqual({ level: "vertrauenswuerdig", findings: [], anchor: "fehlt" });
  });
});

describe("altes-lese-schema.ts ist kein Maßstab", () => {
  const QUELLE = readFileSync(new URL("./testdaten/altes-lese-schema.ts", import.meta.url), "utf8");

  it("nimmt lebende Verträge und lässt deshalb auch Belege dieses Stands durch", async () => {
    const lebend = [...QUELLE.matchAll(/from\s+"(@paibot\/shared\/(aktionen|fehler|tor))"/g)].map(
      (match) => match[1],
    );
    expect(lebend.sort()).toEqual([
      "@paibot/shared/aktionen",
      "@paibot/shared/fehler",
      "@paibot/shared/tor",
    ]);
    // Dadurch: Ein Beleg der Fassung 2 mit acht Grenzen und neuen Fakten besteht es, obwohl ein Stand
    // vor der Tor-Fassung ihn nicht lesen kann (siehe die geschlossene Kopie oben).
    const { entries } = await ketteVomTor();
    const model = entries.find(
      (e) =>
        e.body.type === "decision" &&
        e.body.action.type === "modell.anfragen" &&
        Object.hasOwn(e.body.facts, "maxRunTokens"),
    );
    expect(model).toBeDefined();
    if (model === undefined) return;
    const { gateFormat: _gateFormat, ...decision } = (
      model.body as { decision: Record<string, unknown> }
    ).decision;
    const ohneFassung = { ...model, body: { ...model.body, decision } };
    expect(altReceiptEntrySchema.safeParse(ohneFassung).success).toBe(true);
    expect(vorFassungReceiptEntrySchema.safeParse(ohneFassung).success).toBe(false);
  });
});
