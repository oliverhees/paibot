/**
 * PaiBot – Tests des Prüfers: gültige Kette und Manipulationen, die er an der richtigen Stelle
 * meldet.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { evaluate } from "@paibot/gate";
import { RECEIPT_CHAIN_FORMAT, type ReceiptEntry } from "@paibot/shared/belege";
import { beforeAll, describe, expect, it } from "vitest";
import type { ReceiptDraft } from "./build";
import {
  buildChain,
  copy,
  keyInfo,
  sendAction,
  sendFacts,
  signedEntry,
  TEST_INSTALLATION,
  TEST_RULE,
  type TestKey,
  testDecision,
  testKey,
  testSign,
} from "./testhilfen";
import {
  type CheckResult,
  digestBytes,
  hashReceipt,
  keyChangeSigner,
  reevaluate,
  verifyChain,
  verifyReceipt,
} from "./verify";

const COUNT = 100;
let key: TestKey;
let chain: ReceiptEntry[];

beforeAll(async () => {
  key = testKey();
  chain = await buildChain(COUNT, key);
});

function failed(checks: readonly CheckResult[]): string[] {
  return checks.filter((c) => c.status === "fehler").map((c) => c.check);
}

/** Signiert einen veränderten Körper neu (wie jemand, der den Schlüssel hat). */
async function resign(entry: ReceiptEntry, signer: TestKey): Promise<ReceiptEntry> {
  const hash = await hashReceipt(entry.body);
  return { ...entry, hash, signature: testSign(signer.privateKey, digestBytes(hash)) };
}

