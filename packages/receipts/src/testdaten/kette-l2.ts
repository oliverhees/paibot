/**
 * PaiBot – Test-Kette mit Belegen der Tor-Fassung 2 (nur Tests): jede gespeicherte Aktion,
 * ein gedeckelter Werkzeug-Aufruf und Ergebnisse mit allen Feldern der Fassung 2.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { createGate, denialCode, type Execute, evaluate, ruleSnapshot } from "@paibot/gate";
import { type ActionRequest, type ActionType, STORED_ACTION_TYPES } from "@paibot/shared/aktionen";
import { RECEIPT_CHAIN_FORMAT, type ReceiptBody, type ReceiptEntry } from "@paibot/shared/belege";
import { isPaiBotError } from "@paibot/shared/fehler";
import { newId } from "@paibot/shared/ids";
import type { RuleDefinition, RuleSnapshot } from "@paibot/shared/tor";
import { sampleAction, sampleFacts } from "../../../gate/src/testdaten";
import { digestBytes, hashReceipt } from "../hash";
import { exportJsonl } from "../jsonl";
import { keyInfo, signedEntry, TEST_INSTALLATION, testKey, testSign } from "../testhilfen";

/** Regel des Besitzers für Werkzeug-Aufrufe (eigener Regelstand ohne Standard-Regeln). */
export const WERKZEUG_ERLAUBT: RuleDefinition = {
  id: "reg_01m7zempyq9rbb8ybyt536hjy0" as RuleDefinition["id"],
  version: 1,
  action: "werkzeug.aufrufen",
  effect: "allow",
  stage: "execute",
  conditions: [{ fact: "akteur", op: "eq", value: "bot" }],
  priority: 1000,
  source: "owner",
  enabled: true,
  title: "Werkzeuge erlaubt",
  reason: "Test: Werkzeuge sind erlaubt.",
};

const BESITZER_ERLAUBT: RuleDefinition = {
  ...WERKZEUG_ERLAUBT,
  id: "reg_01m7zempyq9rbb8ybyt536hjy1" as RuleDefinition["id"],
  action: "*",
  conditions: [{ fact: "akteur", op: "eq", value: "besitzer" }],
  title: "Besitzer erlaubt",
  reason: "Test: Der Besitzer darf alles.",
};

const MODELL_ERLAUBT: RuleDefinition = {
  ...WERKZEUG_ERLAUBT,
  id: "reg_01m7zempyq9rbb8ybyt536hjy2" as RuleDefinition["id"],
  action: "modell.anfragen",
  title: "Modell erlaubt",
  reason: "Test: Der Bot darf das Modell fragen.",
};

/**
 * Regelstand der Kette: nur eigene Regeln, damit auch ein erlaubter Werkzeug-Aufruf vorkommt und
 * der Deckel greift (mit den Standard-Regeln fragt R-005 schon vorher).
 */
const REGELN = [WERKZEUG_ERLAUBT, BESITZER_ERLAUBT, MODELL_ERLAUBT];

/** Die Kette, ihr Export und die Regeln zum Nachrechnen. */
export interface KetteL2 {
  entries: ReceiptEntry[];
  text: string;
  rules: RuleSnapshot["rules"];
}

type Schritt = {
  type: ActionType;
  facts: Record<string, unknown>;
  result: Record<string, unknown>;
};

function schritte(): Schritt[] {
  const list: Schritt[] = STORED_ACTION_TYPES.map((type) => ({
    type,
    facts: sampleFacts(type) as Record<string, unknown>,
    result: { status: "ok" },
  }));
  list.push({
    type: "werkzeug.aufrufen",
    facts: {
      ...(sampleFacts("werkzeug.aufrufen") as Record<string, unknown>),
      untrustedInput: true,
      toolKind: "schreiben",
    },
    result: { status: "ok" },
  });
  list.push({
    type: "modell.anfragen",
    facts: sampleFacts("modell.anfragen") as Record<string, unknown>,
    result: {
      status: "ok",
      digest: `hmac-sha256:${"3c".repeat(32)}`,
      tokens: { input: 812, output: 120 },
      servedBy: { provider: "tensorix", model: "mistral-small-3.2" },
      modelReported: "mistral-small-3.2-2506",
    },
  });
  list.push({
    type: "werkzeug.aufrufen",
    facts: { ...(sampleFacts("werkzeug.aufrufen") as Record<string, unknown>) },
    result: {
      status: "ok",
      digest: `hmac-sha256:${"4d".repeat(32)}`,
      docStand: "0.3.0",
      found: 3,
    },
  });
  return list;
}

