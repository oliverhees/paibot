/**
 * PaiBot – Test-Kette mit Belegen der Tor-Fassungen 1, 2, 3 und 4 in einer Kette (nur Tests): Start,
 * dann Entscheidungen und Ergebnisse aus jeder Fassung in der Reihenfolge, in der die Fassungen
 * in Kraft traten. Fassung 1, 2 und 3 werden roh geschrieben (das Tor schreibt nur noch die
 * aktuelle Fassung), Fassung 4 läuft durch das echte Tor und den echten Beleg-Schreiber.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-22
 */

import { createGate, denialCode, type Execute, evaluate, ruleSnapshot } from "@paibot/gate";
import type { ActionRequest, ActionType } from "@paibot/shared/aktionen";
import { RECEIPT_CHAIN_FORMAT, type ReceiptBody, type ReceiptEntry } from "@paibot/shared/belege";
import { isPaiBotError } from "@paibot/shared/fehler";
import { newId } from "@paibot/shared/ids";
import { ACTIVE_STANDARD_RULES, type RuleSnapshot } from "@paibot/shared/tor";
import { sampleAction, sampleFacts } from "../../../gate/src/testdaten";
import { digestBytes, hashReceipt } from "../hash";
import { exportJsonl } from "../jsonl";
import {
  keyInfo,
  signedEntry,
  TEST_INSTALLATION,
  type TestKey,
  testKey,
  testSign,
} from "../testhilfen";

type Roh = Record<string, unknown>;

const OK: Execute<never, string> = async () => ({ value: "fertig", result: { status: "ok" } });

/** Kette im Speicher, in die Belege jeder Fassung gehängt werden. */
export class GemischteKette {
  readonly key: TestKey = testKey();
  readonly entries: ReceiptEntry[] = [];
  snapshot: RuleSnapshot | undefined;
  #tick = 0;

  /** Regeln zum Nachrechnen (der Regelstand, mit dem das Tor entscheidet). */
  get regeln(): RuleSnapshot["rules"] {
    return (this.snapshot as RuleSnapshot).rules;
  }

  /** Zeitpunkt, streng aufsteigend. */
  time(): Date {
    return new Date(Date.UTC(2026, 10, 22, 12, 0, 0, ++this.#tick));
  }

  static async neu(): Promise<GemischteKette> {
    const kette = new GemischteKette();
    kette.snapshot = await ruleSnapshot(ACTIVE_STANDARD_RULES);
    kette.entries.push(
      await signedEntry(
        {
          type: "start",
          facts: {
            installationId: TEST_INSTALLATION,
            publicKey: kette.key.publicKey,
            software: "0.3.0+dev",
            format: RECEIPT_CHAIN_FORMAT,
          },
        },
        undefined,
        kette.key,
        kette.time(),
      ),
    );
    return kette;
  }

  /** Hängt einen Körper roh an (ohne Schreib-Schema), signiert mit dem Schlüssel der Kette. */
  async roh(body: Roh): Promise<ReceiptEntry> {
    const prev = this.entries.at(-1) as ReceiptEntry;
    const full = {
      ...body,
      v: 1,
      id: newId("receipt"),
      seq: prev.seq + 1,
      time: this.time().toISOString(),
      prev: prev.hash,
      keyId: this.key.keyId,
    };
    const hash = await hashReceipt(full as unknown as ReceiptBody);
    const entry = {
      seq: full.seq,
      id: full.id,
      hash,
      signature: testSign(this.key.privateKey, digestBytes(hash)),
      keyId: this.key.keyId,
      body: full as unknown as ReceiptBody,
    };
    this.entries.push(entry);
    return entry;
  }

  /**
   * Entscheidung und Ergebnis nach der Fassung `format` (1, 2 oder 3), roh angehängt. Fassung 1
   * trägt kein Feld `gateFormat`, die späteren ja. Die Fakten sind die der Beispiele ohne
   * `botPaused`: Der Fakt gehört erst zu Fassung 4.
   */
  async alt(type: ActionType, format: 1 | 2 | 3): Promise<void> {
    const action = sampleAction(type) as ActionRequest;
    const { botPaused: _botPaused, ...facts } = sampleFacts(type) as Roh;
    const decided = evaluate(action, facts as never, this.snapshot as RuleSnapshot, {
      format,
    }) as unknown as Roh;
    const { matchedRules, ...rest } = decided;
    const decision: Roh =
      format === 1
        ? { ...rest, rules: matchedRules }
        : { gateFormat: format, ...rest, rules: matchedRules };
    await this.roh({ type: "decision", action, decision, facts });
    const erlaubt = decided.outcome === "allow";
    await this.roh({
      type: "result",
      action,
      result: erlaubt ? { status: "ok" } : { status: "denied", code: denialCode(decided as never) },
    });
  }

  /** Durch das echte Tor (aktuelle Fassung) und den echten Beleg-Schreiber. */
  async tor(type: ActionType, facts: Roh = sampleFacts(type) as Roh): Promise<void> {
    const append = async (draft: Parameters<typeof signedEntry>[0]) => {
      const entry = await signedEntry(draft, this.entries.at(-1), this.key, this.time());
      this.entries.push(entry);
      return { receiptId: entry.id, seq: entry.seq };
    };
    const snapshot = this.snapshot as RuleSnapshot;
    const gate = createGate({
      rules: { load: async () => snapshot },
      clock: { now: () => this.time() },
      receipts: {
        appendDecision: (record) =>
          append({
            type: "decision",
            action: record.action,
            decision: record.decision,
            facts: record.facts as Roh,
          }),
        appendResult: (record) =>
          append({ type: "result", action: record.action, result: record.result }),
      },
    });
    try {
      await gate.run(sampleAction(type) as never, facts as never, OK);
    } catch (error) {
      // Eine Ablehnung (z. B. fragt das Tor nach) ist kein Fehler des Tests.
      if (!isPaiBotError(error)) throw error;
    }
  }

  /** Export als Text (Kopfzeile mit dem öffentlichen Schlüssel, ohne Anker). */
  async text(): Promise<string> {
    let text = "";
    for await (const line of exportJsonl(
      {
        format: "pb-belege",
        v: 1,
        installationId: TEST_INSTALLATION,
        publicKeys: [keyInfo(this.key)],
      },
      this.entries,
    )) {
      text += line;
    }
    return text;
  }
}

/**
 * Kette mit je einer Entscheidung samt Ergebnis aus Fassung 1 und Fassung 2 (`nachricht.senden`;
 * die Fakten sind in beiden Fassungen gleich), aus Fassung 3 (`nachricht.senden` und die Aktion für
 * Apps `app.verbinden`, roh) und, mit `bis = 4`, aus Fassung 4 (`nachricht.senden` mit dem Fakt
 * `botPaused` und `app.verbinden`, beide durch das echte Tor). Mit `bis = 3` endet die Kette bei
 * Fassung 3, wie sie ein Stand vor Fassung 4 geschrieben hat.
 */
export async function ketteGemischt(bis: 3 | 4 = 4): Promise<GemischteKette> {
  const kette = await GemischteKette.neu();
  await kette.alt("nachricht.senden", 1);
  await kette.alt("nachricht.senden", 2);
  await kette.alt("nachricht.senden", 3);
  await kette.alt("app.verbinden", 3);
  if (bis === 4) {
    await kette.tor("nachricht.senden");
    await kette.tor("app.verbinden");
  }
  return kette;
}
