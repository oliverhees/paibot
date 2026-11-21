/**
 * PaiBot – Test: `buildReceipt` prüft nur mit dem strengen Schreib-Schema. Hier wird die Prüfung
 * der Fassung umgangen (`GATE_FORMAT` im Test auf 99 gesetzt); eine Entscheidung mit
 * `gateFormat: 99` und beliebigen Fakten wird trotzdem abgewiesen.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { isPaiBotError } from "@paibot/shared/fehler";
import { newId } from "@paibot/shared/ids";
import { GATE_FORMAT } from "@paibot/shared/tor";
import { describe, expect, it, vi } from "vitest";
import { buildReceipt } from "./build";

vi.mock("@paibot/shared/tor", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@paibot/shared/tor")>()),
  GATE_FORMAT: 99,
}));

function link() {
  return {
    id: newId("receipt"),
    seq: 2,
    time: "2026-11-21T10:00:00.000Z",
    prev: `sha256:${"ab".repeat(32)}`,
    keyId: newId("key"),
  };
}

// Ohne die Test-Hilfen und ohne das Tor: beide lesen GATE_FORMAT schon beim Laden.
function sendAction() {
  return {
    actionId: newId("action"),
    type: "nachricht.senden" as const,
    actor: "besitzer" as const,
    target: { conversationId: newId("conversation"), messageId: newId("message") },
  };
}

function sendFacts() {
  return {
    credential: "sitzung",
    inputChars: 12,
    maxInputChars: 32000,
    conversationExists: true,
    runActive: false,
    killSwitch: false,
  };
}

function testDecision(_action: unknown, _facts: unknown) {
  return {
    outcome: "allow" as const,
    stage: "execute" as const,
    matchedRules: [{ id: "R-001", version: 1, hash: `sha256:${"cd".repeat(32)}` }],
    limits: [{ name: "laenge" as const, result: "ok" as const, value: 12 }],
    preconditions: [],
    ruleStand: 1,
    reason: "Der Besitzer handelt selbst.",
    gateFormat: 1,
  };
}

function codeOf(fn: () => unknown): unknown {
  try {
    fn();
  } catch (error) {
    return isPaiBotError(error) ? error.code : error;
  }
  return "geschrieben";
}

describe("buildReceipt ohne die Prüfung der Fassung", () => {
  it("die Prüfung der Fassung ist hier wirklich umgangen", () => {
    expect(GATE_FORMAT).toBe(99);
    const action = sendAction();
    const facts = sendFacts();
    // Fassung 1 passt jetzt nicht mehr zu GATE_FORMAT und fällt schon an der Prüfung der Fassung.
    expect(
      codeOf(() =>
        buildReceipt(
          { type: "decision", action, decision: testDecision(action, facts), facts },
          link(),
        ),
      ),
    ).toBe("eingabe_ungueltig");
  });

  it("gateFormat 99 mit beliebigen Fakten: das Schreib-Schema weist ab", () => {
    const action = sendAction();
    const facts = sendFacts();
    const decision = { ...testDecision(action, facts), gateFormat: 99 };
    for (const beleg of [facts, { beliebig: 1, werkzeug: "irgendwas" }]) {
      expect(
        codeOf(() => buildReceipt({ type: "decision", action, decision, facts: beleg }, link())),
      ).toBe("eingabe_ungueltig");
    }
  });
});
