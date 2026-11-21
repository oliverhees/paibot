/**
 * PaiBot – Tests für Prüfsumme und Aufbau eines Belegs.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { createHash } from "node:crypto";
import { isPaiBotError } from "@paibot/shared/fehler";
import { newId } from "@paibot/shared/ids";
import { describe, expect, it } from "vitest";
import { buildReceipt, type ChainLink } from "./build";
import { canonicalize } from "./canonical";
import { digestBytes, hashReceipt, RECEIPT_HASH_PREFIX } from "./hash";
import { sendAction, sendFacts, testEvaluate, testKey } from "./testhilfen";

function link(seq = 2): ChainLink {
  return {
    id: newId("receipt"),
    seq,
    time: "2026-11-20T10:00:00.000Z",
    prev: `sha256:${"ab".repeat(32)}`,
    keyId: newId("key"),
  };
}

describe("buildReceipt", () => {
  it("baut eine Entscheidung mit v 1 und decision.rules statt matchedRules", () => {
    const action = sendAction();
    const facts = sendFacts();
    const decision = testEvaluate(action, facts);
    const body = buildReceipt({ type: "decision", action, decision, facts }, link());
    expect(body).toMatchObject({
      v: 1,
      seq: 2,
      type: "decision",
      decision: { outcome: "allow", stage: "execute", rules: [{ id: "R-001", version: 1 }] },
      facts: { inputChars: 812 },
    });
    expect(body).not.toHaveProperty("decision.matchedRules");
    expect(body).not.toHaveProperty("context");
    expect(body).not.toHaveProperty("undo");
    expect(JSON.stringify(body)).not.toContain("null");
  });

  it("lässt optionale Felder weg statt sie leer zu setzen", () => {
    const action = { ...sendAction(), type: "schleuse.umschalten" as const };
    const body = buildReceipt(
      {
        type: "result",
        action: {
          actionId: action.actionId,
          type: "schleuse.umschalten",
          actor: "besitzer",
          target: { conversationId: undefined },
        },
        result: { status: "ok", code: undefined },
        undo: undefined,
      },
      link(),
    );
    expect(canonicalize(body as never)).not.toContain("conversationId");
    expect(body).not.toHaveProperty("result.code");
    expect(body).not.toHaveProperty("undo");
  });

  it("baut Start und Schlüsselwechsel", () => {
    const key = testKey();
    const start = buildReceipt(
      {
        type: "start",
        facts: {
          installationId: newId("installation"),
          publicKey: key.publicKey,
          software: "0.3.0+dev",
        },
      },
      { ...link(1), prev: `sha256:${"0".repeat(64)}`, keyId: key.keyId },
    );
    expect(start.type).toBe("start");
    const next = testKey();
    const change = buildReceipt(
      {
        type: "key_change",
        facts: {
          newKeyId: next.keyId,
          publicKey: next.publicKey,
          previousKeyId: key.keyId,
          signedBy: "previous",
        },
      },
      { ...link(5), keyId: key.keyId },
    );
    expect(change).toMatchObject({ type: "key_change", keyId: key.keyId });
  });

  it("weist Gleitkommazahlen in den Fakten ab", () => {
    const action = sendAction();
    const facts = { ...sendFacts(), inputChars: 812.5 };
    let caught: unknown;
    try {
      buildReceipt(
        {
          type: "decision",
          action,
          decision: testEvaluate(action, sendFacts()),
          facts,
        },
        link(),
      );
    } catch (error) {
      caught = error;
    }
    expect(isPaiBotError(caught) && caught.code).toBe("eingabe_ungueltig");
  });

  it("weist Fakten ab, die nicht zur Aktion passen, und einen Schlüsselwechsel mit falschem Signierer", () => {
    const action = sendAction();
    const decision = testEvaluate(action, sendFacts());
    expect(() =>
      buildReceipt({ type: "decision", action, decision, facts: { inhalt: "Hallo" } }, link()),
    ).toThrow();
    const key = testKey();
    const next = testKey();
    expect(() =>
      buildReceipt(
        {
          type: "key_change",
          facts: {
            newKeyId: next.keyId,
            publicKey: next.publicKey,
            previousKeyId: key.keyId,
            signedBy: "new",
          },
        },
        { ...link(3), keyId: key.keyId },
      ),
    ).toThrow();
  });
});

describe("hashReceipt", () => {
  it("rechnet SHA-256 über Präfix und kanonische Form", async () => {
    const action = sendAction();
    const facts = sendFacts();
    const body = buildReceipt(
      { type: "decision", action, decision: testEvaluate(action, facts), facts },
      link(),
    );
    const expected = createHash("sha256")
      .update(Buffer.from(RECEIPT_HASH_PREFIX, "utf8"))
      .update(Buffer.from(canonicalize(body as never), "utf8"))
      .digest("hex");
    expect(await hashReceipt(body)).toBe(`sha256:${expected}`);
  });

  it("hängt nicht von der Reihenfolge der Schlüssel ab", async () => {
    const action = sendAction();
    const facts = sendFacts();
    const body = buildReceipt(
      { type: "decision", action, decision: testEvaluate(action, facts), facts },
      link(),
    );
    const reversed = Object.fromEntries(Object.entries(body).reverse()) as typeof body;
    expect(await hashReceipt(reversed)).toBe(await hashReceipt(body));
  });

  it("das Präfix ist Teil der Prüfsumme", async () => {
    const action = sendAction();
    const facts = sendFacts();
    const body = buildReceipt(
      { type: "decision", action, decision: testEvaluate(action, facts), facts },
      link(),
    );
    const plain = createHash("sha256")
      .update(canonicalize(body as never))
      .digest("hex");
    expect(await hashReceipt(body)).not.toBe(`sha256:${plain}`);
  });
});

describe("digestBytes", () => {
  it("liefert die 32 Rohbyte", () => {
    const bytes = digestBytes(`sha256:${"0f".repeat(31)}ff`);
    expect(bytes.length).toBe(32);
    expect(bytes[0]).toBe(15);
    expect(bytes[31]).toBe(255);
  });

  it("weist andere Formen mit TypeError ab", () => {
    for (const value of [
      "",
      `sha256:${"0".repeat(63)}`,
      `sha256:${"A".repeat(64)}`,
      "0".repeat(64),
    ]) {
      expect(() => digestBytes(value)).toThrow(TypeError);
    }
  });
});
