/**
 * PaiBot – Tests: Das Ergebnis einer Modell-Anfrage kann nennen, wer laut Antwort der Schnittstelle
 * geantwortet hat (`servedBy`). Ältere Ergebnisse ohne dieses Feld bleiben gültig; eine Kette aus
 * alten und neuen Belegen ist als Ganzes prüfbar; eine nachträgliche Änderung bricht die Kette.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import type { ReceiptEntry } from "@paibot/shared/belege";
import { receiptBodyWriteSchema } from "@paibot/shared/belege";
import { beforeAll, describe, expect, it } from "vitest";
import {
  copy,
  keyInfo,
  sendAction,
  sendFacts,
  signedEntry,
  TEST_INSTALLATION,
  TEST_RULE,
  type TestKey,
  testEvaluate,
  testKey,
} from "./testhilfen";
import { verifyChain } from "./verify";

const HERKUNFT = { provider: "beispiel-nord", model: "beispiel/modell-1" };

let key: TestKey;
let kette: ReceiptEntry[];

beforeAll(async () => {
  key = testKey();
  const start = await signedEntry(
    {
      type: "start",
      facts: { installationId: TEST_INSTALLATION, publicKey: key.publicKey, software: "0.3.0+dev" },
    },
    undefined,
    key,
  );
  kette = [start];
  for (const servedBy of [undefined, HERKUNFT]) {
    const action = sendAction();
    const facts = sendFacts();
    const entscheidung = await signedEntry(
      { type: "decision", action, decision: testEvaluate(action, facts), facts },
      kette[kette.length - 1],
      key,
    );
    const ergebnis = await signedEntry(
      {
        type: "result",
        action,
        result: { status: "ok", ...(servedBy === undefined ? {} : { servedBy }) },
      },
      entscheidung,
      key,
    );
    kette.push(entscheidung, ergebnis);
  }
});

describe("Herkunft der Antwort im Beleg „Ergebnis“", () => {
  it("alt (ohne) und neu (mit) passen zum Vertrag; falsche Form nicht", () => {
    expect(receiptBodyWriteSchema.safeParse(kette[2]?.body).success).toBe(true);
    expect(receiptBodyWriteSchema.safeParse(kette[4]?.body).success).toBe(true);
    const falsch = copy(kette[4]);
    if (falsch?.body.type !== "result") throw new Error("Ergebnis erwartet");
    falsch.body.result.servedBy = { provider: "Böse‮Firma" };
    expect(receiptBodyWriteSchema.safeParse(falsch.body).success).toBe(false);
  });

  it("Kette aus alten und neuen Belegen ist gültig", async () => {
    const bericht = await verifyChain(kette, { rules: [TEST_RULE], publicKeys: [keyInfo(key)] });
    expect(bericht.ok).toBe(true);
    expect(bericht.verdict.findings).toEqual([]);
  });

  it("nachträglich geänderter Anbieter bricht die Kette", async () => {
    const falsch = copy(kette);
    const ziel = falsch[4];
    if (ziel?.body.type !== "result" || ziel.body.result.servedBy === undefined) {
      throw new Error("Ergebnis mit Herkunft erwartet");
    }
    ziel.body.result.servedBy.provider = "anderer-anbieter";
    const bericht = await verifyChain(falsch, { rules: [TEST_RULE], publicKeys: [keyInfo(key)] });
    expect(bericht.ok).toBe(false);
    expect(bericht.firstFailure?.seq).toBe(5);
  });
});