describe("verifyChain", () => {
  it("erkennt eine gültige Kette mit 100 Einträgen", async () => {
    const report = await verifyChain(chain, { rules: [TEST_RULE], publicKeys: [keyInfo(key)] });
    expect(report).toEqual({
      ok: true,
      checked: COUNT,
      head: { seq: COUNT, hash: chain[COUNT - 1]?.hash },
      verdict: { level: "vertrauenswuerdig", findings: [], anchor: "fehlt" },
    });
  });

  it("nimmt auch asynchrone Folgen an", async () => {
    async function* stream() {
      yield* chain;
    }
    expect((await verifyChain(stream(), [keyInfo(key)])).ok).toBe(true);
  });

  it("leere Kette ist gültig, aber ohne Kopf", async () => {
    expect(await verifyChain([], [keyInfo(key)])).toEqual({
      ok: true,
      checked: 0,
      verdict: { level: "vertrauenswuerdig", findings: [], anchor: "fehlt" },
    });
  });

  it("ein geändertes Feld: meldet genau diesen Eintrag (Inhalt)", async () => {
    const entries = copy(chain);
    const target = entries[41] as ReceiptEntry & { body: { facts: { inputChars: number } } };
    target.body.facts.inputChars += 1;
    const report = await verifyChain(entries, [keyInfo(key)]);
    expect(report.ok).toBe(false);
    expect(report.firstFailure?.seq).toBe(42);
    expect(report.firstFailure?.index).toBe(41);
    expect(failed(report.firstFailure?.checks ?? [])).toEqual(["inhalt"]);
  });

  it("ein Feld geändert und die Prüfsumme neu berechnet: Signatur passt nicht mehr", async () => {
    const entries = copy(chain);
    const target = entries[60] as ReceiptEntry;
    (target.body as { time: string }).time = "2026-11-21T10:00:00.000Z";
    target.hash = await hashReceipt(target.body);
    const report = await verifyChain(entries, [keyInfo(key)]);
    expect(report.firstFailure?.seq).toBe(61);
    expect(failed(report.firstFailure?.checks ?? [])).toEqual(["signatur"]);
  });

  it("ein Eintrag gelöscht: Kette bricht beim nächsten Eintrag", async () => {
    const entries = copy(chain);
    entries.splice(30, 1);
    const report = await verifyChain(entries, [keyInfo(key)]);
    expect(report.firstFailure).toMatchObject({ seq: 32, index: 30 });
    expect(failed(report.firstFailure?.checks ?? [])).toEqual(["kette"]);
  });

  it("ein Eintrag eingeschoben: Kette bricht an dieser Stelle", async () => {
    const entries = copy(chain);
    const action = sendAction();
    const facts = sendFacts();
    const extra = await signedEntry(
      { type: "decision", action, decision: evaluate(action, facts, [TEST_RULE]), facts },
      entries[19],
      key,
    );
    entries.splice(20, 0, extra);
    const report = await verifyChain(entries, [keyInfo(key)]);
    // Der eingeschobene Eintrag selbst ist sauber verkettet; der folgende nicht mehr.
    expect(report.firstFailure).toMatchObject({ seq: 21, index: 21 });
    expect(failed(report.firstFailure?.checks ?? [])).toEqual(["kette"]);
  });

  it("Reihenfolge vertauscht: meldet die erste vertauschte Stelle", async () => {
    const entries = copy(chain);
    const [a, b] = [entries[50] as ReceiptEntry, entries[51] as ReceiptEntry];
    entries[50] = b;
    entries[51] = a;
    const report = await verifyChain(entries, [keyInfo(key)]);
    expect(report.firstFailure).toMatchObject({ seq: 52, index: 50 });
    expect(failed(report.firstFailure?.checks ?? [])).toEqual(["kette"]);
  });

  it("Signatur von einem fremden Schlüssel: meldet die Stelle", async () => {
    const entries = copy(chain);
    const foreign = testKey();
    entries[70] = await resign(entries[70] as ReceiptEntry, foreign);
    const report = await verifyChain(entries, [keyInfo(key)]);
    expect(report.firstFailure).toMatchObject({ seq: 71, index: 70 });
    expect(failed(report.firstFailure?.checks ?? [])).toEqual(["signatur"]);
  });

  it("ausgetauschter öffentlicher Schlüssel in der Datenbank fällt auf, die Kette selbst bleibt gültig", async () => {
    const foreign = { ...testKey(), keyId: key.keyId };
    const report = await verifyChain(chain, { publicKeys: [keyInfo(foreign)] });
    expect(report.firstFailure).toBeUndefined();
    expect(report.ok).toBe(false);
    expect(report.verdict).toEqual({
      level: "ungueltig",
      findings: [{ problem: "schluessel_nicht_aus_kette", keyId: key.keyId }],
      anchor: "fehlt",
    });
  });

  it("geprüft wird mit den Schlüsseln aus der Kette, nicht mit einer Liste von außen", async () => {
    // Eine Liste ohne die Schlüssel der Kette ändert nichts; sie dient nur dem Vergleich.
    expect((await verifyChain(chain, [keyInfo(testKey())])).ok).toBe(true);
    expect((await verifyChain(chain)).ok).toBe(true);
  });

  it("ganze Kette mit eigenem Schlüssel neu geschrieben: ohne Anker nicht erkennbar", async () => {
    const forged = await buildChain(10, testKey());
    expect((await verifyChain(forged)).ok).toBe(true);
  });

  it("prev umgebogen und neu signiert mit dem eigenen Schlüssel: Kette bricht", async () => {
    const entries = copy(chain);
    const target = entries[80] as ReceiptEntry;
    (target.body as { prev: string }).prev = (entries[78] as ReceiptEntry).hash;
    entries[80] = await resign(target, key);
    const report = await verifyChain(entries, [keyInfo(key)]);
    expect(report.firstFailure).toMatchObject({ seq: 81, index: 80 });
    expect(failed(report.firstFailure?.checks ?? [])).toEqual(["kette"]);
  });

  it("geänderte Regel-Fassung: Entscheidung folgt nicht mehr daraus", async () => {
    const changed = { ...TEST_RULE, effect: "deny" as const };
    const report = await verifyChain(chain, { rules: [changed] });
    expect(report.firstFailure).toMatchObject({ seq: 2, index: 0 + 1 });
    expect(failed(report.firstFailure?.checks ?? [])).toEqual(["entscheidung"]);
  });

  it("ohne Regeln entfällt das Nachrechnen", async () => {
    const checks = await verifyReceipt(chain[1] as ReceiptEntry, chain[0] as ReceiptEntry, [
      keyInfo(key),
    ]);
    expect(checks.map((c) => [c.check, c.status])).toEqual([
      ["inhalt", "ok"],
      ["signatur", "ok"],
      ["kette", "ok"],
      ["entscheidung", "entfaellt"],
    ]);
  });

  it("weitere Einträge nach dem Start-Beleg sind kein Start", async () => {
    const first = copy(chain[0] as ReceiptEntry);
    const second = await signedEntry(
      { type: "start", facts: (first.body as unknown as { facts: never }).facts },
      first,
      key,
    );
    const report = await verifyChain([first, second], [keyInfo(key)]);
    expect(report.firstFailure?.seq).toBe(2);
    expect(failed(report.firstFailure?.checks ?? [])).toContain("kette");
  });

  it("Kette, die nicht mit Eintrag 1 beginnt, ist ungültig", async () => {
    const report = await verifyChain(chain.slice(1), [keyInfo(key)]);
    expect(report.firstFailure?.index).toBe(0);
    expect(failed(report.firstFailure?.checks ?? [])).toContain("kette");
  });

  it("wirft nicht bei kaputten Daten", async () => {
    const broken = [
      { ...copy(chain[0] as ReceiptEntry), body: null },
      { ...copy(chain[1] as ReceiptEntry), signature: "kurz", hash: "sha256:xyz" },
      { ...copy(chain[2] as ReceiptEntry), body: { ...copy(chain[2]?.body), seq: 1.5 } },
    ] as unknown as ReceiptEntry[];
    const report = await verifyChain(broken, [keyInfo(key)]);
    expect(report.ok).toBe(false);
    expect(report.checked).toBe(3);
    expect(report.firstFailure?.index).toBe(0);
  });
});

