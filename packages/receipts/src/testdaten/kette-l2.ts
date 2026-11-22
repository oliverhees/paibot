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
import {
  ACTIVE_STANDARD_RULES,
  GATE_FORMAT,
  type RuleDefinition,
  type RuleSnapshot,
} from "@paibot/shared/tor";
import { TEAM_ACTION_TYPES } from "@paibot/shared/tor-fassung-4";
import { sampleAction, sampleFacts } from "../../../gate/src/testdaten";
import { digestBytes, hashReceipt } from "../hash";
import { exportJsonl } from "../jsonl";
import { keyInfo, signedEntry, TEST_INSTALLATION, testKey, testSign } from "../testhilfen";

/**
 * Eigene Regel für den gedeckelten Werkzeug-Aufruf (schreibend, mit fremden Inhalten). Im Betrieb
 * steht R-005 („fragen“) vor jeder eigenen Regel, das Tor entscheidet so nie „erlaubt“ und der
 * Deckel greift nicht. Der Deckel steht deshalb am Ende der Kette, mit `evaluate` entschieden und
 * roh angehängt. Die Regel liegt vor R-005 (Priorität 10), nur im Regelstand zum Nachrechnen.
 */
export const WERKZEUG_ERLAUBT: RuleDefinition = {
  id: "reg_01m7zempyq9rbb8ybyt536hjy0" as RuleDefinition["id"],
  version: 1,
  action: "werkzeug.aufrufen",
  effect: "allow",
  stage: "execute",
  conditions: [{ fact: "akteur", op: "eq", value: "bot" }],
  priority: 10,
  source: "owner",
  enabled: true,
  title: "Werkzeuge erlaubt",
  reason: "Test: Werkzeuge sind erlaubt.",
};

/** Regelstand, durch den das Tor entscheidet: die aktiven Standard-Regeln, wie aus der Datenbank. */
const REGELN_TOR: readonly RuleDefinition[] = ACTIVE_STANDARD_RULES;

/** Kennung, die R-010 erlaubt (lesend, intern, eingebaut). */
const DOKU_KENNUNG = "eingebaut/doku.nachschlagen";

/** Die Kette, ihr Export und die Regeln zum Nachrechnen. */
export interface KetteL2 {
  entries: ReceiptEntry[];
  text: string;
  rules: RuleSnapshot["rules"];
}

type Schritt = {
  /** Mit `evaluate` und `WERKZEUG_ERLAUBT` entschieden und roh angehängt (nie durch das Tor). */
  deckel?: boolean;
  type: ActionType;
  facts: Record<string, unknown>;
  result: Record<string, unknown>;
};

/** Fakten der Beispiele; die rohe Kette (Fassung 2) kennt `botPaused` noch nicht (Fassung 4). */
function beispielFakten(type: ActionType, roh: boolean): Record<string, unknown> {
  const fakten = sampleFacts(type) as Record<string, unknown>;
  if (!roh) return fakten;
  const { botPaused: _botPaused, ...ohne } = fakten;
  return ohne;
}

function schritte(roh: boolean): Schritt[] {
  // Die Aktionen für Apps (Fassung 3) und für Teams (Fassung 4) gehören zu späteren Fassungen; diese
  // Kette zeigt, was ein Stand mit Fassung 1 liest.
  const list: Schritt[] = STORED_ACTION_TYPES.filter(
    (type) => !type.startsWith("app.") && !(TEAM_ACTION_TYPES as readonly string[]).includes(type),
  ).map((type) => ({
    type,
    facts: beispielFakten(type, roh),
    result: { status: "ok" },
  }));
  list.push({
    type: "modell.anfragen",
    facts: beispielFakten("modell.anfragen", roh),
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
    facts: {
      ...beispielFakten("werkzeug.aufrufen", roh),
      toolKey: DOKU_KENNUNG,
    },
    result: {
      status: "ok",
      digest: `hmac-sha256:${"4d".repeat(32)}`,
      docStand: "0.3.0",
      found: 3,
    },
  });
  list.push({
    deckel: true,
    type: "werkzeug.aufrufen",
    facts: {
      ...beispielFakten("werkzeug.aufrufen", roh),
      untrustedInput: true,
      toolKind: "schreiben",
    },
    result: { status: "ok" },
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
  const current: RuleSnapshot = await ruleSnapshot(REGELN_TOR);
  // Regelstand mit der eigenen Regel für den Deckel (Nummer 9, hinter dem Stand des Tors).
  const mitDeckel: RuleSnapshot = await ruleSnapshot([...REGELN_TOR, WERKZEUG_ERLAUBT]);

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

  for (const schritt of schritte(art === "roh")) {
    const action = sampleAction(schritt.type) as ActionRequest;
    if (art === "tor" && !schritt.deckel) {
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
    const regeln = schritt.deckel ? mitDeckel : current;
    // Durch das echte Tor gilt die aktuelle Fassung; die rohe Kette bleibt bei Fassung 2.
    const format = art === "tor" ? GATE_FORMAT : 2;
    const decided = evaluate(action, schritt.facts as never, regeln, {
      format,
    }) as unknown as Record<string, unknown>;
    const { matchedRules, ...rest } = decided;
    await roh({
      type: "decision",
      action,
      decision: { gateFormat: format, ...rest, rules: matchedRules },
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
  return { entries, text, rules: mitDeckel.rules };
}