/**
 * Baut die Kette. `art`:
 * - `"tor"`: durch das echte Tor und den Schreiber (`buildReceipt` prüft jeden Beleg);
 * - `"roh"`: Entscheidungen mit `evaluate`, Körper direkt signiert (für Tests, in denen das Tor
 *   die Fassung 2 nicht kennen soll und der Schreiber deshalb nicht schreiben kann).
 */
export async function ketteL2(art: "tor" | "roh"): Promise<KetteL2> {
  const key = testKey();
  const entries: ReceiptEntry[] = [];
  let tick = 0;
  const time = () => new Date(Date.UTC(2026, 10, 21, 13, 0, 0, ++tick));
  const current: RuleSnapshot = await ruleSnapshot(REGELN);

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

  const roh = async (body: Record<string, unknown>) => {
    const prev = entries.at(-1) as ReceiptEntry;
    const full = {
      ...body,
      v: 1,
      id: newId("receipt"),
      seq: prev.seq + 1,
      time: time().toISOString(),
      prev: prev.hash,
      keyId: key.keyId,
    };
    const hash = await hashReceipt(full as unknown as ReceiptBody);
    entries.push({
      seq: full.seq,
      id: full.id,
      hash,
      signature: testSign(key.privateKey, digestBytes(hash)),
      keyId: key.keyId,
      body: full as unknown as ReceiptBody,
    });
  };

  const gate = createGate({
    rules: { load: async () => current },
    clock: { now: time },
    receipts: {
      appendDecision: async (record) => {
        const entry = await signedEntry(
          {
            type: "decision",
            action: record.action,
            decision: record.decision,
            facts: record.facts as Record<string, unknown>,
          },
          entries.at(-1),
          key,
          time(),
        );
        entries.push(entry);
        return { receiptId: entry.id, seq: entry.seq };
      },
      appendResult: async (record) => {
        const entry = await signedEntry(
          { type: "result", action: record.action, result: record.result },
          entries.at(-1),
          key,
          time(),
        );
        entries.push(entry);
        return { receiptId: entry.id, seq: entry.seq };
      },
    },
  });

  for (const schritt of schritte()) {
    const action = sampleAction(schritt.type) as ActionRequest;
    if (art === "tor") {
      const execute: Execute<never, string> = async () => ({
        value: "fertig",
        result: schritt.result as never,
      });
      try {
        await gate.run(action as never, schritt.facts as never, execute);
      } catch (error) {
        if (!isPaiBotError(error)) throw error;
      }
      continue;
    }
    const decided = evaluate(action, schritt.facts as never, current) as unknown as Record<
      string,
      unknown
    >;
    const { matchedRules, ...rest } = decided;
    await roh({
      type: "decision",
      action,
      decision: { gateFormat: 2, ...rest, rules: matchedRules },
      facts: schritt.facts,
    });
    const allowed = decided.outcome === "allow";
    await roh({
      type: "result",
      action,
      result: allowed ? schritt.result : { status: "denied", code: denialCode(decided as never) },
    });
  }

  let text = "";
  for await (const line of exportJsonl(
    {
      format: "pb-belege",
      v: 1,
      installationId: TEST_INSTALLATION,
      publicKeys: [keyInfo(key)],
    },
    entries,
  )) {
    text += line;
  }
  return { entries, text, rules: current.rules };
}
