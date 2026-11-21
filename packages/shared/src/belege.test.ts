/**
 * PaiBot – Tests für das Format der Belege: Körper je Typ, gespeicherter Eintrag und Export-Kopf.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-20
 */

import { describe, expect, it } from "vitest";
import { idSchema } from "./id";
import {
  type ReceiptBody,
  receiptBodyWriteSchema,
  receiptEntryReadSchema,
  receiptExportHeaderSchema,
  ZERO_PREV,
} from "./receipts";

const keyId = idSchema("key").parse("sch_06f8k2m9qz3w7x1c4b5n8p0r2t");
const newKeyId = idSchema("key").parse("sch_06f8k2m9qz3w7x1c4b5n8p0r2v");
const installationId = idSchema("installation").parse("ins_06f8k2m9qz3w7x1c4b5n8p0r2t");
const actionId = idSchema("action").parse("akt_06f8k2m9qz3w7x1c4b5n8p0r2t");
const conversationId = idSchema("conversation").parse("unt_06f8k2m9qz3w7x1c4b5n8p0r2t");
const messageId = idSchema("message").parse("nac_06f8k2m9qz3w7x1c4b5n8p0r2t");
const receiptId = (n: number) => idSchema("receipt").parse(`blg_06f8k2m9qz3w7x1c4b5n8p0r2${n}`);
const publicKey = `${"A".repeat(42)}E`;
const signature = `${"b".repeat(85)}w`;
const hex = "0123456789abcdef".repeat(4);
const time = "2026-11-20T10:00:00.000Z";

const start: ReceiptBody = {
  v: 1,
  id: receiptId(1),
  seq: 1,
  time,
  type: "start",
  facts: { installationId, publicKey, software: "0.3.0+dev" },
  prev: ZERO_PREV,
  keyId,
};

const action = {
  actionId,
  type: "nachricht.senden",
  actor: "besitzer",
  target: { conversationId, messageId },
} as const;

const decision: ReceiptBody = {
  v: 1,
  id: receiptId(2),
  seq: 2,
  time,
  type: "decision",
  action,
  decision: {
    outcome: "allow",
    stage: "execute",
    rules: [{ id: "R-001", version: 1 }],
    limits: [{ name: "laenge", result: "ok", value: 5 }],
    reason: "Besitzer verwaltet seine Installation",
  },
  facts: {
    credential: "sitzung",
    inputChars: 5,
    maxInputChars: 32000,
    conversationExists: true,
    runActive: false,
    killSwitch: false,
  },
  context: { digest: `hmac-sha256:${hex}` },
  prev: `sha256:${hex}`,
  keyId,
};

const result: ReceiptBody = {
  v: 1,
  id: receiptId(3),
  seq: 3,
  time,
  type: "result",
  action,
  result: { status: "ok" },
  undo: { possible: false },
  prev: `sha256:${hex}`,
  keyId,
};

const keyChange: ReceiptBody = {
  v: 1,
  id: receiptId(4),
  seq: 4,
  time,
  type: "key_change",
  facts: { newKeyId, publicKey, previousKeyId: keyId, signedBy: "previous" },
  prev: `sha256:${hex}`,
  keyId,
};

describe("Beleg-Körper", () => {
  it("nimmt alle vier Typen an", () => {
    for (const body of [start, decision, result, keyChange]) {
      expect(receiptBodyWriteSchema.parse(body)).toEqual(body);
      expect(receiptBodyWriteSchema.parse(JSON.parse(JSON.stringify(body)))).toEqual(body);
    }
  });

  it("Schlüsselwechsel nennt den neuen Schlüssel und wer signiert hat", () => {
    const vomNeuen = {
      ...keyChange,
      keyId: newKeyId,
      facts: { newKeyId, publicKey, previousKeyId: keyId, signedBy: "new" },
    };
    const ohneAlten = { ...vomNeuen, facts: { newKeyId, publicKey, signedBy: "new" } };
    for (const body of [vomNeuen, ohneAlten]) {
      expect(receiptBodyWriteSchema.parse(body)).toEqual(body);
    }

    const bad: unknown[] = [
      { ...keyChange, facts: { publicKey, previousKeyId: keyId } },
      { ...keyChange, facts: { ...keyChange.facts, signedBy: "beide" } },
      { ...keyChange, keyId: newKeyId },
      { ...vomNeuen, keyId },
      { ...keyChange, facts: { newKeyId, publicKey, signedBy: "previous" } },
      { ...keyChange, facts: { ...keyChange.facts, newKeyId: keyId } },
    ];
    for (const value of bad) expect(receiptBodyWriteSchema.safeParse(value).success).toBe(false);
  });

  it("beginnt die Kette mit 64 Nullen", () => {
    expect(ZERO_PREV).toBe(`sha256:${"0".repeat(64)}`);
  });

  it("lehnt null, Gleitkommazahlen, falsche Prüfsummen und Inhalte ab", () => {
    const bad: unknown[] = [
      { ...start, v: 2 },
      { ...start, seq: 0 },
      { ...start, prev: `sha256:${hex.toUpperCase()}` },
      { ...start, prev: `sha256:${hex.slice(1)}` },
      { ...start, time: "2026-11-20T10:00:00.000+01:00" },
      { ...start, facts: { installationId, publicKey: `${"A".repeat(42)}B`, software: "dev" } },
      { ...start, keyId: installationId },
      { ...result, undo: null },
      { ...result, result: { status: "ok", tokens: { input: 1.5, output: 2 } } },
      { ...result, result: { status: "fertig" } },
      { ...result, result: { status: "ok", digest: `sha256:${hex}` } },
      { ...decision, facts: { ...decision.facts, inputChars: 4.5 } },
      { ...decision, facts: { ...decision.facts, text: "Hallo" } },
      { ...decision, context: { digest: `sha256:${hex}` } },
      { ...decision, decision: undefined },
      { ...decision, type: "result" },
    ];
    for (const value of bad) expect(receiptBodyWriteSchema.safeParse(value).success).toBe(false);
  });
});

describe("gespeicherter Eintrag und Export", () => {
  it("passt zum Körper", () => {
    const entry = {
      seq: 2,
      id: receiptId(2),
      hash: `sha256:${hex}`,
      signature,
      keyId,
      body: decision,
    };
    expect(Object.keys(receiptEntryReadSchema.parse(entry))).toEqual([
      "seq",
      "id",
      "hash",
      "signature",
      "keyId",
      "body",
    ]);
    expect(receiptEntryReadSchema.safeParse({ ...entry, seq: 3 }).success).toBe(false);
    expect(receiptEntryReadSchema.safeParse({ ...entry, signature: `${signature}A` }).success).toBe(
      false,
    );
  });

  it("Kopfzeile nennt Installation und Schlüssel", () => {
    const header = {
      format: "pb-belege",
      v: 1,
      installationId,
      publicKeys: [{ keyId, publicKey, fingerprint: "3f9c-2ab1-77d0-e4c5" }],
    };
    expect(receiptExportHeaderSchema.parse(header)).toEqual(header);
    expect(
      receiptExportHeaderSchema.safeParse({
        ...header,
        publicKeys: [{ keyId, publicKey, fingerprint: "3F9C-2AB1-77D0-E4C5" }],
      }).success,
    ).toBe(false);
  });
});
