/**
 * PaiBot – Tests: Belege nennen das Gerät, von dem eine Aktion des Besitzers kam (Fakt `device`).
 * Ältere Belege ohne diesen Fakt bleiben gültig; eine Kette aus alten und neuen Belegen ist als
 * Ganzes prüfbar; ein nachträglich geändertes Gerät bricht die Kette.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { evaluate } from "@paibot/gate";
import type { ReceiptEntry } from "@paibot/shared/belege";
import { receiptBodySchema } from "@paibot/shared/belege";
import { newId } from "@paibot/shared/ids";
import { beforeAll, describe, expect, it } from "vitest";
import { hashReceipt } from "./hash";
import {
  copy,
  keyInfo,
  sendAction,
  sendFacts,
  signedEntry,
  TEST_INSTALLATION,
  TEST_RULE,
  type TestKey,
  testKey,
} from "./testhilfen";
import { verifyChain, verifyReceipt } from "./verify";

const GERAET = newId("device");

let key: TestKey;
let kette: ReceiptEntry[];

/** Kette: Start, dann Entscheidung + Ergebnis ohne Gerät (alt), dann mit Gerät (neu). */
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
  for (const geraet of [undefined, GERAET, undefined, GERAET]) {
    const action = sendAction();
    const facts = { ...sendFacts(), ...(geraet === undefined ? {} : { device: geraet }) };
    const vorher = kette[kette.length - 1];
    const entscheidung = await signedEntry(
      { type: "decision", action, decision: evaluate(action, facts, [TEST_RULE]), facts },
      vorher,
      key,
    );
    const ergebnis = await signedEntry(
      { type: "result", action, result: { status: "ok" } },
      entscheidung,
      key,
    );
    kette.push(entscheidung, ergebnis);
  }
});

describe("Fakt „Gerät“ in Belegen des Besitzers", () => {
  it("Beleg ohne Gerät (ältere Fassung) und mit Gerät passen beide zum Vertrag", () => {
    const alt = kette[1];
    const neu = kette[3];
    expect(alt?.body.type === "decision" && "device" in alt.body.facts).toBe(false);
    expect(neu?.body.type === "decision" && neu.body.facts.device).toBe(GERAET);
    expect(receiptBodySchema.safeParse(alt?.body).success).toBe(true);
    expect(receiptBodySchema.safeParse(neu?.body).success).toBe(true);
  });

  it("eine Kette aus alten und neuen Belegen ist als Ganzes vertrauenswürdig", async () => {
    const bericht = await verifyChain(kette, { rules: [TEST_RULE], publicKeys: [keyInfo(key)] });
    expect(bericht.ok).toBe(true);
    expect(bericht.checked).toBe(kette.length);
    expect(bericht.verdict.findings).toEqual([]);
  });

  it("jeder einzelne Beleg ist gültig, alt wie neu", async () => {
    let vorher: ReceiptEntry | null = null;
    for (const eintrag of kette) {
      const pruefungen = await verifyReceipt(eintrag, vorher, [keyInfo(key)]);
      expect(
        pruefungen.filter((p) => p.status === "fehler").map((p) => p.check),
        `seq ${eintrag.seq}`,
      ).toEqual([]);
      vorher = eintrag;
    }
  });

  it("ein nachträglich geändertes Gerät bricht die Kette an dieser Stelle", async () => {
    const falsch = copy(kette);
    const ziel = falsch[3];
    if (ziel?.body.type !== "decision") throw new Error("Entscheidung erwartet");
    ziel.body.facts.device = newId("device");
    const bericht = await verifyChain(falsch, { rules: [TEST_RULE], publicKeys: [keyInfo(key)] });
    expect(bericht.ok).toBe(false);
    expect(bericht.firstFailure?.seq).toBe(4);
  });

  it("ein nachträglich entferntes Gerät bricht die Kette ebenso", async () => {
    const falsch = copy(kette);
    const ziel = falsch[3];
    if (ziel?.body.type !== "decision") throw new Error("Entscheidung erwartet");
    delete ziel.body.facts.device;
    expect(await hashReceipt(ziel.body)).not.toBe(ziel.hash);
    const bericht = await verifyChain(falsch, { rules: [TEST_RULE], publicKeys: [keyInfo(key)] });
    expect(bericht.ok).toBe(false);
    expect(bericht.firstFailure?.seq).toBe(4);
  });

  it("ein Gerät in falscher Form passt nicht zum Vertrag", () => {
    const neu = copy(kette[3]);
    if (neu?.body.type !== "decision") throw new Error("Entscheidung erwartet");
    neu.body.facts.device = "ger_kaputt";
    expect(receiptBodySchema.safeParse(neu.body).success).toBe(false);
  });
});