describe("verifyReceipt", () => {
  it("liefert vier Ergebnisse mit Kurzform und Regel", async () => {
    const checks = await verifyReceipt(
      chain[1] as ReceiptEntry,
      chain[0] as ReceiptEntry,
      [keyInfo(key)],
      { rules: [TEST_RULE] },
    );
    expect(checks).toEqual([
      { check: "inhalt", status: "ok", seq: 2 },
      { check: "signatur", status: "ok", seq: 2, fingerprint: key.fingerprint },
      { check: "kette", status: "ok", seq: 2 },
      {
        check: "entscheidung",
        status: "ok",
        seq: 2,
        rule: { id: "R-001", version: 1 },
        ruleStand: "nicht_festgehalten",
      },
    ]);
  });

  it("die Signatur gilt über die 32 Rohbyte, nicht über den Hex-Text", async () => {
    const entry = copy(chain[2] as ReceiptEntry);
    entry.signature = testSign(key.privateKey, new TextEncoder().encode(entry.hash));
    const checks = await verifyReceipt(entry, chain[1] as ReceiptEntry, [keyInfo(key)]);
    expect(failed(checks)).toEqual(["signatur"]);
  });
});

describe("reevaluate", () => {
  it("rechnet die Entscheidung nach", () => {
    expect(reevaluate(chain[1] as ReceiptEntry, [TEST_RULE]).status).toBe("ok");
    const other = reevaluate(chain[1] as ReceiptEntry, []);
    expect(other.status).toBe("fehler");
    expect(other.expected?.outcome).toBe("ask");
  });

  it("entfällt bei anderen Typen", () => {
    expect(reevaluate(chain[0] as ReceiptEntry, [TEST_RULE])).toEqual({ status: "entfaellt" });
    expect(reevaluate(chain[2] as ReceiptEntry, [TEST_RULE])).toEqual({ status: "entfaellt" });
  });
});

