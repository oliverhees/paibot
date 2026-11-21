/**
 * PaiBot – Tests der Lese-Form der Belege: Form statt Inhalt, feste Grenzen für JSON, strenge
 * Schreib-Form und neue Stufe „nicht prüfbar“.
 *
 * @author    Oliver Hees
 * @link      https://paibot.de
 * @copyright 2026 Oliver Hees. Alle Urheberrechte liegen beim Autor.
 * @license   PaiBot Fair-Code-Lizenz 1.1 – siehe Datei LICENSE im Projektstamm
 * @since     2026-11-21
 */

import { describe, expect, it } from "vitest";
import { idSchema } from "./id";
import {
  actionReadSchema,
  BOUNDED_JSON_LIMITS,
  boundedJsonSchema,
  CHAIN_TRUST_LEVELS,
  chainVerdictSchema,
  receiptBodyReadSchema,
  receiptBodyWriteSchema,
} from "./receipts";

const keyId = idSchema("key").parse("sch_06f8k2m9qz3w7x1c4b5n8p0r2t");
const actionId = idSchema("action").parse("akt_06f8k2m9qz3w7x1c4b5n8p0r2t");
const conversationId = idSchema("conversation").parse("unt_06f8k2m9qz3w7x1c4b5n8p0r2t");
const messageId = idSchema("message").parse("nac_06f8k2m9qz3w7x1c4b5n8p0r2t");
const hex = "0123456789abcdef".repeat(4);

const common = {
  v: 1,
  id: "blg_06f8k2m9qz3w7x1c4b5n8p0r22",
  seq: 2,
  time: "2026-11-21T10:00:00.000Z",
  prev: `sha256:${hex}`,
  keyId,
};
const action = {
  actionId,
  type: "nachricht.senden",
  actor: "besitzer",
  target: { conversationId, messageId },
};
const decision = {
  ...common,
  type: "decision",
  action,
  decision: {
    outcome: "allow",
    stage: "execute",
    rules: [{ id: "R-001", version: 1 }],
    limits: [{ name: "laenge", result: "ok", value: 5 }],
    reason: "Grund.",
  },
  facts: {
    credential: "sitzung",
    inputChars: 5,
    maxInputChars: 32000,
    conversationExists: true,
    runActive: false,
    killSwitch: false,
  },
};
const result = { ...common, seq: 3, type: "result", action, result: { status: "ok" } };

function nested(depth: number): unknown {
  let value: unknown = 1;
  for (let i = 0; i < depth; i++) value = [value];
  return value;
}

describe("JSON mit festen Grenzen", () => {
  it("nimmt Werte bis an die Grenzen an und lehnt alles darüber ab", () => {
    expect(BOUNDED_JSON_LIMITS).toEqual({ depth: 8, text: 4000, items: 256, keys: 64 });
    const ok = (value: unknown) => boundedJsonSchema.safeParse(value).success;
    expect(ok(null) && ok(true) && ok(3) && ok("x".repeat(4000))).toBe(true);
    expect(ok("x".repeat(4001))).toBe(false);
    expect(ok(nested(8))).toBe(true);
    expect(ok(nested(9))).toBe(false);
    expect(ok(Array.from({ length: 256 }, () => 0))).toBe(true);
    expect(ok(Array.from({ length: 257 }, () => 0))).toBe(false);
    const keys = (n: number) =>
      Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, i]));
    expect(ok(keys(64))).toBe(true);
    expect(ok(keys(65))).toBe(false);
    expect(ok(undefined)).toBe(false);
    expect(ok(Number.NaN)).toBe(false);
    expect(ok(new Date())).toBe(false);
  });
});

