/**
 * PaiBot – Test-Ketten zur Fassung des Tors (nur in Tests benutzt): Belege aus einer neueren
 * Fassung, mit unbekannten Feldern, unbekannter Aktion und unbekanntem Fehlercode, mit einem
 * Test-Schlüssel signiert.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import type { ActionRequest } from "@paibot/shared/aktionen";
import {
  RECEIPT_CHAIN_FORMAT,
  type ReceiptBody,
  type ReceiptEntry,
  type ReceiptResult,
} from "@paibot/shared/belege";
import { newId } from "@paibot/shared/ids";
import { buildReceipt } from "../build";
import { digestBytes, hashReceipt } from "../hash";
import { exportJsonl } from "../jsonl";
import {
  keyInfo,
  sendAction,
  sendFacts,
  TEST_INSTALLATION,
  TEST_RULE,
  type TestKey,
  testDecision,
  testKey,
  testSign,
} from "../testhilfen";

/** Regeln zum Nachrechnen der Test-Ketten (die Test-Regel mit Nummer 1). */
export const FASSUNG_RULES = [{ ...TEST_RULE, seq: 1 }];

type Roh = Record<string, unknown>;
type Aendern = (body: Roh) => void;

/** Kette im Speicher; jeder Beleg lässt sich vor dem Signieren beliebig ändern. */
export class TestKette {
  readonly key: TestKey = testKey();
  readonly entries: ReceiptEntry[] = [];
  #time = 0;

  static async neu(): Promise<TestKette> {
    const kette = new TestKette();
    await kette.#add(
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
    );
    return kette;
  }

  /** Entscheidung über `action` (erlaubt mit der Test-Regel), danach `aendern`. */
  async decision(action: ActionRequest = sendAction(), aendern?: Aendern): Promise<ActionRequest> {
    const facts = sendFacts();
    await this.#add(
      { type: "decision", action, decision: testDecision(action, facts), facts },
      aendern,
    );
    return action;
  }

  /** Ergebnis zu `action`, danach `aendern`. */
  async result(
    action: ActionRequest,
    result: ReceiptResult = { status: "ok" },
    aendern?: Aendern,
  ): Promise<void> {
    await this.#add({ type: "result", action, result }, aendern);
  }

  /** Export als Text (Kopfzeile mit dem öffentlichen Schlüssel, ohne Anker). */
  async text(): Promise<string> {
    let text = "";
    const header = {
      format: "pb-belege" as const,
      v: 1 as const,
      installationId: TEST_INSTALLATION,
      publicKeys: [keyInfo(this.key)],
    };
    for await (const line of exportJsonl(header, this.entries)) text += line;
    return text;
  }

  async #add(draft: Parameters<typeof buildReceipt>[0], aendern: Aendern | undefined) {
    const prev = this.entries.at(-1);
    const built = buildReceipt(draft, {
      id: newId("receipt"),
      seq: (prev?.seq ?? 0) + 1,
      time: new Date(Date.UTC(2026, 10, 21, 12, 0, this.#time++)).toISOString(),
      prev: prev?.hash ?? `sha256:${"0".repeat(64)}`,
      keyId: this.key.keyId,
    });
    const body = structuredClone(built) as unknown as Roh;
    aendern?.(body);
    const hash = await hashReceipt(body as unknown as ReceiptBody);
    this.entries.push({
      seq: built.seq,
      id: built.id,
      hash,
      signature: testSign(this.key.privateKey, digestBytes(hash)),
      keyId: this.key.keyId,
      body: body as unknown as ReceiptBody,
    });
  }
}

/**
 * Macht aus einer Entscheidung über `nachricht.senden`, wie dieser Stand sie schreibt (Fassung 2),
 * eine der Fassung 1: ohne Feld `gateFormat`, nur die fünf Grenzen von damals (G-16 bis G-18
 * entfallen bei dieser Aktion ohnehin). Die Fakten sind in beiden Fassungen gleich.
 */
export function alsFassung1(body: Roh): void {
  const decision = body.decision as Roh;
  delete decision.gateFormat;
  decision.limits = (decision.limits as unknown[]).slice(0, 5);
  // `botPaused` kennt erst Fassung 4.
  if (body.facts !== undefined) delete (body.facts as Roh).botPaused;
}

/** Setzt `decision.gateFormat` und ein Feld, das Fassung 1 nicht kennt. */
export function neuereFassung(body: Roh): void {
  const decision = body.decision as Roh;
  decision.gateFormat = 99;
  decision.caps = [{ name: "werkzeug_aufrufe", limit: 5 }];
}

/** Macht die Aktion zu einer, die es in Fassung 1 nicht gibt (Typ nach Muster). */
export function unbekannteAktion(body: Roh): void {
  (body.action as Roh).type = "werkzeug.irgendwas";
}

/** Ergebnis mit einem unbekannten Feld und einem unbekannten Fehlercode. */
export function neueresErgebnis(body: Roh): void {
  const result = body.result as Roh;
  result.code = "werkzeug_zeitlimit";
  result.spur = { schritte: 3 };
}

/**
 * Export einer neueren Fassung: Start, Entscheidung mit `gateFormat: 99`, unbekanntem Feld in
 * `decision` und unbekannter Aktion, Ergebnis mit unbekanntem Feld und unbekanntem Fehlercode.
 */
export async function ketteNeuereFassung(): Promise<TestKette> {
  const kette = await TestKette.neu();
  const action = await kette.decision(sendAction(), (body) => {
    neuereFassung(body);
    unbekannteAktion(body);
  });
  await kette.result(action, { status: "ok" }, (body) => {
    unbekannteAktion(body);
    neueresErgebnis(body);
  });
  return kette;
}

/** Entscheidung der Fassung 1 mit einem unbekannten Feld; mit `auchNeuere` dazu eine aus Fassung 99. */
export async function ketteUnbekanntesFeld(auchNeuere = false): Promise<TestKette> {
  const kette = await TestKette.neu();
  const action = await kette.decision(sendAction(), (body) => {
    alsFassung1(body);
    (body.decision as Roh).caps = [];
  });
  await kette.result(action);
  if (auchNeuere) {
    const neu = await kette.decision(sendAction(), neuereFassung);
    await kette.result(neu);
  }
  return kette;
}
