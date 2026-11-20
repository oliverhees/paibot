/**
 * PaiBot – Tests des Ankers: Kettenkopf außerhalb aufbewahren und damit eine gekürzte, eine
 * umgeschriebene und eine ausgetauschte Kette erkennen; ohne Anker bleibt das Kürzen unerkannt.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { evaluate } from "@paibot/gate";
import {
  type ChainAnchor,
  encodeAnchor,
  parseAnchor,
  type ReceiptEntry,
} from "@paibot/shared/belege";
import { newId } from "@paibot/shared/ids";
import { beforeAll, describe, expect, it } from "vitest";
import {
  buildChain,
  copy,
  sendAction,
  sendFacts,
  signedEntry,
  TEST_INSTALLATION,
  TEST_RULE,
  type TestKey,
  testKey,
} from "./testhilfen";
import { createAnchor, verifyChain } from "./verify";

let key: TestKey;
let chain: ReceiptEntry[];
let anchor: ChainAnchor;
const TIME = "2026-11-20T12:00:00.000Z";

/** Hängt `count` neue Entscheidungen an, signiert mit `signer`. */
async function extend(
  prefix: readonly ReceiptEntry[],
  count: number,
  signer: TestKey,
): Promise<ReceiptEntry[]> {
  const entries = [...prefix];
  for (let i = 0; i < count; i++) {
    const action = sendAction();
    const facts = sendFacts(i + 1);
    entries.push(
      await signedEntry(
        { type: "decision", action, decision: evaluate(action, facts, [TEST_RULE]), facts },
        entries.at(-1),
        signer,
      ),
    );
  }
  return entries;
}

beforeAll(async () => {
  key = testKey();
  chain = await buildChain(30, key);
  anchor = createAnchor(chain[0] as ReceiptEntry, chain[29] as ReceiptEntry, TIME);
});

describe("createAnchor", () => {
  it("nimmt Kopf und Anfang der Kette nach Vertrag", () => {
    const head = chain[29] as ReceiptEntry;
    expect(anchor).toEqual({
      format: "pb-anker",
      v: 1,
      installationId: TEST_INSTALLATION,
      seq: 30,
      hash: head.hash,
      keyId: key.keyId,
      startKeyId: key.keyId,
      startPublicKey: key.publicKey,
      time: TIME,
    });
  });

  it("lässt sich als eine Zeile Text aufbewahren und wieder einlesen", () => {
    const text = encodeAnchor(anchor);
    expect(text).not.toContain("\n");
    expect(text.startsWith('{"format":"pb-anker","v":1,')).toBe(true);
    expect(parseAnchor(`  ${text}\n`)).toEqual(anchor);
  });

  it("weist einen Anfang ab, der kein Start-Beleg ist", () => {
    expect(() => createAnchor(chain[1] as ReceiptEntry, chain[29] as ReceiptEntry)).toThrow(
      TypeError,
    );
  });
});

describe("verifyChain mit Anker", () => {
  it("passende Kette: vertrauenswürdig, Anker geprüft", async () => {
    const report = await verifyChain(chain, { anchor });
    expect(report.ok).toBe(true);
    expect(report.verdict).toEqual({
      level: "vertrauenswuerdig",
      findings: [],
      anchor: "geprueft",
    });
  });

  it("Kette ist seit dem Anker weitergewachsen: weiter vertrauenswürdig", async () => {
    const longer = await extend(chain, 5, key);
    expect((await verifyChain(longer, { anchor })).verdict.level).toBe("vertrauenswuerdig");
  });

  it("am Ende gekürzt: mit Anker erkannt", async () => {
    const report = await verifyChain(chain.slice(0, 25), { anchor });
    expect(report.firstFailure).toBeUndefined();
    expect(report.ok).toBe(false);
    expect(report.verdict).toEqual({
      level: "ungueltig",
      findings: [{ problem: "kette_kuerzer_als_anker", seq: 30 }],
      anchor: "geprueft",
    });
  });

  it("am Ende gekürzt: ohne Anker nicht erkennbar (bekannte Grenze)", async () => {
    const report = await verifyChain(chain.slice(0, 25));
    expect(report.ok).toBe(true);
    expect(report.verdict).toEqual({ level: "vertrauenswuerdig", findings: [], anchor: "fehlt" });
  });

  it("gekürzt und mit neuen Belegen bis über den Anker aufgefüllt: Kopf weicht ab", async () => {
    const refilled = await extend(chain.slice(0, 25), 10, key);
    const report = await verifyChain(refilled, { anchor });
    expect(report.firstFailure).toBeUndefined();
    expect(report.verdict.findings).toEqual([{ problem: "kopf_abweichend", seq: 30 }]);
    expect(report.verdict.level).toBe("ungueltig");
  });

  it("ganze Kette ausgetauscht (anderer Anfang, eigener Schlüssel): erkannt", async () => {
    const intruder = testKey();
    const forged = await buildChain(40, intruder);
    // Ohne Anker ist die gefälschte Kette in sich gültig.
    expect((await verifyChain(forged)).ok).toBe(true);
    const report = await verifyChain(forged, { anchor });
    expect(report.verdict.level).toBe("ungueltig");
    expect(report.verdict.findings).toEqual([
      { problem: "anderer_anfang_als_anker", seq: 1, keyId: intruder.keyId },
      { problem: "kopf_abweichend", seq: 30 },
    ]);
  });

  it("gleiche Schlüssel-Kennung, anderer öffentlicher Schlüssel am Anfang: erkannt", async () => {
    const impostor = { ...testKey(), keyId: key.keyId };
    const forged = await buildChain(30, impostor);
    const findings = (await verifyChain(forged, { anchor })).verdict.findings;
    expect(findings).toContainEqual({
      problem: "anderer_anfang_als_anker",
      seq: 1,
      keyId: key.keyId,
    });
  });

  it("Anker einer anderen Installation", async () => {
    const other = { ...anchor, installationId: newId("installation") };
    const report = await verifyChain(chain, { anchor: other });
    expect(report.verdict.findings).toEqual([{ problem: "andere_installation", seq: 1 }]);
  });

  it("Anker nennt einen anderen Schlüssel als die Kette an dieser Stelle", async () => {
    const other = { ...anchor, keyId: newId("key") };
    const report = await verifyChain(chain, { anchor: other });
    expect(report.verdict.findings).toEqual([
      { problem: "schluessel_nicht_aus_kette", seq: 30, keyId: other.keyId },
    ]);
  });

  it("leere Kette mit Anker", async () => {
    const report = await verifyChain([], { anchor });
    expect(report.verdict.level).toBe("ungueltig");
    expect(report.verdict.findings.map((f) => f.problem)).toEqual([
      "anderer_anfang_als_anker",
      "kette_kuerzer_als_anker",
    ]);
  });

  it("ein umgeschriebener Beleg vor dem Anker bleibt ein Fehler der Einzelprüfung", async () => {
    const entries = copy(chain);
    (entries[10] as { signature: string }).signature = (entries[11] as ReceiptEntry).signature;
    const report = await verifyChain(entries, { anchor });
    expect(report.firstFailure?.seq).toBe(11);
    expect(report.verdict.level).toBe("ungueltig");
  });
});