describe("Schlüsselwechsel", () => {
  async function chainWithChange(signedBy: "previous" | "new") {
    const first = testKey();
    const next = testKey();
    const entries = await buildChain(4, first);
    const change = await signedEntry(
      {
        type: "key_change",
        facts: {
          newKeyId: next.keyId,
          publicKey: next.publicKey,
          previousKeyId: first.keyId,
          signedBy,
        },
      },
      entries[3],
      signedBy === "previous" ? first : next,
    );
    entries.push(change);
    const action = sendAction();
    const facts = sendFacts();
    entries.push(
      await signedEntry(
        { type: "decision", action, decision: evaluate(action, facts, [TEST_RULE]), facts },
        change,
        next,
      ),
    );
    return { first, next, entries, keys: [keyInfo(first), keyInfo(next)] };
  }

  it("gilt, wenn der bisherige Schlüssel signiert", async () => {
    const { entries, keys } = await chainWithChange("previous");
    const report = await verifyChain(entries, keys);
    expect(report.ok).toBe(true);
    expect(report.verdict.level).toBe("vertrauenswuerdig");
    expect(report.notAttestedFrom).toBeUndefined();
    expect(keyChangeSigner(entries[4] as ReceiptEntry, keys)).toBe("previous");
  });

  it("selbst beglaubigter Wechsel (nur vom neuen Schlüssel signiert): Vertrauen gebrochen", async () => {
    const { next, entries, keys } = await chainWithChange("new");
    const report = await verifyChain(entries, keys);
    expect(report.firstFailure).toBeUndefined();
    expect(report.ok).toBe(false);
    expect(report.verdict).toEqual({
      level: "vertrauen_gebrochen",
      findings: [{ problem: "schluesselwechsel_nicht_beglaubigt", seq: 5, keyId: next.keyId }],
      anchor: "fehlt",
    });
    // Alle Belege ab dem Wechsel sind ausdrücklich nicht beglaubigt.
    expect(report.notAttestedFrom).toBe(5);
    expect(keyChangeSigner(entries[4] as ReceiptEntry, keys)).toBe("new");
  });

  it("selbst beglaubigter Wechsel eines Fremden, danach eigene Belege: nie vertrauenswürdig", async () => {
    const first = testKey();
    const intruder = testKey();
    const entries = await buildChain(3, first);
    const change = await signedEntry(
      {
        type: "key_change",
        facts: {
          newKeyId: intruder.keyId,
          publicKey: intruder.publicKey,
          previousKeyId: first.keyId,
          signedBy: "new",
        },
      },
      entries[2],
      intruder,
    );
    entries.push(change);
    const action = sendAction();
    const facts = sendFacts();
    entries.push(
      await signedEntry(
        { type: "decision", action, decision: evaluate(action, facts, [TEST_RULE]), facts },
        change,
        intruder,
      ),
    );
    // Auch wenn die Datenbank den fremden Schlüssel als gültig führt.
    const report = await verifyChain(entries, [keyInfo(first), keyInfo(intruder)]);
    expect(report.verdict.level).toBe("vertrauen_gebrochen");
    expect(report.notAttestedFrom).toBe(4);
  });

  it("Beleg mit einem Schlüssel, der nicht aus der Kette folgt", async () => {
    const entries = await buildChain(4, key);
    const other = testKey();
    const action = sendAction();
    const facts = sendFacts();
    entries.push(
      await signedEntry(
        { type: "decision", action, decision: evaluate(action, facts, [TEST_RULE]), facts },
        entries[3],
        other,
      ),
    );
    const report = await verifyChain(entries, [keyInfo(key), keyInfo(other)]);
    expect(report.firstFailure?.seq).toBe(5);
    expect(failed(report.firstFailure?.checks ?? [])).toEqual(["signatur"]);
    expect(report.verdict.findings).toEqual([
      { problem: "schluessel_nicht_aus_kette", seq: 5, keyId: other.keyId },
    ]);
  });

  it("nach dem Wechsel ist der alte Schlüssel nicht mehr gültig", async () => {
    const { first, entries, keys } = await chainWithChange("previous");
    const action = sendAction();
    const facts = sendFacts();
    entries.push(
      await signedEntry(
        { type: "decision", action, decision: evaluate(action, facts, [TEST_RULE]), facts },
        entries[5],
        first,
      ),
    );
    const report = await verifyChain(entries, keys);
    expect(report.firstFailure?.seq).toBe(7);
    expect(failed(report.firstFailure?.checks ?? [])).toEqual(["signatur"]);
  });

  it("fehlt der neue Schlüssel in der Liste, prüft der Prüfer mit dem Schlüssel aus der Kette", async () => {
    const { first, entries } = await chainWithChange("previous");
    const report = await verifyChain(entries, [keyInfo(first)]);
    expect(report.ok).toBe(true);
  });

  it("neuer Schlüssel in der Liste mit anderem öffentlichen Teil: fällt beim Vergleich auf", async () => {
    const { first, next, entries } = await chainWithChange("previous");
    const fake = { ...keyInfo(testKey()), keyId: next.keyId };
    const report = await verifyChain(entries, [keyInfo(first), fake]);
    expect(report.firstFailure).toBeUndefined();
    expect(report.verdict.findings).toEqual([
      { problem: "schluessel_nicht_aus_kette", keyId: next.keyId },
    ]);
  });

  it("Wechsel zurück auf eine Kennung, die die Kette mit anderem Schlüssel kennt: ungültig", async () => {
    const { first, next, entries } = await chainWithChange("previous");
    const impostor = testKey();
    entries.push(
      await signedEntry(
        {
          type: "key_change",
          facts: {
            newKeyId: first.keyId,
            publicKey: impostor.publicKey,
            previousKeyId: next.keyId,
            signedBy: "previous",
          },
        },
        entries[5],
        next,
      ),
    );
    const report = await verifyChain(entries);
    expect(report.firstFailure?.seq).toBe(7);
    expect(failed(report.firstFailure?.checks ?? [])).toEqual(["signatur"]);
    expect(report.verdict.findings).toEqual([
      { problem: "schluessel_nicht_aus_kette", seq: 7, keyId: next.keyId },
    ]);
  });

  it("keyChangeSigner liefert undefined bei unbekanntem Schlüssel oder anderem Typ", async () => {
    const { first, entries, keys } = await chainWithChange("new");
    expect(keyChangeSigner(entries[4] as ReceiptEntry, [keyInfo(first)])).toBeUndefined();
    expect(keyChangeSigner(entries[1] as ReceiptEntry, keys)).toBeUndefined();
  });

  it("keyChangeSigner prüft bei new den öffentlichen Schlüssel", async () => {
    const { first, next, entries } = await chainWithChange("new");
    const other = { ...keyInfo(testKey()), keyId: next.keyId };
    expect(keyChangeSigner(entries[4] as ReceiptEntry, [keyInfo(first), other])).toBeUndefined();
  });
});