describe("Lese-Form", () => {
  it("liest eine Entscheidung einer neueren Fassung mit unbekannten Feldern und unbekannter Aktion", () => {
    const neu = {
      ...decision,
      action: { ...action, type: "werkzeug.irgendwas", extra: { a: 1 } },
      decision: { ...decision.decision, gateFormat: 99, caps: [{ name: "x", limit: 5 }] },
      facts: { toolName: "notiz", killSwitch: false },
      neuesFeld: "wert",
    };
    expect(receiptBodyReadSchema.safeParse(neu).success).toBe(true);
    expect(receiptBodyWriteSchema.safeParse(neu).success).toBe(false);
  });

  it("liest ein Ergebnis mit unbekanntem Feld und unbekanntem Fehlercode", () => {
    const neu = { ...result, result: { status: "ok", code: "neuer_code", spur: { a: [1] } } };
    expect(receiptBodyReadSchema.safeParse(neu).success).toBe(true);
    expect(receiptBodyWriteSchema.safeParse(neu).success).toBe(false);
  });

  it("die Form bleibt streng: Fassung, Kennung, Typ, gemeinsame Felder, Grenzen", () => {
    const bad: unknown[] = [
      { ...decision, decision: { ...decision.decision, gateFormat: 0 } },
      { ...decision, decision: { ...decision.decision, gateFormat: 1001 } },
      { ...decision, decision: { ...decision.decision, gateFormat: "2" } },
      { ...decision, action: { ...action, actionId: "akt_x" } },
      { ...decision, action: { ...action, type: "Werkzeug" } },
      { ...decision, action: { ...action, type: "ohnepunkt" } },
      { ...decision, action: { ...action, type: `a.${"b".repeat(63)}` } },
      { ...decision, v: 2 },
      { ...decision, time: "gestern" },
      { ...decision, facts: { ...decision.facts, text: "x".repeat(201) } },
      { ...decision, extra: "x".repeat(4001) },
      { ...result, result: { status: "x".repeat(33) } },
      { ...result, result: {} },
      { ...decision, type: "unbekannt" },
    ];
    for (const value of bad) expect(receiptBodyReadSchema.safeParse(value).success).toBe(false);
  });

  it("Aktion beim Lesen: Akteur und Ziel nur als JSON", () => {
    expect(actionReadSchema.safeParse({ ...action, actor: { art: "werkzeug" } }).success).toBe(
      true,
    );
    expect(actionReadSchema.safeParse({ ...action, target: undefined }).success).toBe(false);
  });

  it("Fassung 1 ohne Feld besteht nur noch die Lese-Form; die Schreib-Form verlangt Fassung 2", () => {
    expect(receiptBodyReadSchema.safeParse(decision).success).toBe(true);
    expect(receiptBodyWriteSchema.safeParse(decision).success).toBe(false);
    const mitFeld = { ...decision, decision: { ...decision.decision, gateFormat: 1 } };
    expect(receiptBodyReadSchema.safeParse(mitFeld).success).toBe(true);
    expect(receiptBodyWriteSchema.safeParse(mitFeld).success).toBe(false);
    const zwei = {
      ...decision,
      decision: { ...decision.decision, gateFormat: 2, preconditions: [] },
    };
    expect(receiptBodyReadSchema.safeParse(zwei).success).toBe(true);
    expect(receiptBodyWriteSchema.safeParse(zwei).success).toBe(true);
    const { preconditions: _p, ...ohneVorbedingungen } = zwei.decision;
    expect(
      receiptBodyWriteSchema.safeParse({ ...zwei, decision: ohneVorbedingungen }).success,
    ).toBe(false);
  });
});

describe("Urteil", () => {
  it("kennt die Stufe nicht_pruefbar und Hinweise", () => {
    expect(CHAIN_TRUST_LEVELS).toEqual([
      "vertrauenswuerdig",
      "vertrauen_gebrochen",
      "nicht_pruefbar",
      "ungueltig",
    ]);
    const verdict = {
      level: "nicht_pruefbar",
      findings: [{ problem: "fassung_unbekannt", seq: 2 }],
      anchor: "fehlt",
      notes: [{ note: "fassung_rueckschritt", seq: 4 }],
    };
    expect(chainVerdictSchema.parse(verdict)).toEqual(verdict);
    expect(
      chainVerdictSchema.safeParse({ ...verdict, notes: [{ note: "anders", seq: 1 }] }).success,
    ).toBe(false);
  });
});