describe("Entscheidung und Ergebnis je Aktion", () => {
  const signer: TestKey = testKey();

  async function chainOf(drafts: ReceiptDraft[], format?: number): Promise<ReceiptEntry[]> {
    const entries: ReceiptEntry[] = [];
    entries.push(
      await signedEntry(
        {
          type: "start",
          facts: {
            installationId: TEST_INSTALLATION,
            publicKey: signer.publicKey,
            software: "0.3.0+dev",
            ...(format === undefined ? {} : { format }),
          },
        },
        undefined,
        signer,
      ),
    );
    for (const draft of drafts) entries.push(await signedEntry(draft, entries.at(-1), signer));
    return entries;
  }

  const problems = async (drafts: ReceiptDraft[], format?: number) =>
    (await verifyChain(await chainOf(drafts, format))).verdict.findings.map((f) => f.problem);

  it("Entscheidung, dann passendes Ergebnis: keine Probleme", async () => {
    const action = sendAction();
    const facts = sendFacts();
    expect(
      await problems(
        [
          { type: "decision", action, decision: testDecision(action, facts), facts },
          { type: "result", action, result: { status: "ok" } },
        ],
        RECEIPT_CHAIN_FORMAT,
      ),
    ).toEqual([]);
  });

  it("zweimal „ok“ ohne Entscheidung mit derselben Aktion ist ungültig", async () => {
    const action = sendAction();
    const result: ReceiptDraft = { type: "result", action, result: { status: "ok" } };
    const report = await verifyChain(await chainOf([result, result]));
    expect(report.verdict.level).toBe("ungueltig");
    expect(report.verdict.findings.map((f) => f.problem)).toEqual([
      "ergebnis_ohne_entscheidung",
      "aktion_doppelt",
    ]);
  });

  it("„ok“ nach einer Ablehnung und ein Ergebnis zu einer anderen Aktion passen nicht", async () => {
    const action = sendAction();
    const facts = sendFacts();
    const denied = { ...testDecision(action, facts), outcome: "deny" as const };
    expect(
      await problems([
        { type: "decision", action, decision: denied, facts },
        { type: "result", action, result: { status: "ok" } },
      ]),
    ).toEqual(["ergebnis_passt_nicht_zur_entscheidung"]);
    const other = sendAction();
    expect(
      await problems([
        { type: "decision", action: other, decision: testDecision(other, facts), facts },
        {
          type: "result",
          action: {
            ...other,
            actor: "besitzer",
            target: { ...other.target, messageId: action.target.messageId },
          },
          result: { status: "ok" },
        },
      ]),
    ).toEqual(["ergebnis_passt_nicht_zur_entscheidung"]);
  });

  it("eine zweite Entscheidung derselben Aktion fällt auf", async () => {
    const action = sendAction();
    const facts = sendFacts();
    const decision: ReceiptDraft = {
      type: "decision",
      action,
      decision: testDecision(action, facts),
      facts,
    };
    expect(await problems([decision, decision])).toEqual(["aktion_doppelt"]);
  });

  it("ab Fassung 2 der Kette braucht jede Entscheidung Regelstand und Prüfsummen; ältere Ketten nicht", async () => {
    const action = sendAction();
    const facts = sendFacts();
    const drafts: ReceiptDraft[] = [
      { type: "decision", action, decision: evaluate(action, facts, [TEST_RULE]), facts },
      { type: "result", action, result: { status: "ok" } },
    ];
    expect(await problems(drafts, RECEIPT_CHAIN_FORMAT)).toEqual(["regelstand_fehlt"]);
    expect(await problems(drafts)).toEqual([]);
  });
});
